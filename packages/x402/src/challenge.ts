import { randomBytes } from "node:crypto";
import type { WarrantPolicy } from "./policy.js";

export type WarrantChallengeInfo = {
  version: "1";
  nonce: string;
  issuedAt: string;
  merkleRoot: string;
  requireScope: string;
  minTier: number;
};

export type BuildChallengeArgs = {
  policy: WarrantPolicy;
  /** Live registry root as decimal string (or 0x-hex). */
  merkleRoot: string;
  nonce?: string;
  issuedAt?: string;
};

/** Build `extensions.warrant.info` for PaymentRequired responses. */
export function buildWarrantChallengeInfo(args: BuildChallengeArgs): WarrantChallengeInfo {
  const nonce = args.nonce ?? randomBytes(16).toString("hex");
  return {
    version: "1",
    nonce,
    issuedAt: args.issuedAt ?? new Date().toISOString(),
    merkleRoot: args.merkleRoot,
    requireScope: args.policy.requireScope.toString(),
    minTier: args.policy.minTier,
  };
}
