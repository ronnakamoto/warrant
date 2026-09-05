import type { ResourceServerExtension } from "@x402/core/server";
import { buildWarrantChallengeInfo, type BuildChallengeArgs } from "./challenge.js";
import type { WarrantPolicy } from "./policy.js";

export type CreateExtensionArgs = {
  policy: WarrantPolicy;
  /** Returns live merkle root as decimal string for challenge embedding. */
  getMerkleRoot: () => Promise<string> | string;
};

/**
 * ResourceServerExtension for key `"warrant"`.
 * Dynamic fields regenerate on every PaymentRequired (nonce, issuedAt, merkleRoot).
 */
export function createWarrantExtension(args: CreateExtensionArgs): ResourceServerExtension {
  return {
    key: "warrant",
    dynamicInfoFields: ["nonce", "issuedAt", "merkleRoot"],
    enrichPaymentRequiredResponse: async () => {
      const merkleRoot = await args.getMerkleRoot();
      const info = buildWarrantChallengeInfo({
        policy: args.policy,
        merkleRoot,
      } satisfies BuildChallengeArgs);
      return {
        info,
        schema: { type: "object" },
      };
    },
  };
}
