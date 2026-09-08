import assert from "node:assert/strict";
import { FETCH, TRANSLATE, hashChallenge, type IVerifier } from "@ronnakamoto/warrant-core";
import { decodePaymentRequiredHeader } from "@x402/core/http";
import { mockHederaFacilitator } from "@ronnakamoto/warrant-x402";
import { createMemoApp } from "../src/app.ts";
import { wireMemo } from "../src/wiring.ts";
import { parseMemoText } from "../src/memo.ts";

const liveRoot = 111n;
const verifierOk: IVerifier = { async verify() { return true; } };

describe("parseMemoText", function () {
  it("accepts a short string and rejects empty or >240", function () {
    assert.deepEqual(parseMemoText({ text: "hello" }), { ok: true, text: "hello" });
    assert.equal(parseMemoText({ text: "" }).ok, false);
    assert.equal(parseMemoText({ text: "x".repeat(241) }).ok, false);
  });
});

describe("memo shop", function () {
  it("health is 200; POST without warrant is 402", async function () {
    const shop = wireMemo({
      facilitatorClient: mockHederaFacilitator(),
      fixedMerkleRoot: liveRoot,
      verifier: verifierOk,
      freeCallsPerHuman: 3,
      submit: async () => ({ txId: "0.0.1@1" }),
    });
    await shop.initialize();
    const app = createMemoApp(shop);
    assert.equal((await app.request("http://memo.test/health")).status, 200);
    const unpaid = await app.request("http://memo.test/v1/memo", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "scar" }),
    });
    assert.equal(unpaid.status, 402);
  });

  it("TRANSLATE warrant is 403 policy; FETCH free warrant submits and returns hashscan", async function () {
    const submitted: string[] = [];
    const shop = wireMemo({
      facilitatorClient: mockHederaFacilitator(),
      fixedMerkleRoot: liveRoot,
      verifier: verifierOk,
      freeCallsPerHuman: 3,
      submit: async (text) => {
        submitted.push(text);
        return { txId: "0.0.10336559@1750000000.000000001" };
      },
    });
    await shop.initialize();
    const app = createMemoApp(shop);
    const unpaid = await app.request("http://memo.test/v1/memo", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "scar" }),
    });
    const required = decodePaymentRequiredHeader(unpaid.headers.get("PAYMENT-REQUIRED") ?? "");
    const info = (required as { extensions?: { warrant?: { info?: { nonce: string; merkleRoot: string } } } })
      .extensions?.warrant?.info!;
    const { bodyHashFromCanonical } = await import("@ronnakamoto/warrant-core");
    const bodyHash = bodyHashFromCanonical({ text: "scar" });
    const ch = {
      method: "POST",
      path: "/v1/memo",
      nonce: info.nonce,
      merkleRoot: info.merkleRoot,
      amount: shop.amount,
      payTo: shop.payTo,
      bodyHash,
    };
    const base = {
      merkleRoot: liveRoot,
      contextHash: 1n,
      nullifier: 9n,
      effectiveBudgetCap: 1n,
      minExpiry: 1n,
      tier: 0n,
      requestHash: hashChallenge(ch),
    };
    function header(scope: bigint) {
      return JSON.stringify({
        proof: { pi_a: [], pi_b: [], pi_c: [] },
        publicSignals: [
          base.merkleRoot, base.contextHash, base.nullifier, scope,
          base.effectiveBudgetCap, base.minExpiry, base.tier, base.requestHash,
        ].map(String),
        nonce: info.nonce,
      });
    }
    const denied = await app.request("http://memo.test/v1/memo", {
      method: "POST",
      headers: { "content-type": "application/json", warrant: header(TRANSLATE) },
      body: JSON.stringify({ text: "scar" }),
    });
    assert.equal(denied.status, 403);
    const ok = await app.request("http://memo.test/v1/memo", {
      method: "POST",
      headers: { "content-type": "application/json", warrant: header(FETCH) },
      body: JSON.stringify({ text: "scar" }),
    });
    assert.equal(ok.status, 200);
    const body = await ok.json();
    assert.equal(body.text, "scar");
    assert.match(String(body.hashscan), /hashscan\.io\/testnet/);
    assert.deepEqual(submitted, ["scar"]);
  });
});
