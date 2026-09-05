import type { Identity } from "../crypto/identity.js";
import { sign } from "../crypto/identity.js";
import { membershipProof } from "../crypto/tree.js";
import type { Group } from "../crypto/tree.js";
import { hashLeaf, hashNullifier } from "../domain/hashes.js";
import { createMandate, type SignedMandate } from "../domain/mandate.js";
import { publicsFromWitness, type PublicInputs } from "../domain/public-inputs.js";

export const DEPTH = 4;

export type WarrantWitness = {
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
  scopes: bigint[];
  budgets: bigint[];
  expiries: bigint[];
  enabled: bigint[];
  humanTag: bigint;
  childPkX: bigint[];
  childPkY: bigint[];
  sigS: bigint[];
  sigR8x: bigint[];
  sigR8y: bigint[];
  reqS: bigint;
  reqR8x: bigint;
  reqR8y: bigint;
};

export type BuildWitnessArgs = {
  root: Identity;
  children: Identity[];
  mandates: SignedMandate[];
  group: Group;
  leafIndex: number;
  humanTag: bigint;
  contextHash: bigint;
  requestHash: bigint;
  minExpiry: bigint;
  /** On-curve dummy identity. Defaults to last enabled child (never Ax=0). */
  dummy?: Identity;
};

function fieldToString(v: bigint | string | number): string {
  return typeof v === "bigint" ? v.toString() : String(v);
}

/** snarkjs witness calculator wants decimal strings. */
export function stringifyWitness(
  w: WarrantWitness,
): Record<string, string | string[]> {
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
    scopes: w.scopes.map(fieldToString),
    budgets: w.budgets.map(fieldToString),
    expiries: w.expiries.map(fieldToString),
    enabled: w.enabled.map(fieldToString),
    humanTag: fieldToString(w.humanTag),
    childPkX: w.childPkX.map(fieldToString),
    childPkY: w.childPkY.map(fieldToString),
    sigS: w.sigS.map(fieldToString),
    sigR8x: w.sigR8x.map(fieldToString),
    sigR8y: w.sigR8y.map(fieldToString),
    reqS: fieldToString(w.reqS),
    reqR8x: fieldToString(w.reqR8x),
    reqR8y: fieldToString(w.reqR8y),
  };
}

function padDummyHops(
  children: Identity[],
  mandates: SignedMandate[],
  humanTag: bigint,
  dummy: Identity,
): { children: Identity[]; mandates: SignedMandate[]; enabled: bigint[] } {
  if (children.length !== mandates.length) {
    throw new Error("children and mandates length mismatch");
  }
  if (mandates.length < 1 || mandates.length > DEPTH) {
    throw new Error(`enabled hops must be 1..${DEPTH}`);
  }
  for (const child of [...children, dummy]) {
    if (child.publicKey[0] === 0n) {
      throw new Error("dummy hops must reuse an on-curve Identity (Ax != 0)");
    }
  }

  const paddedChildren = [...children];
  const paddedMandates = [...mandates];
  const enabled = mandates.map(() => 1n);
  const last = mandates[mandates.length - 1]!;
  let parentHash = last.hash;
  let parentSigner = children[children.length - 1]!;

  while (paddedMandates.length < DEPTH) {
    const hop = createMandate({
      parent: parentSigner,
      child: dummy,
      scope: last.scope,
      budgetCap: last.budgetCap,
      expiry: last.expiry,
      tier: last.tier,
      epoch: last.epoch,
      parentHash,
      humanTag,
      parentScope: last.scope,
      parentBudgetCap: last.budgetCap,
      parentExpiry: last.expiry,
    });
    paddedChildren.push(dummy);
    paddedMandates.push(hop);
    enabled.push(0n);
    parentHash = hop.hash;
    parentSigner = dummy;
  }

  return { children: paddedChildren, mandates: paddedMandates, enabled };
}

export function buildWitness(args: BuildWitnessArgs): {
  witness: WarrantWitness;
  publics: PublicInputs;
} {
  const dummy = args.dummy ?? args.children[args.children.length - 1];
  if (!dummy) throw new Error("need at least one child identity");

  const padded = padDummyHops(args.children, args.mandates, args.humanTag, dummy);
  const lastEnabled = args.mandates[args.mandates.length - 1]!;
  const leaf = args.children[args.children.length - 1]!;
  const reqSig = sign(leaf, args.requestHash);
  const merkle = membershipProof(args.group, args.leafIndex);
  const expectedLeaf = hashLeaf(
    args.root.publicKey[0],
    args.root.publicKey[1],
    lastEnabled.tier,
    lastEnabled.epoch,
  );
  if (args.group.members[args.leafIndex] !== expectedLeaf) {
    throw new Error("group leaf does not match hashLeaf(root, tier, epoch)");
  }

  const witness: WarrantWitness = {
    merkleRoot: merkle.root,
    contextHash: args.contextHash,
    nullifier: hashNullifier(args.humanTag, args.contextHash),
    effectiveScope: lastEnabled.scope,
    effectiveBudgetCap: lastEnabled.budgetCap,
    minExpiry: args.minExpiry,
    tier: lastEnabled.tier,
    requestHash: args.requestHash,
    rootPkX: args.root.publicKey[0],
    rootPkY: args.root.publicKey[1],
    epoch: lastEnabled.epoch,
    merkleDepth: merkle.depth,
    merkleIndex: merkle.index,
    siblings: merkle.siblings,
    scopes: padded.mandates.map((m) => m.scope),
    budgets: padded.mandates.map((m) => m.budgetCap),
    expiries: padded.mandates.map((m) => m.expiry),
    enabled: padded.enabled,
    humanTag: args.humanTag,
    childPkX: padded.children.map((c) => c.publicKey[0]),
    childPkY: padded.children.map((c) => c.publicKey[1]),
    sigS: padded.mandates.map((m) => m.signature.S),
    sigR8x: padded.mandates.map((m) => m.signature.R8x),
    sigR8y: padded.mandates.map((m) => m.signature.R8y),
    reqS: reqSig.S,
    reqR8x: reqSig.R8x,
    reqR8y: reqSig.R8y,
  };

  return { witness, publics: publicsFromWitness(witness) };
}
