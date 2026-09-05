/**
 * Domain-separated Poseidon hashes — must match circuits/lib/domains.circom
 * and circuits/lib/warrant_hashes.circom exactly.
 *
 * DST = big-endian UTF-8 of the domain string, interpreted as a field element.
 */
import { poseidon2, poseidon3, poseidon5, poseidon10 } from "../crypto/poseidon.js";

export const DOMAIN = {
  leaf: BigInt("0x77617272616e742f6c656166"), // warrant/leaf
  mandate: BigInt("0x77617272616e742f6d616e64617465"), // warrant/mandate
  nullifier: BigInt("0x77617272616e742f6e756c6c6966696572"), // warrant/nullifier
  tag: BigInt("0x77617272616e742f746167"), // warrant/tag
} as const;

export function tagCommitment(humanTag: bigint): bigint {
  return poseidon2([DOMAIN.tag, humanTag]);
}

export function hashLeaf(pkX: bigint, pkY: bigint, tier: bigint, epoch: bigint): bigint {
  return poseidon5([DOMAIN.leaf, pkX, pkY, tier, epoch]);
}

export function hashNullifier(humanTag: bigint, contextHash: bigint): bigint {
  return poseidon3([DOMAIN.nullifier, humanTag, contextHash]);
}

export type MandateHashInput = {
  childPkX: bigint;
  childPkY: bigint;
  scope: bigint;
  budget: bigint;
  expiry: bigint;
  tier: bigint;
  epoch: bigint;
  parentHash: bigint;
  tagCommitment: bigint;
};

/** Signed mandate message: Poseidon(10) with DOMAIN_MANDATE. */
export function hashMandateFields(m: MandateHashInput): bigint {
  return poseidon10([
    DOMAIN.mandate,
    m.childPkX,
    m.childPkY,
    m.scope,
    m.budget,
    m.expiry,
    m.tier,
    m.epoch,
    m.parentHash,
    m.tagCommitment,
  ]);
}
