import type { Identity } from "../crypto/identity.js";
import { sign } from "../crypto/identity.js";
import { membershipProof } from "../crypto/tree.js";
import type { Group } from "../crypto/tree.js";
import { hashLeaf, hashNullifier } from "../domain/hashes.js";
import type { SignedMandate } from "../domain/mandate.js";
import { publicsFromWitness, type PublicInputs } from "../domain/public-inputs.js";

export const DEPTH = 2;

export type WarrantWitness = {
  // public 8-tuple unchanged
  merkleRoot: bigint;
  contextHash: bigint;
  nullifier: bigint;
  effectiveScope: bigint;
  effectiveBudgetCap: bigint;
  minExpiry: bigint;
  tier: bigint;
  requestHash: bigint;
  rootPkX: bigint;
  rootPkY: bigint;
  epoch: bigint;
  merkleDepth: bigint;
  merkleIndex: bigint;
  siblings: bigint[];
  parentParentHash: bigint;
  parentAx: bigint;
  parentAy: bigint;
  scopes: bigint[]; // length 2
  budgets: bigint[];
  expiries: bigint[];
  humanTag: bigint;
  childPkX: bigint[];
  childPkY: bigint[];
  sigS: bigint[];
  sigR8x: bigint[];
  sigR8y: bigint[];
  reqS: bigint;
  reqR8x: bigint;
  reqR8y: bigint;
  hopIndex: bigint[];
  hopDepth: bigint[];
  hopSiblings: bigint[][];
};

export type BuildWitnessArgs = {
  rootPk: readonly [bigint, bigint];
  parentSignerPk: readonly [bigint, bigint];
  leaf: Identity;
  mandates: SignedMandate[]; // length === 2
  group: Group;
  leafIndex: number;
  humanTag: bigint;
  contextHash: bigint;
  requestHash: bigint;
  minExpiry: bigint;
  epoch: bigint;
  tier: bigint;
};

function fieldToString(v: bigint | string | number): string {
  return typeof v === "bigint" ? v.toString() : String(v);
}

/** snarkjs witness calculator wants decimal strings. */
export function stringifyWitness(
  w: WarrantWitness,
): Record<string, string | string[] | string[][]> {
  return {
    merkleRoot: fieldToString(w.merkleRoot),
    contextHash: fieldToString(w.contextHash),
    nullifier: fieldToString(w.nullifier),
    effectiveScope: fieldToString(w.effectiveScope),
    effectiveBudgetCap: fieldToString(w.effectiveBudgetCap),
    minExpiry: fieldToString(w.minExpiry),
    tier: fieldToString(w.tier),
    requestHash: fieldToString(w.requestHash),
    rootPkX: fieldToString(w.rootPkX),
    rootPkY: fieldToString(w.rootPkY),
    epoch: fieldToString(w.epoch),
    merkleDepth: fieldToString(w.merkleDepth),
    merkleIndex: fieldToString(w.merkleIndex),
    siblings: w.siblings.map(fieldToString),
    parentParentHash: fieldToString(w.parentParentHash),
    parentAx: fieldToString(w.parentAx),
    parentAy: fieldToString(w.parentAy),
    scopes: w.scopes.map(fieldToString),
    budgets: w.budgets.map(fieldToString),
    expiries: w.expiries.map(fieldToString),
    humanTag: fieldToString(w.humanTag),
    childPkX: w.childPkX.map(fieldToString),
    childPkY: w.childPkY.map(fieldToString),
    sigS: w.sigS.map(fieldToString),
    sigR8x: w.sigR8x.map(fieldToString),
    sigR8y: w.sigR8y.map(fieldToString),
    reqS: fieldToString(w.reqS),
    reqR8x: fieldToString(w.reqR8x),
    reqR8y: fieldToString(w.reqR8y),
    hopIndex: w.hopIndex.map(fieldToString),
    hopDepth: w.hopDepth.map(fieldToString),
    hopSiblings: w.hopSiblings.map((row) => row.map(fieldToString)),
  };
}

export function buildWitness(args: BuildWitnessArgs): {
  witness: WarrantWitness;
  publics: PublicInputs;
} {
  if (args.mandates.length !== DEPTH) {
    throw new Error(`mandates.length must be ${DEPTH}`);
  }

  const last = args.mandates[DEPTH - 1]!;
  const reqSig = sign(args.leaf, args.requestHash);
  const merkle = membershipProof(args.group, args.leafIndex);
  const hopIndex: bigint[] = [];
  const hopDepth: bigint[] = [];
  const hopSiblings: bigint[][] = [];
  for (let i = 0; i < DEPTH; i++) {
    const hash = args.mandates[i]!.hash;
    const idx = args.group.indexOf(hash);
    if (idx < 0) {
      throw new Error(`mandate hash not in the forest at hop ${i}`);
    }
    const hop = membershipProof(args.group, idx);
    hopIndex.push(hop.index);
    hopDepth.push(hop.depth);
    hopSiblings.push(hop.siblings);
  }
  const expectedLeaf = hashLeaf(args.rootPk[0], args.rootPk[1], args.tier, args.epoch);
  if (args.group.members[args.leafIndex] !== expectedLeaf) {
    throw new Error("group leaf does not match hashLeaf(root, tier, epoch)");
  }

  const parent = args.mandates[0]!;
  const witness: WarrantWitness = {
    merkleRoot: merkle.root,
    contextHash: args.contextHash,
    nullifier: hashNullifier(args.humanTag, args.contextHash),
    effectiveScope: last.scope,
    effectiveBudgetCap: last.budgetCap,
    minExpiry: args.minExpiry,
    tier: args.tier,
    requestHash: args.requestHash,
    rootPkX: args.rootPk[0],
    rootPkY: args.rootPk[1],
    epoch: args.epoch,
    merkleDepth: merkle.depth,
    merkleIndex: merkle.index,
    siblings: merkle.siblings,
    parentParentHash: parent.parentHash,
    parentAx: args.parentSignerPk[0],
    parentAy: args.parentSignerPk[1],
    scopes: args.mandates.map((m) => m.scope),
    budgets: args.mandates.map((m) => m.budgetCap),
    expiries: args.mandates.map((m) => m.expiry),
    humanTag: args.humanTag,
    childPkX: args.mandates.map((m) => m.childPkX),
    childPkY: args.mandates.map((m) => m.childPkY),
    sigS: args.mandates.map((m) => m.signature.S),
    sigR8x: args.mandates.map((m) => m.signature.R8x),
    sigR8y: args.mandates.map((m) => m.signature.R8y),
    reqS: reqSig.S,
    reqR8x: reqSig.R8x,
    reqR8y: reqSig.R8y,
    hopIndex,
    hopDepth,
    hopSiblings,
  };

  return { witness, publics: publicsFromWitness(witness) };
}
