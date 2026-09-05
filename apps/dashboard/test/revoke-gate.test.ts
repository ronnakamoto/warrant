import assert from "node:assert/strict";
import {
  TRANSLATE,
  hashChallenge,
  type INullifierStore,
  type IRootChecker,
  type IVerifier,
  type PublicInputs,
  type WarrantProof,
} from "@warrant/core";
import { createWarrantPipeline } from "@warrant/x402";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { hashLeaf } from "../src/lib/leaf.ts";
import { applyRevokeLocal, revokeSiblings } from "../src/lib/tree.ts";

/**
 * WP7 gate: after a local revoke (same sibling math as MandateRegistry.revoke),
 * authorize with the pre-revoke merkleRoot → 403 root_revoked when the checker
 * tracks the new currentRoot.
 */
const rootDir = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const fixture = JSON.parse(
  readFileSync(join(rootDir, "contracts/test/fixtures/registry.json"), "utf8"),
);

const path = "/v1/translate";
const nonce = "n-revoke-gate";

function memoryNullifiers(): INullifierStore {
  const seen = new Set<string>();
  const free = new Map<string, number>();
  return {
    async takeRequest(n, r) {
      const k = `${n}:${r}`;
      if (seen.has(k)) return "seen";
      seen.add(k);
      return "fresh";
    },
    async consumeFree(n, limit) {
      const key = String(n);
      const used = free.get(key) ?? 0;
      if (used >= limit) return "exhausted";
      free.set(key, used + 1);
      return "granted";
    },
  };
}

function header(p: PublicInputs, proof: WarrantProof = { pi_a: [], pi_b: [], pi_c: [] }): string {
  return JSON.stringify({
    proof,
    publicSignals: [
      p.merkleRoot,
      p.contextHash,
      p.nullifier,
      p.effectiveScope,
      p.effectiveBudgetCap,
      p.minExpiry,
      p.tier,
      p.requestHash,
    ].map(String),
  });
}

describe("@warrant/dashboard revoke → root_revoked gate", function () {
  it("old root rejected after LeanIMT revoke mirror updates live root", async function () {
    const members = [
      BigInt(fixture.alice.leaf0),
      BigInt(fixture.bob.leaf0),
      BigInt(fixture.carol.leaf0),
    ];
    const oldRoot = BigInt(fixture.rootAfterCarol);
    const siblings = revokeSiblings(members, 0);
    assert.equal(siblings.length, fixture.revokeSiblings.length);

    const newLeaf = hashLeaf(
      BigInt(fixture.alice.pkX),
      BigInt(fixture.alice.pkY),
      2n,
      1n,
    );
    const after = applyRevokeLocal(members, 0, newLeaf);
    assert.equal(after.root.toString(), fixture.rootAfterRevoke);

    let liveRoot = after.root;
    const roots: IRootChecker = {
      async isAcceptable(r) {
        return r !== 0n && r === liveRoot;
      },
    };
    const verifier: IVerifier = {
      async verify() {
        return true;
      },
    };

    const challenge = {
      method: "POST",
      path,
      nonce,
      merkleRoot: String(oldRoot),
      amount: "100000",
      payTo: "0.0.10311260",
      bodyHash: "",
    };

    const publics: PublicInputs = {
      merkleRoot: oldRoot,
      contextHash: 99n,
      nullifier: 42n,
      effectiveScope: TRANSLATE,
      effectiveBudgetCap: 200_000n,
      minExpiry: 1_700_000_000n,
      tier: 2n,
      requestHash: hashChallenge({
        method: "POST",
        path,
        nonce,
        merkleRoot: String(oldRoot),
        amount: "100000",
        payTo: "0.0.10311260",
        bodyHash: "",
      }),
    };

    const pipe = createWarrantPipeline({
      verifier,
      roots,
      nullifiers: memoryNullifiers(),
      hashChallenge,
      policy: { requireScope: TRANSLATE, minTier: 1, freeCallsPerHuman: 3 },
    });

    const result = await pipe.handle({
      warrantHeader: header(publics),
      method: "POST",
      path,
      challenge,
    });

    assert.equal(result.kind, "abort");
    if (result.kind === "abort") {
      assert.equal(result.reason, "root_revoked");
    }
  });
});
