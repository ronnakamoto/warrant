import { Group } from "@semaphore-protocol/group";

export { Group };

/** Circuit BinaryMerkleRoot(20). */
export const MAX_MERKLE_DEPTH = 20;

/** Demo / Liskov: `0n` is never an acceptable registry root. */
export interface IRootChecker {
  isAcceptable(merkleRoot: bigint): Promise<boolean>;
}

export function createGroup(members: bigint[] = []): Group {
  return new Group(members);
}

export function padSiblings(siblings: readonly (bigint | string | number)[]): bigint[] {
  if (siblings.length > MAX_MERKLE_DEPTH) {
    throw new Error(`sibling path longer than ${MAX_MERKLE_DEPTH}`);
  }
  const out = siblings.map((s) => BigInt(s));
  while (out.length < MAX_MERKLE_DEPTH) out.push(0n);
  return out;
}

export type MembershipProof = {
  root: bigint;
  index: bigint;
  depth: bigint;
  siblings: bigint[];
};

export function membershipProof(group: Group, index: number): MembershipProof {
  const proof = group.generateMerkleProof(index);
  return {
    root: group.root,
    index: BigInt(proof.index),
    depth: BigInt(proof.siblings.length),
    siblings: padSiblings(proof.siblings),
  };
}
