import assert from "node:assert/strict";
import { FOUNDER_ETH } from "../src/founders.ts";
import {
  markWalletFired,
  prepareGuestRevoke,
  revokeGuest,
  revokeSiblingsFor,
  waitUntilBalance,
} from "../src/revoke.ts";
import { createSessionStore } from "../src/session.ts";
import { emptyState } from "@warrant/agent";

describe("waitUntilBalance", function () {
  it("returns once the credit is visible", async function () {
    let n = 0n;
    await waitUntilBalance(
      async () => {
        n += 1n;
        return n;
      },
      3n,
      { delayMs: 1, sleep: async () => undefined },
    );
    assert.equal(n, 3n);
  });

  it("throws if the credit never appears", async function () {
    await assert.rejects(
      () =>
        waitUntilBalance(async () => 0n, 1n, {
          tries: 2,
          delayMs: 1,
          sleep: async () => undefined,
        }),
      /not funded in time/,
    );
  });
});

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
            deskId: "desk",
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
        deskId: "desk",
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

describe("prepareGuestRevoke", function () {
  it("returns siblings and never signs the revoke", async function () {
    const { assembleGuestTree } = await import("../src/mint.ts");
    const { ensureIdentity, emptyState, freshFieldTag, appendLeaf, identityOf } =
      await import("@warrant/agent");
    const { hashLeaf } = await import("@warrant/core");
    const state = emptyState();
    ensureIdentity(state, "alice", "alice-prep");
    ensureIdentity(state, "orchestrator", "orch-prep");
    ensureIdentity(state, "translator", "trans-prep");
    state.humanTag = freshFieldTag();
    state.contextHash = freshFieldTag();
    state.rootName = "alice";
    state.rootTier = 0;
    state.rootEpoch = 0;
    const alice = identityOf(state, "alice");
    const leaf = hashLeaf(alice.publicKey[0], alice.publicKey[1], 0n, 0n);
    appendLeaf(state, leaf);
    assembleGuestTree(state, BigInt(Math.floor(Date.now() / 1000) + 1800));

    let sponsored = 0;
    const out = await prepareGuestRevoke({
      session: {
        id: "g",
        deskId: "desk",
        wallet: "0x00000000000000000000000000000000000000aa",
        evmPrivateKey: "0x",
        createdAt: Date.now(),
        state,
      },
      registry: "0x103749E5529c3Ce31A1EB8e0657280AaE7e9dA89",
      rpc: "https://sepolia.base.org",
      gasSponsorKey: "0x1111111111111111111111111111111111111111111111111111111111111111",
      loadMembers: async () => [leaf.toString()],
      sponsor: async () => {
        sponsored += 1;
      },
    });
    assert.equal(sponsored, 1);
    assert.equal(out.wallet, "0x00000000000000000000000000000000000000aa");
    assert.ok(Array.isArray(out.siblings));
  });

  it("marks every session on that wallet fired", function () {
    const store = createSessionStore({ ttlMs: 60_000 });
    store.put({
      id: "a",
      deskId: "desk",
      wallet: "0x00000000000000000000000000000000000000aa",
      evmPrivateKey: "0x",
      createdAt: Date.now(),
      state: emptyState(),
    });
    store.put({
      id: "b",
      deskId: "desk",
      wallet: "0x00000000000000000000000000000000000000aa",
      evmPrivateKey: "0x",
      createdAt: Date.now(),
      state: emptyState(),
    });
    store.put({
      id: "c",
      deskId: "desk",
      wallet: "0x00000000000000000000000000000000000000bb",
      evmPrivateKey: "0x",
      createdAt: Date.now(),
      state: emptyState(),
    });
    markWalletFired(store, "0x00000000000000000000000000000000000000aa");
    assert.equal(store.get("a")?.revoked, true);
    assert.equal(store.get("b")?.revoked, true);
    assert.equal(store.get("c")?.revoked, undefined);
  });
});
