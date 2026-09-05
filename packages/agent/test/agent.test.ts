import assert from "node:assert/strict";
import { mkdtempSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createMandate, hashLeaf, keygen, TRANSLATE } from "@warrant/core";
import {
  appendLeaf,
  emptyState,
  ensureIdentity,
  freshFieldTag,
  loadState,
  parseScope,
  parseTtl,
  rebuildGroup,
  replayMandates,
  requireTags,
  saveState,
  type WarrantState,
} from "../src/store.ts";
import { warrantHeaderJson, proveForChallenge } from "../src/prove-flow.ts";
import type { IProver, WarrantProof } from "@warrant/core";

describe("@warrant/agent store + delegate", function () {
  it("parseScope and parseTtl", function () {
    assert.equal(parseScope("translate"), TRANSLATE);
    assert.equal(parseScope("translate,fetch"), TRANSLATE | 2n);
    const exp = parseTtl("1h");
    const now = BigInt(Math.floor(Date.now() / 1000));
    assert.ok(exp > now && exp <= now + 3600n + 5n);
  });

  it("empty state has no shared humanTag defaults", function () {
    const s = emptyState();
    assert.equal(s.humanTag, undefined);
    assert.equal(s.contextHash, undefined);
    assert.throws(() => requireTags(s));
  });

  it("saveState writes mode 0o600", function () {
    const dir = mkdtempSync(join(tmpdir(), "warrant-agent-"));
    const path = join(dir, "state.json");
    const state = emptyState();
    state.humanTag = freshFieldTag();
    state.contextHash = freshFieldTag();
    saveState(state, path);
    const mode = statSync(path).mode & 0o777;
    assert.equal(mode, 0o600);
  });

  it("freshFieldTag values differ", function () {
    assert.notEqual(freshFieldTag(), freshFieldTag());
  });

  it("keygen → local bind tags → 2-hop delegate → replayMandates stable", function () {
    const dir = mkdtempSync(join(tmpdir(), "warrant-agent-"));
    const path = join(dir, "state.json");
    let state: WarrantState = emptyState();
    const alice = ensureIdentity(state, "alice", "seed-alice");
    const orch = ensureIdentity(state, "orchestrator", "seed-orch");
    const tr = ensureIdentity(state, "translator", "seed-tr");
    const tier = 2;
    const leaf = hashLeaf(alice.publicKey[0], alice.publicKey[1], BigInt(tier), 0n);
    appendLeaf(state, leaf);
    state.rootName = "alice";
    state.rootTier = tier;
    state.rootEpoch = 0;
    state.humanTag = freshFieldTag();
    state.contextHash = freshFieldTag();
    const { humanTag } = requireTags(state);

    const now = BigInt(Math.floor(Date.now() / 1000));
    const m1 = createMandate({
      parent: alice,
      child: orch,
      scope: TRANSLATE,
      budgetCap: 1_000_000n,
      expiry: now + 86400n,
      tier: BigInt(tier),
      epoch: 0n,
      parentHash: 0n,
      humanTag: BigInt(humanTag),
    });
    const m2 = createMandate({
      parent: orch,
      child: tr,
      scope: TRANSLATE,
      budgetCap: 100_000n,
      expiry: now + 3600n,
      tier: BigInt(tier),
      epoch: 0n,
      parentHash: m1.hash,
      humanTag: BigInt(humanTag),
      parentScope: m1.scope,
      parentBudgetCap: m1.budgetCap,
      parentExpiry: m1.expiry,
    });
    for (const [from, to, m] of [
      ["alice", "orchestrator", m1] as const,
      ["orchestrator", "translator", m2] as const,
    ]) {
      state.mandates.push({
        from,
        to,
        scope: m.scope.toString(),
        budgetCap: m.budgetCap.toString(),
        expiry: m.expiry.toString(),
        tier: m.tier.toString(),
        epoch: m.epoch.toString(),
        parentHash: m.parentHash.toString(),
        humanTag,
        hash: m.hash.toString(),
        signature: {
          S: m.signature.S.toString(),
          R8x: m.signature.R8x.toString(),
          R8y: m.signature.R8y.toString(),
        },
      });
    }
    saveState(state, path);
    state = loadState(path);
    const replayed = replayMandates(state);
    assert.equal(replayed.length, 2);
    assert.equal(replayed[0]!.hash, m1.hash);
    assert.equal(rebuildGroup(state).root, createGroupRoot(leaf));
  });

  it("widened scope rejected at createMandate", function () {
    const parent = keygen("p");
    const child = keygen("c");
    assert.throws(() =>
      createMandate({
        parent,
        child,
        scope: TRANSLATE | 2n,
        budgetCap: 1n,
        expiry: 1n,
        tier: 0n,
        epoch: 0n,
        parentHash: 0n,
        humanTag: 1n,
        parentScope: TRANSLATE,
      }),
    );
  });

  it("proveForChallenge with fake prover emits warrant header + nonce", async function () {
    const dir = mkdtempSync(join(tmpdir(), "warrant-agent-"));
    const path = join(dir, "state.json");
    const alice = keygen("a2");
    const orch = keygen("o2");
    const tr = keygen("t2");
    const tier = 1;
    const leaf = hashLeaf(alice.publicKey[0], alice.publicKey[1], BigInt(tier), 0n);
    const humanTag = freshFieldTag();
    const contextHash = freshFieldTag();
    const state: WarrantState = {
      version: 1,
      identities: {
        alice: {
          privateKey: String(alice.privateKey),
          pkX: alice.publicKey[0].toString(),
          pkY: alice.publicKey[1].toString(),
        },
        orchestrator: {
          privateKey: String(orch.privateKey),
          pkX: orch.publicKey[0].toString(),
          pkY: orch.publicKey[1].toString(),
        },
        translator: {
          privateKey: String(tr.privateKey),
          pkX: tr.publicKey[0].toString(),
          pkY: tr.publicKey[1].toString(),
        },
      },
      members: [leaf.toString()],
      rootName: "alice",
      rootTier: tier,
      rootEpoch: 0,
      humanTag,
      contextHash,
      mandates: [],
    };
    const now = BigInt(Math.floor(Date.now() / 1000));
    const m1 = createMandate({
      parent: alice,
      child: orch,
      scope: TRANSLATE,
      budgetCap: 1000n,
      expiry: now + 1000n,
      tier: BigInt(tier),
      epoch: 0n,
      parentHash: 0n,
      humanTag: BigInt(humanTag),
    });
    const m2 = createMandate({
      parent: orch,
      child: tr,
      scope: TRANSLATE,
      budgetCap: 500n,
      expiry: now + 500n,
      tier: BigInt(tier),
      epoch: 0n,
      parentHash: m1.hash,
      humanTag: BigInt(humanTag),
      parentScope: m1.scope,
      parentBudgetCap: m1.budgetCap,
      parentExpiry: m1.expiry,
    });
    for (const [from, to, m] of [
      ["alice", "orchestrator", m1] as const,
      ["orchestrator", "translator", m2] as const,
    ]) {
      state.mandates.push({
        from,
        to,
        scope: m.scope.toString(),
        budgetCap: m.budgetCap.toString(),
        expiry: m.expiry.toString(),
        tier: m.tier.toString(),
        epoch: m.epoch.toString(),
        parentHash: m.parentHash.toString(),
        humanTag,
        hash: m.hash.toString(),
        signature: {
          S: m.signature.S.toString(),
          R8x: m.signature.R8x.toString(),
          R8y: m.signature.R8y.toString(),
        },
      });
    }
    saveState(state, path);

    const prover: IProver = {
      async prove(): Promise<WarrantProof> {
        return { pi_a: [], pi_b: [], pi_c: [] };
      },
    };
    const result = await proveForChallenge({
      state,
      as: "translator",
      challenge: {
        method: "POST",
        path: "/v1/translate",
        nonce: "test-nonce",
        merkleRoot: rebuildGroup(state).root.toString(),
        amount: "100000",
        payTo: "0.0.10311260",
        bodyHash: "",
      },
      prover,
    });
    const header = JSON.parse(warrantHeaderJson(result)) as {
      nonce: string;
      publicSignals: string[];
    };
    assert.equal(header.nonce, "test-nonce");
    assert.equal(header.publicSignals.length, 8);
  });
});

function createGroupRoot(leaf: bigint): bigint {
  return rebuildGroup({
    version: 1,
    identities: {},
    members: [leaf.toString()],
    mandates: [],
  }).root;
}
