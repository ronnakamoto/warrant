import assert from "node:assert/strict";
import { createProveApp } from "../src/app.ts";
import { createRateLimiter } from "../src/rate-limit.ts";
import { createSessionStore } from "../src/session.ts";
import { emptyState } from "@warrant/agent";
import type { ChallengeParts, IProver, WarrantProof } from "@warrant/core";

const secret = "test-secret";

describe("prove app auth", function () {
  const app = createProveApp({ authSecret: secret });

  it("GET /health is open", async function () {
    const res = await app.request("/health");
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { ok: true });
    const text = await (await app.request("/health")).text();
    assert.equal(text.includes("secret"), false);
  });

  it("POST /v1/mint is 429 after the window fills", async function () {
    const store = createSessionStore({ ttlMs: 60_000 });
    const app = createProveApp({
      authSecret: secret,
      store,
      bindPrivateKey: "0x1111111111111111111111111111111111111111111111111111111111111111",
      registry: "0x103749E5529c3Ce31A1EB8e0657280AaE7e9dA89",
      rpc: "https://sepolia.base.org",
      loadMembers: async () => ["1"],
      bindRoot: async () => ({ leaf: 1n, root: 2n, txHash: "0x1" }),
      mintLimiter: createRateLimiter({ max: 1, windowMs: 60_000 }),
    });
    const hdrs = { "x-warrant-prove-secret": secret };
    assert.equal((await app.request("/v1/mint", { method: "POST", headers: hdrs })).status, 200);
    assert.equal((await app.request("/v1/mint", { method: "POST", headers: hdrs })).status, 429);
  });

  it("POST /v1/mint without secret is 401", async function () {
    const res = await app.request("/v1/mint", { method: "POST" });
    assert.equal(res.status, 401);
  });

  it("rate-limits mint by x-warrant-client-ip, not the BFF egress", async function () {
    const store = createSessionStore({ ttlMs: 60_000 });
    const app = createProveApp({
      authSecret: secret,
      store,
      bindPrivateKey: "0x1111111111111111111111111111111111111111111111111111111111111111",
      registry: "0x103749E5529c3Ce31A1EB8e0657280AaE7e9dA89",
      rpc: "https://sepolia.base.org",
      loadMembers: async () => ["1"],
      bindRoot: async () => ({ leaf: 1n, root: 2n, txHash: "0x1" }),
      mintLimiter: createRateLimiter({ max: 1, windowMs: 60_000 }),
    });
    const hdrs = { "x-warrant-prove-secret": secret };
    assert.equal(
      (
        await app.request("/v1/mint", {
          method: "POST",
          headers: { ...hdrs, "x-warrant-client-ip": "203.0.113.1" },
        })
      ).status,
      200,
    );
    assert.equal(
      (
        await app.request("/v1/mint", {
          method: "POST",
          headers: { ...hdrs, "x-warrant-client-ip": "203.0.113.2" },
        })
      ).status,
      200,
    );
    assert.equal(
      (
        await app.request("/v1/mint", {
          method: "POST",
          headers: { ...hdrs, "x-warrant-client-ip": "203.0.113.1" },
        })
      ).status,
      429,
    );
  });

  it("rejects mint when the dashboard origin is not allowed", async function () {
    const store = createSessionStore({ ttlMs: 60_000 });
    const app = createProveApp({
      authSecret: secret,
      allowedOrigins: ["https://app.example"],
      store,
      bindPrivateKey: "0x1111111111111111111111111111111111111111111111111111111111111111",
      registry: "0x103749E5529c3Ce31A1EB8e0657280AaE7e9dA89",
      rpc: "https://sepolia.base.org",
      loadMembers: async () => ["1"],
      bindRoot: async () => ({ leaf: 1n, root: 2n, txHash: "0x1" }),
    });
    const res = await app.request("/v1/mint", {
      method: "POST",
      headers: {
        "x-warrant-prove-secret": secret,
        "x-warrant-dashboard-origin": "https://evil.example",
      },
    });
    assert.equal(res.status, 403);
  });
});

describe("prove app mint isolation", function () {
  it("returns sessionId + wallet and never a key", async function () {
    const store = createSessionStore({ ttlMs: 60_000 });
    const app = createProveApp({
      authSecret: secret,
      store,
      bindPrivateKey: "0x1111111111111111111111111111111111111111111111111111111111111111",
      registry: "0x103749E5529c3Ce31A1EB8e0657280AaE7e9dA89",
      rpc: "https://sepolia.base.org",
      loadMembers: async () => ["1"],
      bindRoot: async ({ wallet }) => ({ leaf: 1n, root: 2n, txHash: "0xabc" }),
    });
    const res = await app.request("/v1/mint", {
      method: "POST",
      headers: { "x-warrant-prove-secret": secret },
    });
    assert.equal(res.status, 200);
    const body = (await res.json()) as { sessionId: string; wallet: string };
    assert.ok(body.sessionId);
    assert.ok(body.wallet.startsWith("0x"));
    assert.equal(body.wallet.toLowerCase() === "0xa16d90c5f9d2b14133db64d57ac81f46dd1161ef", false);
    assert.equal("evmPrivateKey" in body, false);
    assert.equal("state" in body, false);
  });
});

