/**
 * Domain-separated Poseidon helpers — must match circuits/lib/domains.circom
 * and circuits/lib/warrant_hashes.circom exactly.
 *
 * DST = big-endian UTF-8 of the domain string, interpreted as a field element.
 */
import { poseidon2, poseidon3, poseidon5, poseidon10 } from "poseidon-lite";

export const DOMAIN = {
  leaf: BigInt("0x77617272616e742f6c656166"), // warrant/leaf
  mandate: BigInt("0x77617272616e742f6d616e64617465"), // warrant/mandate
  nullifier: BigInt("0x77617272616e742f6e756c6c6966696572"), // warrant/nullifier
  tag: BigInt("0x77617272616e742f746167"), // warrant/tag
};

export function tagCommitment(humanTag) {
  return poseidon2([DOMAIN.tag, BigInt(humanTag)]);
}

export function leafHash(pkX, pkY, tier, epoch) {
  return poseidon5([DOMAIN.leaf, BigInt(pkX), BigInt(pkY), BigInt(tier), BigInt(epoch)]);
}

export function nullifierHash(humanTag, contextHash) {
  return poseidon3([DOMAIN.nullifier, BigInt(humanTag), BigInt(contextHash)]);
}

/** Mandate message signed by the parent (or root for hop 0). */
export function mandateHash({
  childPkX,
  childPkY,
  scope,
  budget,
  expiry,
  tier,
  epoch,
  parentHash,
  tagCommitment: tagC,
}) {
  return poseidon10([
    DOMAIN.mandate,
    BigInt(childPkX),
    BigInt(childPkY),
    BigInt(scope),
    BigInt(budget),
    BigInt(expiry),
    BigInt(tier),
    BigInt(epoch),
    BigInt(parentHash),
    BigInt(tagC),
  ]);
}
