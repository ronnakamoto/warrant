import {
  TRANSLATE,
  SnarkjsVerifier,
  type INullifierStore,
  type IRootChecker,
  type IVerifier,
} from "@warrant/core";
import {
  createWarrantShop,
  initializeWarrantShop,
  mockHederaFacilitator,
  MemoryChallengeStore,
  FileNullifierStore,
  MemoryNullifierStore,
  CurrentRootChecker,
  FixedRootChecker,
  type ChallengeStore,
  type WarrantPolicy,
  type WarrantShop,
} from "@warrant/x402";
import { HTTPFacilitatorClient, type FacilitatorClient } from "@x402/core/server";
import { withAllowanceFacilitator } from "./allowance-facilitator.js";
import { createLogHcsSink, type HcsSink } from "./hcs.js";

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

export type Wired = WarrantShop & {
  hcs: HcsSink;
  sponsorTxIds: Map<string, string>;
};

/**
 * Translate payload on the shared shop factory. Allowance wrap stays here.
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

  const roots =
    config.roots ??
    (config.fixedMerkleRoot !== undefined
      ? new FixedRootChecker(config.fixedMerkleRoot)
      : config.registryAddress && config.baseSepoliaRpc
        ? new CurrentRootChecker({
            rpcUrl: config.baseSepoliaRpc,
            registry: config.registryAddress,
          })
        : new FixedRootChecker(0n));

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

  const getMerkleRoot = async () => {
    if (config.fixedMerkleRoot !== undefined) return config.fixedMerkleRoot.toString();
    if (roots instanceof CurrentRootChecker) return (await roots.currentRoot()).toString();
    return "0";
  };

  const facilitatorClient = withAllowanceFacilitator({
    inner:
      config.facilitatorClient ??
      new HTTPFacilitatorClient({
        url: config.facilitatorUrl ?? "https://api.testnet.blocky402.com",
      }),
  });

  const shop = createWarrantShop({
    route: "POST /v1/translate",
    description: "translate",
    policy,
    amount,
    payTo,
    feePayer: config.feePayer,
    verifier,
    roots,
    getMerkleRoot,
    nullifiers,
    challenges,
    facilitatorUrl: config.facilitatorUrl,
    facilitatorClient,
    sponsorGrant: config.sponsorGrant,
    defaultPath: "/v1/translate",
  });

  return {
    ...shop,
    hcs,
    sponsorTxIds: config.sponsorTxIds ?? new Map<string, string>(),
  };
}

export async function initializeWired(wired: Wired): Promise<void> {
  await initializeWarrantShop(wired);
}

export { mockHederaFacilitator };
