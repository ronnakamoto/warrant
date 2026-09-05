import { createPublicClient, http, type Address, type Chain } from "viem";
import { hashLeaf } from "@warrant/core";
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
] as const;

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
  const [binding, leaf, currentRoot] = await Promise.all([
    client.readContract({
      address: args.registry,
      abi,
      functionName: "bindings",
      args: [args.wallet],
    }),
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
  const [pkX, pkY, tier, epoch, exists] = binding;
  if (!exists) throw new Error(`wallet ${args.wallet} is not bound on registry`);
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
