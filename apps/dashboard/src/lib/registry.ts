import {
  createPublicClient,
  createWalletClient,
  http,
  type Account,
  type Address,
  type Chain,
  type Hex,
  type TransactionReceipt,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";

export const mandateRegistryAbi = [
  {
    type: "function",
    name: "currentRoot",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "size",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
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
    name: "revoke",
    stateMutability: "nonpayable",
    inputs: [{ name: "siblings", type: "uint256[]" }],
    outputs: [{ name: "root", type: "uint256" }],
  },
  {
    type: "event",
    name: "Revoked",
    inputs: [
      { name: "wallet", type: "address", indexed: true },
      { name: "oldLeaf", type: "uint256", indexed: false },
      { name: "newLeaf", type: "uint256", indexed: false },
      { name: "root", type: "uint256", indexed: false },
      { name: "epoch", type: "uint32", indexed: false },
    ],
  },
  {
    type: "event",
    name: "Bound",
    inputs: [
      { name: "wallet", type: "address", indexed: true },
      { name: "leaf", type: "uint256", indexed: false },
      { name: "root", type: "uint256", indexed: false },
      { name: "tier", type: "uint8", indexed: false },
    ],
  },
] as const;

function publicClient(rpcUrl: string, chain: Chain = baseSepolia) {
  return createPublicClient({
    chain,
    transport: http(rpcUrl),
  });
}

/** Fail closed if the mined receipt is not a success (viem does not throw by default). */
export function assertReceiptSuccess(
  receipt: Pick<TransactionReceipt, "status">,
  txHash: Hex,
): void {
  if (receipt.status !== "success") {
    throw new Error(`Transaction reverted on-chain (${txHash})`);
  }
}

export type RevokeArgs = {
  rpcUrl: string;
  registry: Address;
  privateKey: Hex;
  siblings: readonly bigint[];
  chain?: Chain;
};

export type PreflightRevokeArgs = {
  rpcUrl: string;
  registry: Address;
  wallet: Address;
  expectedLeaf: bigint;
  localRoot: bigint;
  chain?: Chain;
};

export async function readCurrentRoot(opts: {
  rpcUrl: string;
  registry: Address;
  chain?: Chain;
}): Promise<bigint> {
  const client = publicClient(opts.rpcUrl, opts.chain);
  return client.readContract({
    address: opts.registry,
    abi: mandateRegistryAbi,
    functionName: "currentRoot",
  });
}

export async function readBinding(opts: {
  rpcUrl: string;
  registry: Address;
  wallet: Address;
  chain?: Chain;
}): Promise<{
  pkX: bigint;
  pkY: bigint;
  tier: number;
  epoch: number;
  exists: boolean;
}> {
  const client = publicClient(opts.rpcUrl, opts.chain);
  const row = await client.readContract({
    address: opts.registry,
    abi: mandateRegistryAbi,
    functionName: "bindings",
    args: [opts.wallet],
  });
  return {
    pkX: row[0],
    pkY: row[1],
    tier: Number(row[2]),
    epoch: Number(row[3]),
    exists: row[4],
  };
}

export async function readLeafOf(opts: {
  rpcUrl: string;
  registry: Address;
  wallet: Address;
  chain?: Chain;
}): Promise<bigint> {
  const client = publicClient(opts.rpcUrl, opts.chain);
  return client.readContract({
    address: opts.registry,
    abi: mandateRegistryAbi,
    functionName: "leafOf",
    args: [opts.wallet],
  });
}

/**
 * eth_call checks before sending revoke — catches stale mirrors without spending gas.
 */
export async function preflightRevoke(opts: PreflightRevokeArgs): Promise<void> {
  const client = publicClient(opts.rpcUrl, opts.chain);
  const [chainRoot, chainLeaf] = await Promise.all([
    client.readContract({
      address: opts.registry,
      abi: mandateRegistryAbi,
      functionName: "currentRoot",
    }),
    client.readContract({
      address: opts.registry,
      abi: mandateRegistryAbi,
      functionName: "leafOf",
      args: [opts.wallet],
    }),
  ]);

  if (chainLeaf !== opts.expectedLeaf) {
    throw new Error(
      `Mirror leaf mismatch: chain leafOf=${chainLeaf} local=${opts.expectedLeaf}`,
    );
  }
  if (chainRoot !== opts.localRoot) {
    throw new Error(
      `Mirror root mismatch: chain currentRoot=${chainRoot} local=${opts.localRoot}`,
    );
  }
}

export async function revokeOnChain(
  args: RevokeArgs,
): Promise<{ root: bigint; txHash: Hex }> {
  const account: Account = privateKeyToAccount(args.privateKey);
  const chain = args.chain ?? baseSepolia;
  const wallet = createWalletClient({
    account,
    chain,
    transport: http(args.rpcUrl),
  });
  const client = publicClient(args.rpcUrl, chain);

  const hash = await wallet.writeContract({
    address: args.registry,
    abi: mandateRegistryAbi,
    functionName: "revoke",
    args: [args.siblings as bigint[]],
  });
  const receipt = await client.waitForTransactionReceipt({ hash });
  assertReceiptSuccess(receipt, hash);

  const root = await client.readContract({
    address: args.registry,
    abi: mandateRegistryAbi,
    functionName: "currentRoot",
  });

  return { root, txHash: hash };
}

export function explorerAddressUrl(address: Address, chainId = baseSepolia.id): string {
  if (chainId === baseSepolia.id) {
    return `https://sepolia.basescan.org/address/${address}`;
  }
  return `https://etherscan.io/address/${address}`;
}

export function explorerTxUrl(txHash: Hex, chainId = baseSepolia.id): string {
  if (chainId === baseSepolia.id) {
    return `https://sepolia.basescan.org/tx/${txHash}`;
  }
  return `https://etherscan.io/tx/${txHash}`;
}

export type VerifierLogEntry = {
  id: string;
  at: string;
  kind: "info" | "bound" | "revoked" | "error" | "loaded" | "checked";
  message: string;
  href?: string;
};

export function logFromRevoke(opts: {
  wallet: Address;
  root: bigint;
  txHash: Hex;
  epoch: number;
}): VerifierLogEntry {
  return {
    id: opts.txHash,
    at: new Date().toISOString(),
    kind: "revoked",
    message: "Revoked. Old proofs will be rejected (403). Re-bind to recover.",
    href: explorerTxUrl(opts.txHash),
  };
}
