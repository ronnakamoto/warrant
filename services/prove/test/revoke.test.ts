import assert from "node:assert/strict";
import { FOUNDER_ETH } from "../src/founders.ts";
import { revokeGuest, revokeSiblingsFor } from "../src/revoke.ts";
import { emptyState } from "@warrant/agent";

describe("revokeSiblingsFor", function () {
  it("builds siblings for a one-leaf tree", async function () {
    const sibs = await revokeSiblingsFor(["42"], "42");
    assert.ok(Array.isArray(sibs));
  });
});

describe("revokeGuest isolation", function () {
  it("refuses the founder wallet", async function () {
    await assert.rejects(
      () =>
        revokeGuest({
          session: {
            id: "x",
            wallet: FOUNDER_ETH,
            evmPrivateKey: "0x11",
            createdAt: Date.now(),
            state: emptyState(),
          },
          registry: "0x103749E5529c3Ce31A1EB8e0657280AaE7e9dA89",
          rpc: "https://sepolia.base.org",
          gasSponsorKey: "0x1111111111111111111111111111111111111111111111111111111111111111",
          loadMembers: async () => ["1"],
        }),
      /founder/,
    );
  });

  it("calls revoke with the guest, not the sponsor", async function () {
    const { assembleGuestTree } = await import("../src/mint.ts");
    const { ensureIdentity, emptyState, freshFieldTag, appendLeaf, identityOf } =
      await import("@warrant/agent");
    const { hashLeaf } = await import("@warrant/core");
    const state = emptyState();
    ensureIdentity(state, "alice", "alice-rev");
    ensureIdentity(state, "orchestrator", "orch-rev");
    ensureIdentity(state, "translator", "trans-rev");
    state.humanTag = freshFieldTag();
    state.contextHash = freshFieldTag();
    state.rootName = "alice";
    state.rootTier = 0;
    state.rootEpoch = 0;
    const alice = identityOf(state, "alice");
    const leaf = hashLeaf(alice.publicKey[0], alice.publicKey[1], 0n, 0n);
    appendLeaf(state, leaf);
    assembleGuestTree(state, BigInt(Math.floor(Date.now() / 1000) + 1800));

    let revokedBySponsor = false;
    const out = await revokeGuest({
      session: {
        id: "g",
        wallet: "0x00000000000000000000000000000000000000aa",
        evmPrivateKey: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        createdAt: Date.now(),
        state,
      },
      registry: "0x103749E5529c3Ce31A1EB8e0657280AaE7e9dA89",
      rpc: "https://sepolia.base.org",
      gasSponsorKey: "0x1111111111111111111111111111111111111111111111111111111111111111",
      loadMembers: async () => [leaf.toString()],
      clients: {
        revoke: async () => {
          revokedBySponsor = false;
          return "0xdead";
        },
      },
    });
    assert.equal(out.txHash, "0xdead");
    assert.equal(revokedBySponsor, false);
  });
});
