/**
 * Deterministic witness fixtures for lean + full circuits.
 */
import { Group } from "@semaphore-protocol/group";
import { Identity } from "@semaphore-protocol/identity";
import { leafHash, mandateHash, nullifierHash, tagCommitment } from "./hashes.mjs";

export const MAX_DEPTH = 20;
export const D = 2;

export function padSiblings(siblings) {
  const out = siblings.map((s) => BigInt(s).toString());
  while (out.length < MAX_DEPTH) out.push("0");
  return out;
}

export function bigish(v) {
  return typeof v === "bigint" ? v.toString() : String(v);
}

/** Shared two-hop attenuation pad used across lean/full happy paths. */
export function attenuationPad(now) {
  return {
    scopes: [7n, 1n],
    budgets: [2_000_000n, 200_000n],
    expiries: [now + 86400n, now + 3600n],
  };
}

function leanPad(now) {
  const pad = attenuationPad(now);
  return {
    scopes: [pad.scopes[0], pad.scopes[1], pad.scopes[1], pad.scopes[1]],
    budgets: [pad.budgets[0], pad.budgets[1], pad.budgets[1], pad.budgets[1]],
    expiries: [pad.expiries[0], pad.expiries[1], pad.expiries[1], pad.expiries[1]],
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

  const pad = leanPad(now);

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
  const helper = new Identity("warrant-wp2-helper");
  // On-curve unused parent signer when parentParentHash == 0.
  const orchestrator = new Identity("warrant-wp2-orchestrator");

  const now = BigInt(Math.floor(Date.now() / 1000));
  const tier = 2n;
  const epoch = 0n;
  const humanTag = 42n;
  const contextHash = 99n;
  const tagC = tagCommitment(humanTag);
  const leaf = leafHash(rootId.publicKey[0], rootId.publicKey[1], tier, epoch);

  const group = new Group();
  group.addMember(leaf);

  const pad = attenuationPad(now);
  const children = [agent, translator];

  function hopHashes(tagCValue) {
    const hashes = [];
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
      hashes.push(M);
      parent = M;
    }
    return hashes;
  }

  const hashes = hopHashes(tagC);
  group.addMember(hashes[0]);
  group.addMember(hashes[1]);
  const identityProof = group.generateMerkleProof(0);
  const hopProofs = [group.generateMerkleProof(1), group.generateMerkleProof(2)];

  function hopFields(proofs = hopProofs) {
    return {
      hopIndex: proofs.map((p) => bigish(p.index)),
      hopDepth: proofs.map((p) => bigish(p.siblings.length)),
      hopSiblings: proofs.map((p) => padSiblings(p.siblings)),
    };
  }

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

  const hop3 = {
    scope: pad.scopes[1],
    budget: pad.budgets[1],
    expiry: pad.expiries[1],
  };
  hop3.hash = mandateHash({
    childPkX: helper.publicKey[0],
    childPkY: helper.publicKey[1],
    scope: hop3.scope,
    budget: hop3.budget,
    expiry: hop3.expiry,
    tier,
    epoch,
    parentHash: hashes[1],
    tagCommitment: tagC,
  });
  hop3.sig = translator.signMessage(hop3.hash);
  hop3.reqSig = helper.signMessage(requestHash);

  function helperShapedGroup(includeHop2) {
    const shaped = new Group();
    shaped.addMember(leaf);
    shaped.addMember(hashes[0]);
    if (includeHop2) shaped.addMember(hashes[1]);
    shaped.addMember(hop3.hash);
    return shaped;
  }

  function helperShapedInput({ includeHop2 }) {
    const shaped = helperShapedGroup(includeHop2);
    const idP = shaped.generateMerkleProof(0);
    const hop1P = shaped.generateMerkleProof(1);
    const hop2P = includeHop2 ? shaped.generateMerkleProof(2) : hop1P;
    const hop3P = shaped.generateMerkleProof(includeHop2 ? 3 : 2);
    const hop2Sig = agent.signMessage(hashes[1]);
    return input({
      merkleRoot: bigish(shaped.root),
      merkleDepth: bigish(idP.siblings.length),
      merkleIndex: bigish(idP.index),
      siblings: padSiblings(idP.siblings),
      parentParentHash: bigish(hashes[0]),
      parentAx: bigish(agent.publicKey[0]),
      parentAy: bigish(agent.publicKey[1]),
      scopes: [bigish(pad.scopes[1]), bigish(hop3.scope)],
      budgets: [bigish(pad.budgets[1]), bigish(hop3.budget)],
      expiries: [bigish(pad.expiries[1]), bigish(hop3.expiry)],
      childPkX: [bigish(translator.publicKey[0]), bigish(helper.publicKey[0])],
      childPkY: [bigish(translator.publicKey[1]), bigish(helper.publicKey[1])],
      sigS: [bigish(hop2Sig.S), bigish(hop3.sig.S)],
      sigR8x: [bigish(hop2Sig.R8[0]), bigish(hop3.sig.R8[0])],
      sigR8y: [bigish(hop2Sig.R8[1]), bigish(hop3.sig.R8[1])],
      reqS: bigish(hop3.reqSig.S),
      reqR8x: bigish(hop3.reqSig.R8[0]),
      reqR8y: bigish(hop3.reqSig.R8[1]),
      ...hopFields([hop2P, hop3P]),
    });
  }

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
      merkleDepth: bigish(identityProof.siblings.length),
      merkleIndex: bigish(identityProof.index),
      siblings: padSiblings(identityProof.siblings),
      parentParentHash: "0",
      parentAx: bigish(orchestrator.publicKey[0]),
      parentAy: bigish(orchestrator.publicKey[1]),
      ...hopFields(),
      scopes: pad.scopes.map(bigish),
      budgets: pad.budgets.map(bigish),
      expiries: pad.expiries.map(bigish),
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
    helper,
    orchestrator,
    tier,
    epoch,
    now,
    humanTag,
    contextHash,
    tagC,
    group,
    hashes,
    hopProofs,
    hopFields,
    identityProof,
    mProof: identityProof,
    pad,
    children,
    mandateSigs,
    requestHash,
    reqSig,
    hop3,
    buildMandateSigs,
    input,
    withoutHop2Input() {
      const stripped = new Group();
      stripped.addMember(leaf);
      stripped.addMember(hashes[0]);
      const idP = stripped.generateMerkleProof(0);
      const hop1 = stripped.generateMerkleProof(1);
      // hop 2 dummy against a missing leaf so the leaf-forest check fails
      return input({
        merkleRoot: bigish(stripped.root),
        merkleDepth: bigish(idP.siblings.length),
        merkleIndex: bigish(idP.index),
        siblings: padSiblings(idP.siblings),
        ...hopFields([hop1, hop1]),
      });
    },
    helperShapedInput: () => helperShapedInput({ includeHop2: true }),
    helperShapedWithoutHop2Input: () => helperShapedInput({ includeHop2: false }),
  };
}
