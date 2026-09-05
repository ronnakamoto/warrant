import { LeanIMT } from "@zk-kit/lean-imt";
import { leanHash } from "./leaf";

export type TreeMirror = {
  members: bigint[];
  root: bigint;
};

/** One LeanIMT build — use for root + siblings without rebuilding twice. */
export type AnalyzedTree = {
  root: bigint;
  size: number;
  siblingsAt(index: number): bigint[];
};

export function buildTree(members: readonly bigint[]): LeanIMT {
  const tree = new LeanIMT((a, b) => leanHash(BigInt(a), BigInt(b)));
  for (const leaf of members) tree.insert(leaf);
  return tree;
}

export function analyzeMembers(members: readonly bigint[]): AnalyzedTree {
  if (members.length === 0) {
    return {
      root: 0n,
      size: 0,
      siblingsAt() {
        throw new Error("empty tree");
      },
    };
  }
  const tree = buildTree(members);
  return {
    root: BigInt(tree.root),
    size: members.length,
    siblingsAt(index: number) {
      if (index < 0 || index >= members.length) {
        throw new Error(`leaf index ${index} out of range (size ${members.length})`);
      }
      return tree.generateProof(index).siblings.map((s) => BigInt(s));
    },
  };
}

export function mirrorFromMembers(members: readonly bigint[]): TreeMirror {
  if (members.length === 0) return { members: [], root: 0n };
  const analyzed = analyzeMembers(members);
  return { members: [...members], root: analyzed.root };
}

/** LeanIMT siblings for `revoke(uint256[] siblings)` at `index`. */
export function revokeSiblings(members: readonly bigint[], index: number): bigint[] {
  return analyzeMembers(members).siblingsAt(index);
}

/**
 * Local mirror of on-chain revoke: replace leaf at index and return new root.
 * Call only after a successful `MandateRegistry.revoke` receipt.
 */
export function applyRevokeLocal(
  members: readonly bigint[],
  index: number,
  newLeaf: bigint,
): TreeMirror {
  const next = members.map((m, i) => (i === index ? newLeaf : m));
  return mirrorFromMembers(next);
}
