import {
  TRANSLATE,
  SnarkjsVerifier,
  bodyHashFromCanonical,
  hashChallenge,
  type ChallengeParts,
  type INullifierStore,
  type IRootChecker,
  type IVerifier,
} from "@warrant/core";
import {
  createWarrantExtension,
  createWarrantHooks,
  createWarrantPipeline,
  type WarrantPolicy,
} from "@warrant/x402";
import {
  HTTPFacilitatorClient,
  x402ResourceServer,
  type FacilitatorClient,
  type HTTPRequestContext,
  type RouteConfig,
} from "@x402/core/server";
import { x402HTTPResourceServer } from "@x402/core/http";
import { ExactHederaScheme } from "@x402/hedera/exact/server";
import { withAllowanceFacilitator } from "./allowance-facilitator.js";
import { MemoryChallengeStore, type ChallengeStore } from "./challenges.js";
import { FileNullifierStore } from "./nullifiers-file.js";
import { MemoryNullifierStore } from "./nullifiers.js";
import { CurrentRootChecker, FixedRootChecker } from "./roots.js";
import { createLogHcsSink, type HcsSink } from "./hcs.js";
import { cachedRequestBody } from "./request-body.js";

export type WireConfig = {
  /** Live Blocky402 URL, or inject a FacilitatorClient (tests). */
  facilitatorUrl?: string;
  facilitatorClient?: FacilitatorClient;
  registryAddress?: `0x${string}`;
  baseSepoliaRpc?: string;
  /** When set, skip RPC and use this root (tests / local). */
  fixedMerkleRoot?: bigint;
  /** Injected root policy (tests / DoD). Overrides fixed/registry constructors. */
  roots?: IRootChecker;
  vkeyPath?: string;
  /** Injected verifier for tests. */
  verifier?: IVerifier;
  /** Injected nullifier store (tests). Default: memory, or file via WARRANT_NULLIFIER_PATH. */
  nullifiers?: INullifierStore;
  /** Tests inject a one-shot grant after free quota. Production leaves this unset. */
  sponsorGrant?: (nullifier: bigint) => Promise<boolean>;
  sponsorTxIds?: Map<string, string>;
  payTo?: string;
  feePayer?: string;
  amount?: string;
  policy?: WarrantPolicy;
  hcs?: HcsSink;
  challenges?: ChallengeStore;
};

export type Wired = {
  http: x402HTTPResourceServer;
  server: x402ResourceServer;
  policy: WarrantPolicy;
  nullifiers: INullifierStore;
  challenges: ChallengeStore;
  roots: IRootChecker;
  hcs: HcsSink;
  sponsorTxIds: Map<string, string>;
};

async function bodyHashFromContext(ctx: HTTPRequestContext): Promise<string> {
  const cached = cachedRequestBody();
  if (cached !== undefined && cached !== null) {
    return bodyHashFromCanonical(cached);
  }
  const getBody = ctx.adapter.getBody;
  if (!getBody) return "";
  let body: unknown;
  try {
    body = await Promise.resolve(getBody());
  } catch {
    return "";
  }
  if (body === undefined || body === null) return "";
  return bodyHashFromCanonical(body);
}

/**
 * Composition root: construct adapters, register ExactHederaScheme **before** initialize().
 */
export function wire(config: WireConfig): Wired {
  const amount = config.amount ?? "100000";
  const payTo = config.payTo ?? "0.0.10311260";
  const policy: WarrantPolicy = config.policy ?? {
    requireScope: TRANSLATE,
    minTier: 1,
    freeCallsPerHuman: 0,
  };

  const nullifiers: INullifierStore =
    config.nullifiers ??
    (process.env.WARRANT_NULLIFIER_PATH
      ? new FileNullifierStore(process.env.WARRANT_NULLIFIER_PATH)
      : new MemoryNullifierStore());
  const challenges = config.challenges ?? new MemoryChallengeStore();
  const hcs = config.hcs ?? createLogHcsSink();

  let roots: IRootChecker;
  if (config.roots) {
    roots = config.roots;
  } else if (config.fixedMerkleRoot !== undefined) {
    roots = new FixedRootChecker(config.fixedMerkleRoot);
  } else if (config.registryAddress && config.baseSepoliaRpc) {
    roots = new CurrentRootChecker({
      rpcUrl: config.baseSepoliaRpc,
      registry: config.registryAddress,
    });
  } else {
    roots = new FixedRootChecker(0n); // rejects all until configured
  }

  const allowDemoVerify =
    process.env.ALLOW_DEMO_VERIFY === "1" && process.env.ALLOW_DEMO_ROOT === "1";

  const verifier: IVerifier =
    config.verifier ??
    (config.vkeyPath
      ? SnarkjsVerifier.fromPath(config.vkeyPath)
      : allowDemoVerify
        ? {
            async verify() {
              // Demo/tests only — paired with ALLOW_DEMO_ROOT. Never production.
              return true;
            },
          }
        : {
            async verify() {
              return false;
            },
          });

  const pipeline = createWarrantPipeline({
    verifier,
    roots,
    nullifiers,
    hashChallenge,
    policy,
  });

  const getMerkleRoot = async () => {
    if (config.fixedMerkleRoot !== undefined) return config.fixedMerkleRoot.toString();
    if (roots instanceof CurrentRootChecker) {
      return (await roots.currentRoot()).toString();
    }
    return "0";
  };

  const extension = createWarrantExtension({
    policy,
    getMerkleRoot,
  });

  // Capture issued challenges server-side only (nonce + merkleRoot from enrich)
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

  const sponsorTxIds = config.sponsorTxIds ?? new Map<string, string>();

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

      return {
        method: ctx.adapter.getMethod(),
        path: ctx.adapter.getPath() || "/v1/translate",
        nonce: issued.nonce,
        merkleRoot: issued.merkleRoot,
        amount,
        payTo,
        bodyHash: await bodyHashFromContext(ctx),
      };
    },
  });

  const facilitator: FacilitatorClient = withAllowanceFacilitator({
    inner:
      config.facilitatorClient ??
      new HTTPFacilitatorClient({
        url: config.facilitatorUrl ?? "https://api.testnet.blocky402.com",
      }),
  });

  const server = new x402ResourceServer(facilitator);
  // Scheme BEFORE initialize (docs/05 risk table)
  server.register("hedera:*", new ExactHederaScheme());
  server.registerExtension(extension);

  const http = new x402HTTPResourceServer(server, {
    "POST /v1/translate": {
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
      description: "translate",
      extensions: { warrant: { info: { version: "1" } } },
    },
  });

  http.onProtectedRequest(hooks.onProtectedRequest);

  return {
    http,
    server,
    policy,
    nullifiers,
    challenges,
    roots,
    hcs,
    sponsorTxIds,
  };
}

export async function initializeWired(wired: Wired): Promise<void> {
  await wired.http.initialize();
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
