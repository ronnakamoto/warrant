import assert from "node:assert/strict";
import { Hono } from "hono";
import { FETCH, hashChallenge, type IVerifier } from "@warrant/core";
import { decodePaymentRequiredHeader } from "@x402/core/http";
import {
  createWarrantShop,
  initializeWarrantShop,
  mockHederaFacilitator,
} from "../src/shop.ts";
import { FixedRootChecker } from "../src/roots.ts";
import { MemoryNullifierStore } from "../src/nullifiers.ts";
import { warrantHono } from "../src/hono.ts";

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

    const { bodyHashFromCanonical } = await import("@warrant/core");
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
});
