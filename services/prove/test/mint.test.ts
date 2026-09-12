import assert from "node:assert/strict";
import { FETCH, TRANSLATE } from "@ronnakamoto/warrant-core";
import { FOUNDER_ETH } from "../src/founders.ts";
import { assembleGuestTree, mintGuest, type MintGuestDeps } from "../src/mint.ts";
import { createSessionStore } from "../src/session.ts";
import { emptyState, ensureIdentity, identityOf, freshFieldTag } from "@warrant/agent";

describe("assembleGuestTree", function () {
  it("writes two attenuated hops", function () {
    const state = emptyState();
    ensureIdentity(state, "alice", "alice-unit");
    ensureIdentity(state, "orchestrator", "orch-unit");
    ensureIdentity(state, "translator", "trans-unit");
    state.humanTag = freshFieldTag();
    state.contextHash = freshFieldTag();
    state.rootName = "alice";
    state.rootTier = 0;
    state.rootEpoch = 0;
    assembleGuestTree(state, BigInt(Math.floor(Date.now() / 1000) + 1800), TRANSLATE | FETCH);
    assert.equal(state.mandates.length, 2);
    assert.equal(state.mandates[0]?.from, "alice");
    assert.equal(state.mandates[0]?.to, "orchestrator");
    assert.equal(state.mandates[1]?.to, "translator");
    assert.ok(BigInt(state.mandates[1]!.budgetCap) < BigInt(state.mandates[0]!.budgetCap));
    assert.ok(identityOf(state, "translator"));
    const guestScope = TRANSLATE | FETCH;
    assert.equal(BigInt(state.mandates[0]!.scope), guestScope);
    assert.equal(BigInt(state.mandates[1]!.scope), guestScope);
  });

  it("writes FETCH-only hops when bits are FETCH", function () {
    const state = emptyState();
    ensureIdentity(state, "alice", "alice-unit");
    ensureIdentity(state, "orchestrator", "orch-unit");
    ensureIdentity(state, "translator", "trans-unit");
    state.humanTag = freshFieldTag();
    state.contextHash = freshFieldTag();
    state.rootName = "alice";
    state.rootTier = 0;
    state.rootEpoch = 0;
    const expiry = BigInt(Math.floor(Date.now() / 1000) + 1800);
    assembleGuestTree(state, expiry, FETCH);
    assert.equal(state.mandates.length, 2);
    assert.equal(BigInt(state.mandates[0]!.scope), FETCH);
    assert.equal(BigInt(state.mandates[1]!.scope), FETCH);
  });
});

