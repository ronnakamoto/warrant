import assert from "node:assert/strict";
import { appendLeaf, emptyState, ensureIdentity, freshFieldTag, identityOf } from "@warrant/agent";
import { hashLeaf, type IProver, type WarrantProof } from "@warrant/core";
import { assembleGuestTree } from "../src/mint.ts";
import { proveGuest } from "../src/prove.ts";
import type { GuestSession } from "../src/session.ts";

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
});
