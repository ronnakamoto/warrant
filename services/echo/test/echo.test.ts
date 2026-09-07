import assert from "node:assert/strict";
import { FETCH, TRANSLATE, hashChallenge, type IVerifier } from "@warrant/core";
import { decodePaymentRequiredHeader } from "@x402/core/http";
import { createEchoApp } from "../src/app.ts";
import { wireEcho } from "../src/wiring.ts";
import { mockHederaFacilitator } from "@warrant/x402";

const liveRoot = 111n;
const verifierOk: IVerifier = { async verify() { return true; } };

describe("echo shop", function () {
  it("unprotected health is 200; POST without warrant is 402", async function () {
    const shop = wireEcho({
      facilitatorClient: mockHederaFacilitator(),
      fixedMerkleRoot: liveRoot,
      verifier: verifierOk,
      freeCallsPerHuman: 3,
    });
    await shop.initialize();
    const app = createEchoApp(shop);
    const health = await app.request("http://echo.test/health");
    assert.equal(health.status, 200);
    const unpaid = await app.request("http://echo.test/v1/echo", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "ping" }),
    });
    assert.equal(unpaid.status, 402);
  });

  it("TRANSLATE warrant is 403 policy; FETCH free warrant echoes text", async function () {
    const shop = wireEcho({
      facilitatorClient: mockHederaFacilitator(),
      fixedMerkleRoot: liveRoot,
      verifier: verifierOk,
      freeCallsPerHuman: 3,
    });
    await shop.initialize();
    const app = createEchoApp(shop);
    const unpaid = await app.request("http://echo.test/v1/echo", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "ping" }),
    });
    const required = decodePaymentRequiredHeader(unpaid.headers.get("PAYMENT-REQUIRED") ?? "");
    const info = (required as { extensions?: { warrant?: { info?: { nonce: string; merkleRoot: string } } } })
      .extensions?.warrant?.info!;
    const { bodyHashFromCanonical } = await import("@warrant/core");
    const bodyHash = bodyHashFromCanonical({ text: "ping" });
    const ch = {
      method: "POST",
      path: "/v1/echo",
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
    const denied = await app.request("http://echo.test/v1/echo", {
      method: "POST",
      headers: { "content-type": "application/json", warrant: header(TRANSLATE) },
      body: JSON.stringify({ text: "ping" }),
    });
    assert.equal(denied.status, 403);
    const ok = await app.request("http://echo.test/v1/echo", {
      method: "POST",
      headers: { "content-type": "application/json", warrant: header(FETCH) },
      body: JSON.stringify({ text: "ping" }),
    });
    assert.equal(ok.status, 200);
    assert.equal((await ok.json() as { text: string }).text, "ping");
  });
});
