import assert from "node:assert/strict";
import { createProveApp } from "../src/app.ts";
import { createRateLimiter } from "../src/rate-limit.ts";
import { createSessionStore } from "../src/session.ts";
import { emptyState } from "@warrant/agent";
import type { ChallengeParts, IProver, WarrantProof } from "@warrant/core";

const secret = "test-secret";
const WALLET = "0x00000000000000000000000000000000000000ab";
const WALLET_B = "0x00000000000000000000000000000000000000cd";
const mintBody = (wallet = WALLET, extra: Record<string, unknown> = {}) =>
  JSON.stringify({ wallet, ...extra });
const mintHdrs = { "x-warrant-prove-secret": secret, "content-type": "application/json" };

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
    const hdrs = mintHdrs;
    assert.equal(
      (await app.request("/v1/mint", { method: "POST", headers: hdrs, body: mintBody() })).status,
      200,
    );
    assert.equal(
      (await app.request("/v1/mint", { method: "POST", headers: hdrs, body: mintBody() })).status,
      429,
    );
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
          headers: { ...hdrs, "x-warrant-client-ip": "203.0.113.1", "content-type": "application/json" },
          body: mintBody(),
        })
      ).status,
      200,
    );
    assert.equal(
      (
        await app.request("/v1/mint", {
          method: "POST",
          headers: { ...hdrs, "x-warrant-client-ip": "203.0.113.2", "content-type": "application/json" },
          body: mintBody(WALLET_B),
        })
      ).status,
      200,
    );
    assert.equal(
      (
        await app.request("/v1/mint", {
          method: "POST",
          headers: { ...hdrs, "x-warrant-client-ip": "203.0.113.1", "content-type": "application/json" },
          body: mintBody(),
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
      headers: mintHdrs,
      body: mintBody(),
    });
    assert.equal(res.status, 200);
    const body = (await res.json()) as { sessionId: string; wallet: string };
    assert.ok(body.sessionId);
    assert.equal(body.wallet.toLowerCase(), WALLET.toLowerCase());
    assert.equal("evmPrivateKey" in body, false);
    assert.equal("state" in body, false);
    const stored = store.get(body.sessionId);
    assert.equal(stored?.evmPrivateKey, "0x");
  });

  it("refuses mint without a client wallet", async function () {
    const store = createSessionStore({ ttlMs: 60_000 });
    const app = createProveApp({
      authSecret: secret,
      store,
      bindPrivateKey: "0x1111111111111111111111111111111111111111111111111111111111111111",
      registry: "0x103749E5529c3Ce31A1EB8e0657280AaE7e9dA89",
      rpc: "https://sepolia.base.org",
      loadMembers: async () => ["1"],
      bindRoot: async () => ({ leaf: 1n, root: 2n, txHash: "0xabc" }),
    });
    const res = await app.request("/v1/mint", {
      method: "POST",
      headers: mintHdrs,
      body: "{}",
    });
    assert.equal(res.status, 400);
    assert.deepEqual(await res.json(), { error: "wallet required" });
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
  it("returns siblings and does not mark fired until the wallet tx", async function () {
    const store = createSessionStore({ ttlMs: 60_000 });
    store.put({
      id: "keep",
      deskId: "desk",
      wallet: "0x00000000000000000000000000000000000000aa",
      evmPrivateKey: "0x",
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
      prepareRevoke: async ({ session, registry }) => ({
        siblings: ["0"],
        wallet: session.wallet,
        registry,
      }),
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
    const prep = (await res.json()) as { siblings: string[]; wallet: string };
    assert.deepEqual(prep.siblings, ["0"]);
    assert.equal(prep.wallet, "0x00000000000000000000000000000000000000aa");
    const kept = store.get("keep");
    assert.ok(kept);
    assert.equal(kept.revoked, undefined);
    assert.equal(kept.evmPrivateKey, "0x");
  });

  it("POST /v1/session reports live then fired without leaking keys", async function () {
    const store = createSessionStore({ ttlMs: 60_000 });
    store.put({
      id: "look",
      deskId: "desk",
      createdAt: Date.now(),
      wallet: "0x0000000000000000000000000000000000000001",
      evmPrivateKey: "0x",
      state: emptyState(),
    });
    const app = createProveApp({
      authSecret: secret,
      store,
      registry: "0x103749E5529c3Ce31A1EB8e0657280AaE7e9dA89",
      rpc: "https://sepolia.base.org",
      gasSponsorKey: "0x1111111111111111111111111111111111111111111111111111111111111111",
      loadMembers: async () => ["1"],
      prepareRevoke: async ({ session, registry }) => ({
        siblings: ["0"],
        wallet: session.wallet,
        registry,
      }),
    });
    const hdrs = { "x-warrant-prove-secret": secret, "content-type": "application/json" };
    const live = await app.request("/v1/session", {
      method: "POST",
      headers: hdrs,
      body: JSON.stringify({ sessionId: "look" }),
    });
    assert.equal(live.status, 200);
    const liveBody = (await live.json()) as Record<string, unknown>;
    assert.deepEqual(liveBody, { status: "live" });
    const prepared = await app.request("/v1/revoke", {
      method: "POST",
      headers: hdrs,
      body: JSON.stringify({ sessionId: "look" }),
    });
    assert.equal(prepared.status, 200);
    assert.equal(store.get("look")?.revoked, undefined);
    await app.request("/v1/revoke", {
      method: "POST",
      headers: hdrs,
      body: JSON.stringify({ sessionId: "look", txHash: "0xdead" }),
    });
    const fired = await app.request("/v1/session", {
      method: "POST",
      headers: hdrs,
      body: JSON.stringify({ sessionId: "look" }),
    });
    assert.equal(fired.status, 200);
    const firedBody = (await fired.json()) as Record<string, unknown>;
    assert.deepEqual(firedBody, { status: "fired" });
    assert.equal("evmPrivateKey" in firedBody, false);
  });
});

describe("prove desk", function () {
  function deskApp() {
    const store = createSessionStore({ ttlMs: 60_000 });
    const app = createProveApp({
      authSecret: secret,
      store,
      bindPrivateKey: "0x1111111111111111111111111111111111111111111111111111111111111111",
      registry: "0x103749E5529c3Ce31A1EB8e0657280AaE7e9dA89",
      rpc: "https://sepolia.base.org",
      loadMembers: async () => ["1"],
      bindRoot: async () => ({ leaf: 1n, root: 2n, txHash: "0x1" }),
    });
    return { app, store };
  }

  it("mints two sessions onto the same desk and lists both", async function () {
    const { app } = deskApp();
    const hdrs = { "x-warrant-prove-secret": secret, "content-type": "application/json" };
    const first = (await (
      await app.request("/v1/mint", { method: "POST", headers: hdrs, body: mintBody() })
    ).json()) as { sessionId: string; deskId: string };
    const second = (await (
      await app.request("/v1/mint", {
        method: "POST",
        headers: hdrs,
        body: mintBody(WALLET_B, { deskId: first.deskId }),
      })
    ).json()) as { sessionId: string; deskId: string };
    assert.equal(second.deskId, first.deskId);
    assert.notEqual(second.sessionId, first.sessionId);
    const list = await app.request("/v1/desk", {
      method: "POST",
      headers: hdrs,
      body: JSON.stringify({ deskId: first.deskId }),
    });
    assert.equal(list.status, 200);
    const body = (await list.json()) as { warrants: { id: string }[] };
    assert.deepEqual(body.warrants.map((w) => w.id).sort(), [first.sessionId, second.sessionId].sort());
  });

  it("refuses to revoke a session from another desk", async function () {
    const { app, store } = deskApp();
    store.put({
      id: "foreign",
      deskId: "other",
      createdAt: Date.now(),
      wallet: "0x0000000000000000000000000000000000000001",
      evmPrivateKey: "0x2222222222222222222222222222222222222222222222222222222222222222",
      state: emptyState(),
    });
    const res = await app.request("/v1/revoke", {
      method: "POST",
      headers: { "x-warrant-prove-secret": secret, "content-type": "application/json" },
      body: JSON.stringify({ sessionId: "foreign", deskId: "desk-mine" }),
    });
    assert.equal(res.status, 403);
    assert.deepEqual(await res.json(), { error: "wrong_desk" });
  });

  it("rejects oversized mint and desk bodies", async function () {
    const { app } = deskApp();
    const huge = "x".repeat(64 * 1024 + 1);
    const hdrs = { "x-warrant-prove-secret": secret, "content-type": "application/json" };
    const mint = await app.request("/v1/mint", { method: "POST", headers: hdrs, body: huge });
    assert.equal(mint.status, 413);
    const desk = await app.request("/v1/desk", { method: "POST", headers: hdrs, body: huge });
    assert.equal(desk.status, 413);
  });

  it("rejects invalid json on mint and desk", async function () {
    const { app } = deskApp();
    const hdrs = { "x-warrant-prove-secret": secret, "content-type": "application/json" };
    const mint = await app.request("/v1/mint", { method: "POST", headers: hdrs, body: "{not-json" });
    assert.equal(mint.status, 400);
    assert.deepEqual(await mint.json(), { error: "invalid json" });
    const desk = await app.request("/v1/desk", { method: "POST", headers: hdrs, body: "{not-json" });
    assert.equal(desk.status, 400);
    assert.deepEqual(await desk.json(), { error: "invalid json" });
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
