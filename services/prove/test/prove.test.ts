import assert from "node:assert/strict";
import { appendLeaf, emptyState, ensureIdentity, freshFieldTag, identityOf } from "@warrant/agent";
import { hashLeaf, type IProver, type WarrantProof } from "@ronnakamoto/warrant-core";
import { appendHelperHop } from "../src/hire.ts";
import { assembleGuestTree } from "../src/mint.ts";
import { actingName, proveGuest } from "../src/prove.ts";
import type { GuestSession } from "../src/session.ts";

describe("actingName", function () {
  it("selects helper vs translator from parentId", function () {
    const session: GuestSession = {
      id: "p",
      deskId: "desk",
      wallet: "0x0000000000000000000000000000000000000003",
      evmPrivateKey: "0x3333333333333333333333333333333333333333333333333333333333333333",
      createdAt: Date.now(),
      state: emptyState(),
    };
    assert.equal(actingName({ ...session, parentId: "p" }), "helper");
    assert.equal(actingName(session), "translator");
  });
});

describe("proveGuest", function () {
  it("proves as translator", async function () {
    const state = emptyState();
    ensureIdentity(state, "alice", "alice-pr");
    ensureIdentity(state, "orchestrator", "orch-pr");
    ensureIdentity(state, "translator", "trans-pr");
    state.humanTag = freshFieldTag();
    state.contextHash = freshFieldTag();
    state.rootName = "alice";
    state.rootTier = 0;
    state.rootEpoch = 0;
    const alice = identityOf(state, "alice");
    appendLeaf(state, hashLeaf(alice.publicKey[0], alice.publicKey[1], 0n, 0n));
    assembleGuestTree(state, BigInt(Math.floor(Date.now() / 1000) + 3600));

    const session: GuestSession = {
      id: "p",
      wallet: "0x0000000000000000000000000000000000000003",
      evmPrivateKey: "0x3333333333333333333333333333333333333333333333333333333333333333",
      createdAt: Date.now(),
      state,
    };
    const prover: IProver = {
      async prove(witness) {
        assert.ok(witness);
        return { pi_a: ["1"], pi_b: [["1"]], pi_c: ["1"], protocol: "groth16" } as WarrantProof;
      },
    };
    const out = await proveGuest({
      session,
      challenge: {
        method: "POST",
        path: "/v1/translate",
        nonce: "n1",
        merkleRoot: "1",
        amount: "0",
        payTo: "0.0.1",
        bodyHash: "0x00",
      },
      prover,
    });
    assert.ok(out.nullifier);
    const parsed = JSON.parse(out.warrant) as { publicSignals: string[]; nonce: string };
    assert.equal(parsed.nonce, "n1");
    assert.equal(parsed.publicSignals[2], out.nullifier);
  });

  it("proves a three-hop helper session as the chain tip", async function () {
    const state = emptyState();
    ensureIdentity(state, "alice", "alice-pr");
    ensureIdentity(state, "orchestrator", "orch-pr");
    ensureIdentity(state, "translator", "trans-pr");
    state.humanTag = freshFieldTag();
    state.contextHash = freshFieldTag();
    state.rootName = "alice";
    state.rootTier = 0;
    state.rootEpoch = 0;
    const alice = identityOf(state, "alice");
    appendLeaf(state, hashLeaf(alice.publicKey[0], alice.publicKey[1], 0n, 0n));
    assembleGuestTree(state, BigInt(Math.floor(Date.now() / 1000) + 3600));
    appendHelperHop(state);

    const session: GuestSession = {
      id: "h",
      deskId: "desk",
      wallet: "0x0000000000000000000000000000000000000003",
      evmPrivateKey: "0x3333333333333333333333333333333333333333333333333333333333333333",
      createdAt: Date.now(),
      parentId: "p",
      state,
    };
    const prover: IProver = {
      async prove(witness) {
        assert.ok(witness);
        return { pi_a: ["1"], pi_b: [["1"]], pi_c: ["1"], protocol: "groth16" } as WarrantProof;
      },
    };
    const out = await proveGuest({
      session,
      challenge: {
        method: "POST",
        path: "/v1/translate",
        nonce: "n1",
        merkleRoot: "1",
        amount: "0",
        payTo: "0.0.1",
        bodyHash: "0x00",
      },
      prover,
    });
    assert.ok(out.nullifier);
    const parsed = JSON.parse(out.warrant) as { publicSignals: string[]; nonce: string };
    assert.equal(parsed.publicSignals[2], out.nullifier);
  });
});
