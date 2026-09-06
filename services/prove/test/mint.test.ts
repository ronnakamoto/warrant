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
    const out = await mintGuest({
      store,
      bindPrivateKey: "0x1111111111111111111111111111111111111111111111111111111111111111",
      registry: "0x103749E5529c3Ce31A1EB8e0657280AaE7e9dA89",
      rpc: "https://sepolia.base.org",
      loadMembers: async () => [],
      bindRoot: async ({ wallet }) => {
        assert.notEqual(wallet.toLowerCase(), FOUNDER_ETH.toLowerCase());
        return { leaf: 1n, root: 2n, txHash: "0x1" };
      },
    });
    assert.notEqual(out.wallet.toLowerCase(), FOUNDER_ETH.toLowerCase());
    const session = store.get(out.sessionId);
    assert.ok(session);
    assert.equal(session.state.mandates.length, 2);
    assert.ok(session.state.identities.alice);
    assert.notEqual(session.state, store.get("missing"));
  });
});
