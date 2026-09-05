/**
 * Deterministic witness fixtures for lean + full circuits.
 */
import { Group } from "@semaphore-protocol/group";
import { Identity } from "@semaphore-protocol/identity";
import { leafHash, mandateHash, nullifierHash, tagCommitment } from "./hashes.mjs";

export const MAX_DEPTH = 20;
export const D = 4;

export function padSiblings(siblings) {
  const out = siblings.map((s) => BigInt(s).toString());
  while (out.length < MAX_DEPTH) out.push("0");
  return out;
}

export function bigish(v) {
  return typeof v === "bigint" ? v.toString() : String(v);
}

/** Shared attenuation pad used across lean/full happy paths. */
export function attenuationPad(now) {
  return {
    scopes: [7n, 1n, 1n, 1n],
    budgets: [2_000_000n, 200_000n, 200_000n, 200_000n],
    expiries: [now + 86400n, now + 3600n, now + 3600n, now + 3600n],
    enabled: [1, 1, 0, 0],
  };
}

export function buildLeanFixture() {
  const alice = new Identity("warrant-wp1-alice");
  const bob = new Identity("warrant-wp1-bob");
  const carol = new Identity("warrant-wp1-carol");
  const tier = 2n;
  const now = BigInt(Math.floor(Date.now() / 1000));
  const humanTag = 42n;
  const contextHash = 99n;

  const aliceLeaf0 = leafHash(alice.publicKey[0], alice.publicKey[1], tier, 0n);
  const bobLeaf = leafHash(bob.publicKey[0], bob.publicKey[1], tier, 0n);
  const carolLeaf = leafHash(carol.publicKey[0], carol.publicKey[1], tier, 0n);
  const aliceLeaf1 = leafHash(alice.publicKey[0], alice.publicKey[1], tier, 1n);

  const group = new Group();
  group.addMember(aliceLeaf0);
  group.addMember(bobLeaf);
  group.addMember(carolLeaf);
  const rootBefore = group.root;
  const proofBefore = group.generateMerkleProof(0);

  group.updateMember(0, aliceLeaf1);
  const rootAfter = group.root;
  const proofAfter = group.generateMerkleProof(0);

  const pad = attenuationPad(now);

  function input({ merkleRoot, epoch, proof, requestHash = 123456789n, overrides = {} }) {
    return {
      merkleRoot: bigish(merkleRoot),
      contextHash: bigish(contextHash),
      nullifier: bigish(nullifierHash(humanTag, contextHash)),
      effectiveScope: "1",
      effectiveBudgetCap: "200000",
      minExpiry: bigish(now),
      tier: bigish(tier),
      requestHash: bigish(requestHash),
      rootPkX: bigish(alice.publicKey[0]),
      rootPkY: bigish(alice.publicKey[1]),
      epoch: bigish(epoch),
      merkleDepth: bigish(proof.siblings.length),
      merkleIndex: bigish(proof.index),
      siblings: padSiblings(proof.siblings),
      scopes: pad.scopes.map(bigish),
      budgets: pad.budgets.map(bigish),
      expiries: pad.expiries.map(bigish),
      enabled: pad.enabled.map(bigish),
      humanTag: bigish(humanTag),
      ...overrides,
    };
  }

  return {
    alice,
    tier,
    now,
    humanTag,
    contextHash,
    rootBefore,
    rootAfter,
    proofBefore,
    proofAfter,
    pad,
    input,
  };
}

export function buildFullFixture() {
  const rootId = new Identity("warrant-wp2-root");
  const agent = new Identity("warrant-wp2-agent");
  const translator = new Identity("warrant-wp2-translator");
  const dummy = agent;

  const now = BigInt(Math.floor(Date.now() / 1000));
  const tier = 2n;
  const epoch = 0n;
  const humanTag = 42n;
  const contextHash = 99n;
  const tagC = tagCommitment(humanTag);
  const leaf = leafHash(rootId.publicKey[0], rootId.publicKey[1], tier, epoch);

  const group = new Group();
  group.addMember(leaf);
  group.addMember(11n);
  group.addMember(22n);
  const mProof = group.generateMerkleProof(0);

  const pad = attenuationPad(now);
  const children = [agent, translator, dummy, dummy];

  function buildMandateSigs(tagCValue) {
    const sigs = [];
    let parent = 0n;
    for (let i = 0; i < D; i++) {
      const M = mandateHash({
        childPkX: children[i].publicKey[0],
        childPkY: children[i].publicKey[1],
        scope: pad.scopes[i],
        budget: pad.budgets[i],
        expiry: pad.expiries[i],
        tier,
        epoch,
        parentHash: parent,
        tagCommitment: tagCValue,
      });
      const signer = i === 0 ? rootId : children[i - 1];
      sigs.push(signer.signMessage(M));
      parent = M;
    }
    return sigs;
  }

  const mandateSigs = buildMandateSigs(tagC);
  const requestHash = 123456789n;
  const reqSig = translator.signMessage(requestHash);

  function input(overrides = {}) {
    return {
      merkleRoot: bigish(group.root),
      contextHash: bigish(contextHash),
      nullifier: bigish(nullifierHash(humanTag, contextHash)),
      effectiveScope: "1",
      effectiveBudgetCap: "200000",
      minExpiry: bigish(now),
      tier: bigish(tier),
      requestHash: bigish(requestHash),
      rootPkX: bigish(rootId.publicKey[0]),
      rootPkY: bigish(rootId.publicKey[1]),
      epoch: bigish(epoch),
      merkleDepth: bigish(mProof.siblings.length),
      merkleIndex: bigish(mProof.index),
      siblings: padSiblings(mProof.siblings),
      scopes: pad.scopes.map(bigish),
      budgets: pad.budgets.map(bigish),
      expiries: pad.expiries.map(bigish),
      enabled: pad.enabled.map(bigish),
      humanTag: bigish(humanTag),
      childPkX: children.map((c) => bigish(c.publicKey[0])),
      childPkY: children.map((c) => bigish(c.publicKey[1])),
      sigS: mandateSigs.map((s) => bigish(s.S)),
      sigR8x: mandateSigs.map((s) => bigish(s.R8[0])),
      sigR8y: mandateSigs.map((s) => bigish(s.R8[1])),
      reqS: bigish(reqSig.S),
      reqR8x: bigish(reqSig.R8[0]),
      reqR8y: bigish(reqSig.R8[1]),
      ...overrides,
    };
  }

  return {
    rootId,
    agent,
    translator,
    tier,
    epoch,
    now,
    humanTag,
    contextHash,
    tagC,
    group,
    mProof,
    pad,
    children,
    mandateSigs,
    requestHash,
    reqSig,
    buildMandateSigs,
    input,
  };
}
