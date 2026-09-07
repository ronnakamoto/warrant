import {
  FETCH,
  SnarkjsVerifier,
  type INullifierStore,
  type IRootChecker,
  type IVerifier,
} from "@warrant/core";
import {
  createWarrantShop,
  initializeWarrantShop,
  FileNullifierStore,
  MemoryNullifierStore,
  CurrentRootChecker,
  FixedRootChecker,
  type ChallengeStore,
  type WarrantPolicy,
  type WarrantShop,
} from "@warrant/x402";
import type { FacilitatorClient } from "@x402/core/server";

export type EchoWireConfig = {
  facilitatorUrl?: string;
  facilitatorClient?: FacilitatorClient;
  registryAddress?: `0x${string}`;
  baseSepoliaRpc?: string;
  fixedMerkleRoot?: bigint;
  vkeyPath?: string;
  verifier?: IVerifier;
  nullifiers?: INullifierStore;
  challenges?: ChallengeStore;
  payTo?: string;
  feePayer?: string;
  amount?: string;
  policy?: WarrantPolicy;
  freeCallsPerHuman?: number;
};

export type EchoShop = WarrantShop & { initialize(): Promise<void> };

/** Second shop on the shared factory — FETCH, not translate-shaped. */
export function wireEcho(config: EchoWireConfig): EchoShop {
  const amount = config.amount ?? "100000";
  const payTo = config.payTo ?? "0.0.10311260";
  const policy: WarrantPolicy = config.policy ?? {
    requireScope: FETCH,
    minTier: 0,
    freeCallsPerHuman: config.freeCallsPerHuman ?? 0,
  };
  const nullifiers: INullifierStore =
    config.nullifiers ??
    (process.env.WARRANT_NULLIFIER_PATH
      ? new FileNullifierStore(process.env.WARRANT_NULLIFIER_PATH)
      : new MemoryNullifierStore());
  const roots: IRootChecker =
    config.fixedMerkleRoot !== undefined
      ? new FixedRootChecker(config.fixedMerkleRoot)
      : config.registryAddress && config.baseSepoliaRpc
        ? new CurrentRootChecker({
            rpcUrl: config.baseSepoliaRpc,
            registry: config.registryAddress,
          })
        : new FixedRootChecker(0n);
  const allowDemo =
    process.env.ALLOW_DEMO_VERIFY === "1" && process.env.ALLOW_DEMO_ROOT === "1";
  const verifier: IVerifier =
    config.verifier ??
    (config.vkeyPath
      ? SnarkjsVerifier.fromPath(config.vkeyPath)
      : allowDemo
        ? { async verify() { return true; } }
        : { async verify() { return false; } });
  const shop = createWarrantShop({
    route: "POST /v1/echo",
    description: "echo",
    policy,
    amount,
    payTo,
    feePayer: config.feePayer,
    verifier,
    roots,
    getMerkleRoot: async () =>
      config.fixedMerkleRoot !== undefined
        ? config.fixedMerkleRoot.toString()
        : roots instanceof CurrentRootChecker
          ? (await roots.currentRoot()).toString()
          : "0",
    nullifiers,
    challenges: config.challenges,
    facilitatorUrl: config.facilitatorUrl,
    facilitatorClient: config.facilitatorClient,
    defaultPath: "/v1/echo",
  });
  return { ...shop, initialize: () => initializeWarrantShop(shop) };
}
