import assert from "node:assert/strict";
import { FOUNDER_ETH } from "../src/founders.ts";
import { assembleGuestTree, mintGuest } from "../src/mint.ts";
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
    assembleGuestTree(state, BigInt(Math.floor(Date.now() / 1000) + 1800));
    assert.equal(state.mandates.length, 2);
    assert.equal(state.mandates[0]?.from, "alice");
    assert.equal(state.mandates[0]?.to, "orchestrator");
    assert.equal(state.mandates[1]?.to, "translator");
    assert.ok(BigInt(state.mandates[1]!.budgetCap) < BigInt(state.mandates[0]!.budgetCap));
    assert.ok(identityOf(state, "translator"));
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
});