describe("mintGuest", function () {
  it("does not bind the founder wallet", async function () {
    const store = createSessionStore({ ttlMs: 60_000 });
    const wallet = "0x00000000000000000000000000000000000000ab";
    const out = await mintGuest({
      store,
      wallet,
      bindPrivateKey: "0x1111111111111111111111111111111111111111111111111111111111111111",
      registry: "0x103749E5529c3Ce31A1EB8e0657280AaE7e9dA89",
      rpc: "https://sepolia.base.org",
      loadMembers: async () => [],
      bindRoot: async ({ wallet: bound }) => {
        assert.equal(bound.toLowerCase(), wallet.toLowerCase());
        assert.notEqual(bound.toLowerCase(), FOUNDER_ETH.toLowerCase());
        return { leaf: 1n, root: 2n, txHash: "0x1" };
      },
    });
    assert.equal(out.wallet.toLowerCase(), wallet.toLowerCase());
    const session = store.get(out.sessionId);
    assert.ok(session);
    assert.equal(session.evmPrivateKey, "0x");
    assert.equal(session.state.mandates.length, 2);
    assert.ok(session.state.identities.alice);
    assert.notEqual(session.state, store.get("missing"));
  });

  it("rebinds a persisted Alice when the forest has no leaf", async function () {
    const store = createSessionStore({ ttlMs: 60_000 });
    const wallet = "0x00000000000000000000000000000000000000ab";
    const first = await mintGuest({
      store,
      wallet,
      bindPrivateKey: "0x1111111111111111111111111111111111111111111111111111111111111111",
      registry: "0x103749E5529c3Ce31A1EB8e0657280AaE7e9dA89",
      rpc: "https://sepolia.base.org",
      loadMembers: async () => [],
      bindRoot: async () => ({ leaf: 1n, root: 2n, txHash: "0x1" }),
    });
    const alice = store.get(first.sessionId)!.state.identities.alice!;
    let bound = 0;
    const second = await mintGuest({
      store,
      wallet,
      bindPrivateKey: "0x1111111111111111111111111111111111111111111111111111111111111111",
      registry: "0x8704606Bde5E257dC009cCe55214Df70975f89c5",
      rpc: "https://sepolia.base.org",
      loadMembers: async () => [],
      bindRoot: async ({ pkX, pkY }) => {
        bound += 1;
        assert.equal(pkX, BigInt(alice.pkX));
        assert.equal(pkY, BigInt(alice.pkY));
        return { leaf: 9n, root: 10n, txHash: "0xf" };
      },
      readBinding: async () => {
        throw new Error("The contract function \"leafOf\" reverted with the following signature:\n0x74a04f02");
      },
    });
    assert.equal(bound, 1);
    assert.notEqual(second.sessionId, first.sessionId);
    assert.deepEqual(store.get(second.sessionId)?.state.identities.alice, alice);
  });

  it("reuses Alice when the wallet is already bound", async function () {
    const store = createSessionStore({ ttlMs: 60_000 });
    const wallet = "0x00000000000000000000000000000000000000ab";
    const first = await mintGuest({
      store,
      wallet,
      bindPrivateKey: "0x1111111111111111111111111111111111111111111111111111111111111111",
      registry: "0x103749E5529c3Ce31A1EB8e0657280AaE7e9dA89",
      rpc: "https://sepolia.base.org",
      loadMembers: async () => [],
      bindRoot: async () => ({ leaf: 1n, root: 2n, txHash: "0x1" }),
    });
    const alice = store.get(first.sessionId)!.state.identities.alice!;
    let bound = 0;
    const second = await mintGuest({
      store,
      wallet,
      bindPrivateKey: "0x1111111111111111111111111111111111111111111111111111111111111111",
      registry: "0x103749E5529c3Ce31A1EB8e0657280AaE7e9dA89",
      rpc: "https://sepolia.base.org",
      loadMembers: async () => [],
      bindRoot: async () => {
        bound += 1;
        throw new Error("must not bind again");
      },
      readBinding: async () => ({
        epoch: 0,
        tier: 0,
        leaf: 1n,
        pkX: BigInt(alice.pkX),
        pkY: BigInt(alice.pkY),
      }),
    });
    assert.equal(bound, 0);
    assert.notEqual(second.sessionId, first.sessionId);
    assert.equal(store.get(second.sessionId)?.evmPrivateKey, "0x");
    assert.deepEqual(store.get(second.sessionId)?.state.identities.alice, alice);
  });

  it("second mint without deskId shares the first desk", async function () {
    const store = createSessionStore({ ttlMs: 60_000 });
    const wallet = "0x00000000000000000000000000000000000000ab";
    const first = await mintGuest({
      store,
      wallet,
      bindPrivateKey: "0x1111111111111111111111111111111111111111111111111111111111111111",
      registry: "0x103749E5529c3Ce31A1EB8e0657280AaE7e9dA89",
      rpc: "https://sepolia.base.org",
      loadMembers: async () => [],
      bindRoot: async () => ({ leaf: 1n, root: 2n, txHash: "0x1" }),
    });
    const alice = store.get(first.sessionId)!.state.identities.alice!;
    const second = await mintGuest({
      store,
      wallet,
      bindPrivateKey: "0x1111111111111111111111111111111111111111111111111111111111111111",
      registry: "0x103749E5529c3Ce31A1EB8e0657280AaE7e9dA89",
      rpc: "https://sepolia.base.org",
      loadMembers: async () => [],
      bindRoot: async () => {
        throw new Error("must not bind again");
      },
      readBinding: async () => ({
        epoch: 0,
        tier: 0,
        leaf: 1n,
        pkX: BigInt(alice.pkX),
        pkY: BigInt(alice.pkY),
      }),
    });
    assert.equal(first.deskId, second.deskId);
    assert.equal(store.get(first.sessionId)?.deskId, first.deskId);
    assert.equal(store.get(second.sessionId)?.deskId, first.deskId);
  });

  it("ignores a cookie desk that belongs to another wallet", async function () {
    const store = createSessionStore({ ttlMs: 60_000 });
    const wallet = "0x00000000000000000000000000000000000000ab";
    const other = await mintGuest({
      store,
      wallet: "0x00000000000000000000000000000000000000cd",
      bindPrivateKey: "0x1111111111111111111111111111111111111111111111111111111111111111",
      registry: "0x103749E5529c3Ce31A1EB8e0657280AaE7e9dA89",
      rpc: "https://sepolia.base.org",
      loadMembers: async () => [],
      bindRoot: async () => ({ leaf: 1n, root: 2n, txHash: "0x2" }),
    });
    const mine = await mintGuest({
      store,
      wallet,
      deskId: other.deskId,
      bindPrivateKey: "0x1111111111111111111111111111111111111111111111111111111111111111",
      registry: "0x103749E5529c3Ce31A1EB8e0657280AaE7e9dA89",
      rpc: "https://sepolia.base.org",
      loadMembers: async () => [],
      bindRoot: async () => ({ leaf: 1n, root: 2n, txHash: "0x1" }),
    });
    assert.notEqual(mine.deskId, other.deskId);
  });

  it("requires the client wallet and refuses the founder", async function () {
    const store = createSessionStore({ ttlMs: 60_000 });
    await assert.rejects(
      () =>
        mintGuest({
          store,
          wallet: FOUNDER_ETH,
          bindPrivateKey: "0x1111111111111111111111111111111111111111111111111111111111111111",
          registry: "0x103749E5529c3Ce31A1EB8e0657280AaE7e9dA89",
          rpc: "https://sepolia.base.org",
          loadMembers: async () => [],
          bindRoot: async () => ({ leaf: 1n, root: 2n, txHash: "0x1" }),
        }),
      /founder/,
    );
  });

  it("defaults omitted scope to fetch hops", async function () {
    const store = createSessionStore({ ttlMs: 60_000 });
    const wallet = "0x00000000000000000000000000000000000000ab";
    const out = await mintGuest({
      store,
      wallet,
      bindPrivateKey: "0x1111111111111111111111111111111111111111111111111111111111111111",
      registry: "0x103749E5529c3Ce31A1EB8e0657280AaE7e9dA89",
      rpc: "https://sepolia.base.org",
      loadMembers: async () => [],
      bindRoot: async () => ({ leaf: 1n, root: 2n, txHash: "0x1" }),
    });
    const session = store.get(out.sessionId);
    assert.ok(session);
    assert.equal(session.scope, "fetch");
    assert.equal(BigInt(session.state.mandates[0]!.scope), FETCH);
    assert.equal(BigInt(session.state.mandates[1]!.scope), FETCH);
  });

  it("writes TRANSLATE hops when scope is translate", async function () {
    const store = createSessionStore({ ttlMs: 60_000 });
    const wallet = "0x00000000000000000000000000000000000000ab";
    const out = await mintGuest({
      store,
      wallet,
      scope: "translate",
      bindPrivateKey: "0x1111111111111111111111111111111111111111111111111111111111111111",
      registry: "0x103749E5529c3Ce31A1EB8e0657280AaE7e9dA89",
      rpc: "https://sepolia.base.org",
      loadMembers: async () => [],
      bindRoot: async () => ({ leaf: 1n, root: 2n, txHash: "0x1" }),
    });
    const session = store.get(out.sessionId);
    assert.ok(session);
    assert.equal(session.scope, "translate");
    assert.equal(BigInt(session.state.mandates[0]!.scope), TRANSLATE);
    assert.equal(BigInt(session.state.mandates[1]!.scope), TRANSLATE);
  });

  it("writes both hops when scope is both", async function () {
    const store = createSessionStore({ ttlMs: 60_000 });
    const wallet = "0x00000000000000000000000000000000000000ab";
    const out = await mintGuest({
      store,
      wallet,
      scope: "both",
      bindPrivateKey: "0x1111111111111111111111111111111111111111111111111111111111111111",
      registry: "0x103749E5529c3Ce31A1EB8e0657280AaE7e9dA89",
      rpc: "https://sepolia.base.org",
      loadMembers: async () => [],
      bindRoot: async () => ({ leaf: 1n, root: 2n, txHash: "0x1" }),
    });
    const session = store.get(out.sessionId);
    assert.ok(session);
    assert.equal(session.scope, "both");
    assert.equal(BigInt(session.state.mandates[0]!.scope), TRANSLATE | FETCH);
    assert.equal(BigInt(session.state.mandates[1]!.scope), TRANSLATE | FETCH);
  });

  it("inserts hop hashes into the forest after assemble", async function () {
    const store = createSessionStore({ ttlMs: 60_000 });
    const wallet = "0x00000000000000000000000000000000000000ab";
    const inserted: string[] = [];
    const out = await mintGuest({
      store,
      wallet,
      bindPrivateKey: "0x1111111111111111111111111111111111111111111111111111111111111111",
      registry: "0x103749E5529c3Ce31A1EB8e0657280AaE7e9dA89",
      rpc: "https://sepolia.base.org",
      loadMembers: async () => [],
      bindRoot: async () => ({ leaf: 1n, root: 2n, txHash: "0x1" }),
      insertMandates: async ({ hashes }) => {
        inserted.push(...hashes.map(String));
      },
    });
    const session = store.get(out.sessionId);
    assert.ok(session);
    assert.equal(inserted.length, 2);
    assert.equal(inserted[0], session.state.mandates[0]?.hash);
    assert.equal(inserted[1], session.state.mandates[1]?.hash);
    assert.equal(session.state.members.includes(inserted[0]!), true);
    assert.equal(session.state.members.includes(inserted[1]!), true);
  });

  it("drops Alice and orchestrator private keys after assemble", async function () {
    const store = createSessionStore({ ttlMs: 60_000 });
    const wallet = "0x00000000000000000000000000000000000000ab";
    const out = await mintGuest({
      store,
      wallet,
      bindPrivateKey: "0x1111111111111111111111111111111111111111111111111111111111111111",
      registry: "0x103749E5529c3Ce31A1EB8e0657280AaE7e9dA89",
      rpc: "https://sepolia.base.org",
      loadMembers: async () => [],
      bindRoot: async () => ({ leaf: 1n, root: 2n, txHash: "0x1" }),
      insertMandates: async () => {},
    });
    const session = store.get(out.sessionId)!;
    assert.equal(session.state.identities.alice?.privateKey, "");
    assert.equal(session.state.identities.orchestrator?.privateKey, "");
    assert.ok(session.state.identities.translator?.privateKey);
    assert.equal(session.state.mandates.length, 2);
  });

  const wallet = "0x00000000000000000000000000000000000000ab" as const;
  const bindKey = "0x1111111111111111111111111111111111111111111111111111111111111111" as const;
  const registry = "0x103749E5529c3Ce31A1EB8e0657280AaE7e9dA89" as const;

  function remintDeps(
    store: ReturnType<typeof createSessionStore>,
    extra: Partial<MintGuestDeps> = {},
  ): MintGuestDeps {
    return {
      store,
      wallet,
      bindPrivateKey: bindKey,
      registry,
      rpc: "https://sepolia.base.org",
      loadMembers: async () => [],
      bindRoot: async () => ({ leaf: 1n, root: 2n, txHash: "0x1" }),
      ...extra,
    };
  }

  it("second authorize recovers the same hop tree for the same scope", async function () {
    const store = createSessionStore({ ttlMs: 60_000 });
    const now = Date.now();
    let inserts = 0;
    const first = await mintGuest(
      remintDeps(store, {
        scope: "fetch",
        now: () => now,
        insertMandates: async () => {
          inserts += 1;
        },
      }),
    );
    const firstSession = store.get(first.sessionId)!;
    const firstHashes = firstSession.state.mandates.map((m) => m.hash);
    const alice = firstSession.state.identities.alice!;
    const second = await mintGuest(
      remintDeps(store, {
        scope: "fetch",
        now: () => now + 60_000,
        bindRoot: async () => {
          throw new Error("must not bind again");
        },
        readBinding: async () => ({
          epoch: 0,
          tier: 0,
          leaf: 1n,
          pkX: BigInt(alice.pkX),
          pkY: BigInt(alice.pkY),
        }),
        insertMandates: async () => {
          inserts += 1;
        },
      }),
    );
    const recovered = store.get(second.sessionId)!;
    assert.equal(recovered.scope, "fetch");
    assert.deepEqual(
      recovered.state.mandates.map((m) => m.hash),
      firstHashes,
    );
    assert.equal(recovered.state.humanTag, firstSession.state.humanTag);
    assert.equal(inserts, 1);
  });

  it("second authorize refuses a different scope than the stored hops", async function () {
    const store = createSessionStore({ ttlMs: 60_000 });
    const first = await mintGuest(remintDeps(store, { scope: "fetch" }));
    const alice = store.get(first.sessionId)!.state.identities.alice!;
    await assert.rejects(
      () =>
        mintGuest(
          remintDeps(store, {
            scope: "translate",
            bindRoot: async () => {
              throw new Error("must not bind again");
            },
            readBinding: async () => ({
              epoch: 0,
              tier: 0,
              leaf: 1n,
              pkX: BigInt(alice.pkX),
              pkY: BigInt(alice.pkY),
            }),
          }),
        ),
      /scope does not match stored hops/,
    );
  });

  it("second authorize refuses expired stored hops", async function () {
    const store = createSessionStore({ ttlMs: 60_000 });
    const now = Date.now();
    const first = await mintGuest(remintDeps(store, { now: () => now }));
    const alice = store.get(first.sessionId)!.state.identities.alice!;
    await assert.rejects(
      () =>
        mintGuest(
          remintDeps(store, {
            now: () => now + 31 * 60 * 1000,
            bindRoot: async () => {
              throw new Error("must not bind again");
            },
            readBinding: async () => ({
              epoch: 0,
              tier: 0,
              leaf: 1n,
              pkX: BigInt(alice.pkX),
              pkY: BigInt(alice.pkY),
            }),
          }),
        ),
      /stored hops are dead/,
    );
  });

  it("second authorize refuses epoch-mismatched stored hops", async function () {
    const store = createSessionStore({ ttlMs: 60_000 });
    const first = await mintGuest(remintDeps(store));
    const alice = store.get(first.sessionId)!.state.identities.alice!;
    await assert.rejects(
      () =>
        mintGuest(
          remintDeps(store, {
            bindRoot: async () => {
              throw new Error("must not bind again");
            },
            readBinding: async () => ({
              epoch: 1,
              tier: 0,
              leaf: 1n,
              pkX: BigInt(alice.pkX),
              pkY: BigInt(alice.pkY),
            }),
          }),
        ),
      /stored hops are dead/,
    );
  });
});
