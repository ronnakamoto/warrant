import { keccak256, toBytes } from "viem";
import {
  TRANSLATE,
  SnarkjsVerifier,
  hashChallenge,
  type ChallengeParts,
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
import { MemoryChallengeStore } from "./challenges.js";
import { MemoryNullifierStore } from "./nullifiers.js";
import { CurrentRootChecker, FixedRootChecker } from "./roots.js";
import { createLogHcsSink, type HcsSink } from "./hcs.js";

export type WireConfig = {
  /** Live Blocky402 URL, or inject a FacilitatorClient (tests). */
  facilitatorUrl?: string;
  facilitatorClient?: FacilitatorClient;
  registryAddress?: `0x${string}`;
  baseSepoliaRpc?: string;
  /** When set, skip RPC and use this root (tests / local). */
  fixedMerkleRoot?: bigint;
  vkeyPath?: string;
  /** Injected verifier for tests. */
  verifier?: IVerifier;
  payTo?: string;
  feePayer?: string;
  amount?: string;
  policy?: WarrantPolicy;
  hcs?: HcsSink;
};

export type Wired = {
  http: x402HTTPResourceServer;
  server: x402ResourceServer;
  policy: WarrantPolicy;
  nullifiers: MemoryNullifierStore;
  challenges: MemoryChallengeStore;
  roots: IRootChecker;
  hcs: HcsSink;
};

function bodyHashFromContext(ctx: HTTPRequestContext): string {
  const getBody = ctx.adapter.getBody;
  if (!getBody) return "";
  const body = getBody() as unknown;
  // @x402/hono getBody is async (Promise). Sync resolveChallenge cannot await —
  // treat pending bodies as unavailable (empty) rather than hashing "{}".
  if (body != null && typeof (body as { then?: unknown }).then === "function") {
    return "";
  }
  if (body === undefined || body === null) return "";
  if (typeof body === "string") {
    return body.length === 0 ? "" : keccak256(toBytes(body));
  }
  if (body instanceof Uint8Array) {
    return body.length === 0 ? "" : keccak256(body);
  }
  return keccak256(toBytes(JSON.stringify(body)));
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
    freeCallsPerHuman: 3,
  };

  const nullifiers = new MemoryNullifierStore();
  const challenges = new MemoryChallengeStore();
  const hcs = config.hcs ?? createLogHcsSink();

  let roots: IRootChecker;
  if (config.fixedMerkleRoot !== undefined) {
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

  const hooks = createWarrantHooks({
    pipeline,
    resolveChallenge: (ctx: HTTPRequestContext, _route: RouteConfig): ChallengeParts | null => {
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
        bodyHash: bodyHashFromContext(ctx),
      };
    },
  });

  const facilitator: FacilitatorClient =
    config.facilitatorClient ??
    new HTTPFacilitatorClient({
      url: config.facilitatorUrl ?? "https://api.testnet.blocky402.com",
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
