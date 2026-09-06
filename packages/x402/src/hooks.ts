import type { HTTPRequestContext, RouteConfig } from "@x402/core/server";
import type { ChallengeParts } from "@warrant/core";
import type { WarrantPipeline } from "./pipeline.js";

export type CreateHooksArgs = {
  pipeline: WarrantPipeline;
  /**
   * Resolve **server-authoritative** challenge parts.
   * Return `null` when no issued challenge exists → abort `challenge_missing`.
   */
  resolveChallenge: (
    ctx: HTTPRequestContext,
    route: RouteConfig,
  ) => ChallengeParts | null | Promise<ChallengeParts | null>;
  /**
   * Optional host settle after free quota. True → grant this request.
   * False or missing → 402 so the client can pay.
   */
  sponsorGrant?: (nullifier: bigint) => Promise<boolean>;
};

type ProtectedResult = void | { grantAccess: true } | { abort: true; reason: string };

/**
 * `onProtectedRequest` adapter — never `onBeforeVerify`.
 */
export function createWarrantHooks(args: CreateHooksArgs) {
  return {
    async onProtectedRequest(
      context: HTTPRequestContext,
      routeConfig: RouteConfig,
    ): Promise<ProtectedResult> {
      const warrantHeader = context.adapter.getHeader("warrant") ?? undefined;
      // Missing header → continue to 402 (client learns challenge). Do not require
      // an issued challenge yet.
      if (!warrantHeader) {
        const result = await args.pipeline.handle({
          warrantHeader: undefined,
          method: context.adapter.getMethod(),
          path: context.adapter.getPath(),
          challenge: {
            method: context.adapter.getMethod(),
            path: context.adapter.getPath() || "/",
            nonce: "unused",
            merkleRoot: "0",
            amount: "",
            payTo: "",
            bodyHash: "",
          },
        });
        if (result.kind === "continue") return;
        if (result.kind === "abort") return { abort: true, reason: result.reason };
        return;
      }

      const challenge = await args.resolveChallenge(context, routeConfig);
      if (!challenge) {
        return { abort: true, reason: "challenge_missing" };
      }

      const result = await args.pipeline.handle({
        warrantHeader,
        method: context.adapter.getMethod(),
        path: context.adapter.getPath(),
        challenge,
      });
      if (result.kind === "grant") return { grantAccess: true };
      if (result.kind === "abort") return { abort: true, reason: result.reason };
      if (
        result.kind === "pay" &&
        args.sponsorGrant &&
        (await args.sponsorGrant(result.nullifier))
      ) {
        return { grantAccess: true };
      }
      return;
    },
  };
}
