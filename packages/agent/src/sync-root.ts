import { createPublicClient, http, type Address, type Chain } from "viem";
import { hashLeaf } from "@ronnakamoto/warrant-core";
import { baseSepolia } from "viem/chains";

const abi = [
  {
    type: "function",
    name: "bindings",
    stateMutability: "view",
    inputs: [{ name: "wallet", type: "address" }],
    outputs: [
      { name: "pkX", type: "uint256" },
      { name: "pkY", type: "uint256" },
      { name: "tier", type: "uint8" },
      { name: "epoch", type: "uint32" },
      { name: "exists", type: "bool" },
    ],
  },
  {
    type: "function",
    name: "leafOf",
    stateMutability: "view",
    inputs: [{ name: "wallet", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "currentRoot",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  { type: "error", name: "Unbound", inputs: [] },
] as const;

export class UnboundError extends Error {
  readonly code = "UNBOUND" as const;
  constructor(wallet: string) {
    super(`wallet ${wallet} is not bound on registry`);
    this.name = "UnboundError";
  }
}

export function isUnboundError(err: unknown): boolean {
  if (err instanceof UnboundError) return true;
  const msg = err instanceof Error ? `${err.message} ${(err as { shortMessage?: string }).shortMessage ?? ""}` : String(err);
  return /Unbound|is not bound on registry|0x74a04f02/i.test(msg);
}

export type SyncRootArgs = {
  rpcUrl: string;
  registry: Address;
  wallet: Address;
  chain?: Chain;
};

export type SyncRootResult = {
  epoch: number;
  tier: number;
  leaf: bigint;
  currentRoot: bigint;
  pkX: bigint;
  pkY: bigint;
};

/** Read on-chain binding after revoke; returns leaf at current epoch. */
export async function readBinding(args: SyncRootArgs): Promise<SyncRootResult> {
  const client = createPublicClient({
    chain: args.chain ?? baseSepolia,
    transport: http(args.rpcUrl),
  });
  const binding = await client.readContract({
    address: args.registry,
    abi,
    functionName: "bindings",
    args: [args.wallet],
  });
  const [pkX, pkY, tier, epoch, exists] = binding;
  if (!exists) throw new UnboundError(args.wallet);
  const [leaf, currentRoot] = await Promise.all([
    client.readContract({
      address: args.registry,
      abi,
      functionName: "leafOf",
      args: [args.wallet],
    }),
    client.readContract({
      address: args.registry,
      abi,
      functionName: "currentRoot",
    }),
  ]);
  const expected = hashLeaf(pkX, pkY, BigInt(tier), BigInt(epoch));
  if (expected !== leaf) {
    throw new Error(`leafOf mismatch: chain=${leaf} localHash=${expected}`);
  }
  return {
    epoch: Number(epoch),
    tier: Number(tier),
    leaf,
    currentRoot,
    pkX,
    pkY,
  };
}
