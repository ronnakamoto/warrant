import {
  bodyHashFromCanonical,
  hashChallenge,
  type ChallengeParts,
  type INullifierStore,
  type IRootChecker,
  type IVerifier,
} from "@warrant/core";
import {
  HTTPFacilitatorClient,
  x402ResourceServer,
  type FacilitatorClient,
  type HTTPRequestContext,
  type RouteConfig,
} from "@x402/core/server";
import { x402HTTPResourceServer } from "@x402/core/http";
import { ExactHederaScheme } from "@x402/hedera/exact/server";
import { MemoryChallengeStore, type ChallengeStore } from "./challenges.js";
import { createWarrantExtension } from "./extension.js";
import { cachedRequestBody, hasRequestBodyStore } from "./body-als.js";
import { createWarrantHooks } from "./hooks.js";
import { createWarrantPipeline } from "./pipeline.js";
import type { WarrantPolicy } from "./policy.js";

export type WarrantShopConfig = {
  /** x402 route key, e.g. `"POST /v1/echo"`. */
  route: `POST ${string}`;
  description?: string;
  policy: WarrantPolicy;
  amount: string;
  payTo: string;
  feePayer?: string;
  verifier: IVerifier;
  roots: IRootChecker;
  getMerkleRoot: () => Promise<string> | string;
  nullifiers: INullifierStore;
  challenges?: ChallengeStore;
  facilitatorUrl?: string;
  facilitatorClient?: FacilitatorClient;
  sponsorGrant?: (nullifier: bigint) => Promise<boolean>;
  /** Default path if the adapter returns empty. */
  defaultPath?: string;
};

export type WarrantShop = {
  http: import("@x402/core/http").x402HTTPResourceServer;
  server: import("@x402/core/server").x402ResourceServer;
  policy: WarrantPolicy;
  nullifiers: INullifierStore;
  challenges: ChallengeStore;
  roots: IRootChecker;
  amount: string;
  payTo: string;
};

/**
 * Authoritative body hash for this request.
 * ALS (warrantHono) wins, including empty POST.
 * No getBody → empty hash (processHTTPRequest tests).
 * getBody present but empty/throws → undefined (fail closed; do not hash "").
 */
async function bodyHashFromContext(ctx: HTTPRequestContext): Promise<string | undefined> {
  if (hasRequestBodyStore()) {
    return bodyHashFromCanonical(cachedRequestBody());
  }
  const getBody = ctx.adapter.getBody;
  if (!getBody) return "";
  let body: unknown;
  try {
    body = await Promise.resolve(getBody());
  } catch {
    return undefined;
  }
  if (body === undefined || body === null) return undefined;
  return bodyHashFromCanonical(body);
}

/**
 * Composition root for any POST route. Register ExactHederaScheme before initialize().
 */
export function createWarrantShop(config: WarrantShopConfig): WarrantShop {
  const amount = config.amount;
  const payTo = config.payTo;
  const challenges = config.challenges ?? new MemoryChallengeStore();

  const pipeline = createWarrantPipeline({
    verifier: config.verifier,
    roots: config.roots,
    nullifiers: config.nullifiers,
    hashChallenge,
    policy: config.policy,
  });

  const extension = createWarrantExtension({
    policy: config.policy,
    getMerkleRoot: config.getMerkleRoot,
  });

  const innerEnrich = extension.enrichPaymentRequiredResponse!;
  extension.enrichPaymentRequiredResponse = async (declaration, context) => {
    const enriched = (await innerEnrich(declaration, context)) as {
      info: {
        nonce: string;
        merkleRoot: string;
        issuedAt: string;
        requireScope: string;
        minTier: number;
      };
    };
    challenges.put({
      nonce: enriched.info.nonce,
      merkleRoot: enriched.info.merkleRoot,
      issuedAt: enriched.info.issuedAt,
    });
    return enriched;
  };

  const hooks = createWarrantHooks({
    pipeline,
    sponsorGrant: config.sponsorGrant,
    resolveChallenge: async (
      ctx: HTTPRequestContext,
      _route: RouteConfig,
    ): Promise<ChallengeParts | null> => {
      // Nonce hint only — never trust amount/payTo/merkleRoot/bodyHash from client
      let nonceHint: string | undefined;
      const raw = ctx.adapter.getHeader("warrant");
      if (raw) {
        try {
          const body = JSON.parse(raw) as { nonce?: unknown };
          if (typeof body.nonce === "string" && body.nonce.length > 0) {
            nonceHint = body.nonce;
          }
        } catch {
          /* fall through */
        }
      }

      const issued = challenges.resolve(nonceHint);
      if (!issued) return null;

      const bodyHash = await bodyHashFromContext(ctx);
      if (bodyHash === undefined) return null;

      return {
        method: ctx.adapter.getMethod(),
        path: ctx.adapter.getPath() || config.defaultPath || "/",
        nonce: issued.nonce,
        merkleRoot: issued.merkleRoot,
        amount,
        payTo,
        bodyHash,
      };
    },
  });

  const facilitator: FacilitatorClient =
    config.facilitatorClient ??
    new HTTPFacilitatorClient({
      url: config.facilitatorUrl ?? "https://api.testnet.blocky402.com",
    });

  const server = new x402ResourceServer(facilitator);
  server.register("hedera:*", new ExactHederaScheme());
  server.registerExtension(extension);

  const http = new x402HTTPResourceServer(server, {
    [config.route]: {
      accepts: {
        scheme: "exact",
        network: "hedera:testnet",
        price: {
          amount,
          asset: "0.0.0",
        },
        payTo,
        maxTimeoutSeconds: 300,
        extra: { feePayer: config.feePayer ?? "0.0.7162784" },
      },
      description: config.description ?? "protected",
      extensions: { warrant: { info: { version: "1" } } },
    },
  });

  http.onProtectedRequest(hooks.onProtectedRequest);

  return {
    http,
    server,
    policy: config.policy,
    nullifiers: config.nullifiers,
    challenges,
    roots: config.roots,
    amount,
    payTo,
  };
}

export async function initializeWarrantShop(shop: WarrantShop): Promise<void> {
  await shop.http.initialize();
}

/** Offline FacilitatorClient for gate tests — no Blocky402. */
export function mockHederaFacilitator(feePayer = "0.0.7162784"): FacilitatorClient {
  return {
    async getSupported() {
      return {
        kinds: [
          {
            x402Version: 2,
            scheme: "exact",
            network: "hedera:testnet",
            extra: { feePayer },
          },
        ],
        extensions: [],
        signers: {},
      };
    },
    async verify() {
      throw new Error("mock facilitator: verify not used in gate tests");
    },
    async settle() {
      throw new Error("mock facilitator: settle not used in gate tests");
    },
  };
}
