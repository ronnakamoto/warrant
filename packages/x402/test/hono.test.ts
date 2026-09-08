import assert from "node:assert/strict";
import { Hono } from "hono";
import { FETCH, hashChallenge, type IVerifier } from "@ronnakamoto/warrant-core";
import { decodePaymentRequiredHeader, encodePaymentResponseHeader } from "@x402/core/http";
import {
  createWarrantShop,
  initializeWarrantShop,
  mockHederaFacilitator,
} from "../src/shop.ts";
import { FixedRootChecker } from "../src/roots.ts";
import { MemoryNullifierStore } from "../src/nullifiers.ts";
import { warrantHono, type WarrantAuditEvent } from "../src/hono.ts";

const liveRoot = 111n;
const verifierOk: IVerifier = { async verify() { return true; } };

describe("warrantHono", function () {
  it("stashes JSON so the free path hashes the real body", async function () {
    const shop = createWarrantShop({
      route: "POST /v1/echo",
      policy: { requireScope: FETCH, minTier: 0, freeCallsPerHuman: 3 },
      amount: "100000",
      payTo: "0.0.10311260",
      verifier: verifierOk,
      roots: new FixedRootChecker(liveRoot),
      getMerkleRoot: () => String(liveRoot),
      nullifiers: new MemoryNullifierStore(),
      facilitatorClient: mockHederaFacilitator(),
      defaultPath: "/v1/echo",
    });
    await initializeWarrantShop(shop);
    const app = new Hono();
    app.use("/v1/*", warrantHono(shop));
    app.post("/v1/echo", (c) => c.json({ ok: true }));

    const first = await app.request("http://echo.test/v1/echo", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "hi" }),
    });
    assert.equal(first.status, 402);
    const required = decodePaymentRequiredHeader(first.headers.get("PAYMENT-REQUIRED") ?? "");
    const info = (required as { extensions?: { warrant?: { info?: { nonce: string; merkleRoot: string } } } })
      .extensions?.warrant?.info;
    assert.ok(info?.nonce);

    const { bodyHashFromCanonical } = await import("@ronnakamoto/warrant-core");
    const bodyHash = bodyHashFromCanonical({ text: "hi" });
    const ch = {
      method: "POST",
      path: "/v1/echo",
      nonce: info.nonce,
      merkleRoot: info.merkleRoot,
      amount: "100000",
      payTo: "0.0.10311260",
      bodyHash,
    };
    const p = {
      merkleRoot: liveRoot,
      contextHash: 99n,
      nullifier: 7n,
      effectiveScope: FETCH,
      effectiveBudgetCap: 1n,
      minExpiry: 1n,
      tier: 0n,
      requestHash: hashChallenge(ch),
    };
    const warrant = JSON.stringify({
      proof: { pi_a: [], pi_b: [], pi_c: [] },
      publicSignals: [
        p.merkleRoot, p.contextHash, p.nullifier, p.effectiveScope,
        p.effectiveBudgetCap, p.minExpiry, p.tier, p.requestHash,
      ].map(String),
      nonce: info.nonce,
    });
    const second = await app.request("http://echo.test/v1/echo", {
      method: "POST",
      headers: { "content-type": "application/json", warrant },
      body: JSON.stringify({ text: "hi" }),
    });
    assert.equal(second.status, 200);
    assert.deepEqual(await second.json(), { ok: true });
  });

  it("merges PAYMENT-RESPONSE txId onto JSON after settle and still audits", async function () {
    const shop = createWarrantShop({
      route: "POST /v1/echo",
      policy: { requireScope: FETCH, minTier: 0, freeCallsPerHuman: 3 },
      amount: "100000",
      payTo: "0.0.10311260",
      verifier: verifierOk,
      roots: new FixedRootChecker(liveRoot),
      getMerkleRoot: () => String(liveRoot),
      nullifiers: new MemoryNullifierStore(),
      facilitatorClient: mockHederaFacilitator(),
      defaultPath: "/v1/echo",
    });
    await initializeWarrantShop(shop);

    const txId = "0.0.98@1788502420.541125170";
    const payHdr = encodePaymentResponseHeader({
      success: true,
      transaction: txId,
      network: "hedera:testnet",
    });
    shop.http.processHTTPRequest = (async () => ({
      type: "payment-verified" as const,
      cancellationDispatcher: { cancel: async () => undefined },
      paymentPayload: {} as never,
      paymentRequirements: {} as never,
    })) as typeof shop.http.processHTTPRequest;
    shop.http.processSettlement = (async () => ({
      success: true as const,
      transaction: txId,
      network: "hedera:testnet" as const,
      headers: { "PAYMENT-RESPONSE": payHdr },
      requirements: {} as never,
    })) as typeof shop.http.processSettlement;

    const audited: WarrantAuditEvent[] = [];
    const app = new Hono();
    app.use(
      "/v1/*",
      warrantHono(shop, { audit: async (event) => { audited.push(event); } }),
    );
    app.post("/v1/echo", (c) => c.json({ ok: true }));

    const warrant = JSON.stringify({
      proof: { pi_a: [], pi_b: [], pi_c: [] },
      publicSignals: ["1", "2", "7", "1", "1", "1", "0", "1"],
    });
    const res = await app.request("http://echo.test/v1/echo", {
      method: "POST",
      headers: { "content-type": "application/json", warrant },
      body: JSON.stringify({ text: "hi" }),
    });
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { ok: true, txId });
    assert.equal(audited.length, 1);
    assert.equal(audited[0]?.txId, txId);
    assert.equal(audited[0]?.nullifier, "7");
  });
});
