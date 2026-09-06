import {
  createPublicClient,
  createWalletClient,
  http,
  type Account,
  type Address,
  type Chain,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";

const abi = [
  {
    type: "function",
    name: "bindRoot",
    stateMutability: "nonpayable",
    inputs: [
      { name: "wallet", type: "address" },
      { name: "pkX", type: "uint256" },
      { name: "pkY", type: "uint256" },
      { name: "tier", type: "uint8" },
    ],
    outputs: [
      { name: "leaf", type: "uint256" },
      { name: "root", type: "uint256" },
    ],
  },
  {
    type: "function",
    name: "currentRoot",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

export type BindRootArgs = {
  rpcUrl: string;
  registry: Address;
  privateKey: Hex;
  wallet: Address;
  pkX: bigint;
  pkY: bigint;
  tier: number;
  chain?: Chain;
};

export async function bindRootOnChain(
  args: BindRootArgs,
): Promise<{ leaf: bigint; root: bigint; txHash: Hex }> {
  const account: Account = privateKeyToAccount(args.privateKey);
  const chain = args.chain ?? baseSepolia;
  const wallet = createWalletClient({
    account,
    chain,
    transport: http(args.rpcUrl),
  });
  const publicClient = createPublicClient({
    chain,
    transport: http(args.rpcUrl),
  });

  const hash = await wallet.writeContract({
    address: args.registry,
    abi,
    functionName: "bindRoot",
    args: [args.wallet, args.pkX, args.pkY, args.tier],
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") {
    throw new Error(`bindRoot reverted (${hash})`);
  }

  const root = await publicClient.readContract({
    address: args.registry,
    abi,
    functionName: "currentRoot",
  });
  if (root === 0n) {
    throw new Error("bindRoot succeeded but currentRoot is still 0");
  }

  return { leaf: 0n, root, txHash: hash };
}

export async function readCurrentRoot(opts: {
  rpcUrl: string;
  registry: Address;
  chain?: Chain;
}): Promise<bigint> {
  const publicClient = createPublicClient({
    chain: opts.chain ?? baseSepolia,
    transport: http(opts.rpcUrl),
  });
  return publicClient.readContract({
    address: opts.registry,
    abi,
    functionName: "currentRoot",
  });
}