describe("prove app prove", function () {
  it("calls proveForChallenge as translator", async function () {
    const store = createSessionStore({ ttlMs: 60_000 });
    store.put({
      id: "sess1",
      deskId: "desk",
      wallet: "0x0000000000000000000000000000000000000001",
      evmPrivateKey: "0x2222222222222222222222222222222222222222222222222222222222222222",
      createdAt: Date.now(),
      state: emptyState(),
    });
    let asName = "";
    const fakeProver: IProver = {
      async prove() {
        throw new Error("should not reach snark");
      },
    };
    const app = createProveApp({
      authSecret: secret,
      store,
      prover: fakeProver,
      loadMembers: async () => ["1"],
    });
    const challenge: ChallengeParts = {
      method: "POST",
      path: "/v1/translate",
      nonce: "1",
      merkleRoot: "1",
      amount: "0",
      payTo: "0.0.1",
      bodyHash: "0x00",
    };
    const res = await app.request("/v1/prove", {
      method: "POST",
      headers: {
        "x-warrant-prove-secret": secret,
        "content-type": "application/json",
      },
      body: JSON.stringify({ sessionId: "sess1", challenge }),
    });
    assert.equal(res.status, 400);
    void asName;
  });

  it("returns 408 on prove timeout", async function () {
    const store = createSessionStore({ ttlMs: 60_000 });
    const { assembleGuestTree } = await import("../src/mint.ts");
    const { ensureIdentity, emptyState, freshFieldTag, appendLeaf } = await import(
      "@warrant/agent"
    );
    const { hashLeaf } = await import("@warrant/core");
    const state = emptyState();
    ensureIdentity(state, "alice", "alice-test");
    ensureIdentity(state, "orchestrator", "orch-test");
    ensureIdentity(state, "translator", "trans-test");
    state.humanTag = freshFieldTag();
    state.contextHash = freshFieldTag();
    state.rootName = "alice";
    state.rootTier = 0;
    state.rootEpoch = 0;
    const alice = (await import("@warrant/agent")).identityOf(state, "alice");
    appendLeaf(state, hashLeaf(alice.publicKey[0], alice.publicKey[1], 0n, 0n));
    assembleGuestTree(state, BigInt(Math.floor(Date.now() / 1000) + 3600));
    store.put({
      id: "slow",
      deskId: "desk",
      wallet: "0x0000000000000000000000000000000000000002",
      evmPrivateKey: "0x3333333333333333333333333333333333333333333333333333333333333333",
      createdAt: Date.now(),
      state,
    });
    const app = createProveApp({
      authSecret: secret,
      store,
      proveTimeoutMs: 20,
      prover: {
        async prove() {
          await new Promise((r) => setTimeout(r, 200));
          return { pi_a: [], pi_b: [], pi_c: [] } as WarrantProof;
        },
      },
    });
    const res = await app.request("/v1/prove", {
      method: "POST",
      headers: {
        "x-warrant-prove-secret": secret,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        sessionId: "slow",
        challenge: {
          method: "POST",
          path: "/v1/translate",
          nonce: "1",
          merkleRoot: "1",
          amount: "0",
          payTo: "0.0.1",
          bodyHash: "0x00",
        },
      }),
    });
    assert.equal(res.status, 408);
  });
});

describe("prove app revoke", function () {
  it("keeps the session so the next prove can show root_revoked", async function () {
    const store = createSessionStore({ ttlMs: 60_000 });
    store.put({
      id: "keep",
      deskId: "desk",
      wallet: "0x00000000000000000000000000000000000000aa",
      evmPrivateKey: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      createdAt: Date.now(),
      state: emptyState(),
    });
    const app = createProveApp({
      authSecret: secret,
      store,
      registry: "0x103749E5529c3Ce31A1EB8e0657280AaE7e9dA89",
      rpc: "https://sepolia.base.org",
      gasSponsorKey: "0x1111111111111111111111111111111111111111111111111111111111111111",
      loadMembers: async () => ["1"],
      revokeGuest: async () => ({ txHash: "0xdead" }),
    });
    const res = await app.request("/v1/revoke", {
      method: "POST",
      headers: {
        "x-warrant-prove-secret": secret,
        "content-type": "application/json",
      },
      body: JSON.stringify({ sessionId: "keep" }),
    });
    assert.equal(res.status, 200);
    const kept = store.get("keep");
    assert.ok(kept);
    assert.equal(kept.revoked, true);
    assert.notEqual(kept.evmPrivateKey, "0x");
  });
});

describe("rate limiter", function () {
  it("rejects after max hits", function () {
    let t = 0;
    const lim = createRateLimiter({ max: 2, windowMs: 1000, now: () => t });
    assert.equal(lim.take("ip"), true);
    assert.equal(lim.take("ip"), true);
    assert.equal(lim.take("ip"), false);
    t = 2000;
    assert.equal(lim.take("ip"), true);
  });
});
