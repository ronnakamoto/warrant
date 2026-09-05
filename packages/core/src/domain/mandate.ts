import type { Identity, MandateSignature } from "../crypto/identity.js";
import { sign } from "../crypto/identity.js";
import { hashMandateFields, tagCommitment } from "./hashes.js";
import { assertUint64, isSubset } from "./scope.js";

/** Immutable mandate block (circuit WarrantMandateHash fields). */
export type Mandate = {
  readonly childPkX: bigint;
  readonly childPkY: bigint;
  readonly scope: bigint;
  readonly budgetCap: bigint;
  readonly expiry: bigint;
  readonly tier: bigint;
  readonly epoch: bigint;
  readonly parentHash: bigint;
  readonly tagCommitment: bigint;
};

export type { MandateSignature };

export type SignedMandate = Mandate & {
  readonly hash: bigint;
  readonly signature: MandateSignature;
};

export type CreateMandateArgs = {
  parent: Identity;
  child: Identity;
  scope: bigint;
  budgetCap: bigint;
  expiry: bigint;
  tier: bigint;
  epoch: bigint;
  parentHash: bigint;
  humanTag: bigint;
  parentScope?: bigint;
  parentBudgetCap?: bigint;
  parentExpiry?: bigint;
};

export function hashMandate(m: Mandate): bigint {
  return hashMandateFields({
    childPkX: m.childPkX,
    childPkY: m.childPkY,
    scope: m.scope,
    budget: m.budgetCap,
    expiry: m.expiry,
    tier: m.tier,
    epoch: m.epoch,
    parentHash: m.parentHash,
    tagCommitment: m.tagCommitment,
  });
}

/**
 * Client-side attenuation + EdDSA-Poseidon signature over hashMandate.
 * Hop 0 uses parentHash = 0n (signed by the root key).
 */
export function createMandate(args: CreateMandateArgs): SignedMandate {
  assertUint64(args.scope, "scope");
  assertUint64(args.budgetCap, "budgetCap");
  assertUint64(args.expiry, "expiry");

  if (args.parentScope !== undefined && !isSubset(args.parentScope, args.scope)) {
    throw new Error("scope is not a subset of parent");
  }
  if (args.parentBudgetCap !== undefined && args.budgetCap > args.parentBudgetCap) {
    throw new Error("budgetCap exceeds parent");
  }
  if (args.parentExpiry !== undefined && args.expiry > args.parentExpiry) {
    throw new Error("expiry exceeds parent");
  }

  const mandate: Mandate = {
    childPkX: args.child.publicKey[0],
    childPkY: args.child.publicKey[1],
    scope: args.scope,
    budgetCap: args.budgetCap,
    expiry: args.expiry,
    tier: args.tier,
    epoch: args.epoch,
    parentHash: args.parentHash,
    tagCommitment: tagCommitment(args.humanTag),
  };
  const hash = hashMandate(mandate);
  const signature = sign(args.parent, hash);
  return { ...mandate, hash, signature };
}
