import {
  createPublicClient,
  createWalletClient,
  decodeEventLog,
  http,
  type Account,
  type Address,
  type Chain,
  type Hex,
  type TransactionReceipt,
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
  {
    type: "function",
    name: "insertMandates",
    stateMutability: "nonpayable",
    inputs: [
      { name: "wallet", type: "address" },
      { name: "hashes", type: "uint256[]" },
    ],
    outputs: [{ name: "root", type: "uint256" }],
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
  {
    type: "event",
    name: "MandateInserted",
    inputs: [
      { name: "wallet", type: "address", indexed: true },
      { name: "hash", type: "uint256", indexed: false },
      { name: "index", type: "uint256", indexed: false },
      { name: "root", type: "uint256", indexed: false },
    ],
  },
] as const;

/** Public RPCs often return a success receipt before the next eth_call sees the write. */
export function rootFromReceipt(
  receipt: Pick<TransactionReceipt, "logs">,
  eventName: "Bound" | "MandateInserted",
): bigint | undefined {
  let last: bigint | undefined;
  for (const log of receipt.logs) {
    try {
      const ev = decodeEventLog({ abi, data: log.data, topics: log.topics });
      if (ev.eventName === eventName && "root" in ev.args) {
        last = ev.args.root;
      }
    } catch {
      /* other logs on the receipt */
    }
  }
  return last;
}

async function rootAfterWrite(
  publicClient: ReturnType<typeof createPublicClient>,
  registry: Address,
  receipt: TransactionReceipt,
  eventName: "Bound" | "MandateInserted",
): Promise<bigint> {
  const fromEvent = rootFromReceipt(receipt, eventName);
  if (fromEvent && fromEvent !== 0n) return fromEvent;
  for (let i = 0; i < 6; i++) {
    const root = await publicClient.readContract({
      address: registry,
      abi,
      functionName: "currentRoot",
    });
    if (root !== 0n) return root;
    await new Promise((r) => setTimeout(r, 200 * (i + 1)));
  }
  throw new Error(`${eventName} succeeded but currentRoot is still 0`);
}

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
  const receipt = await publicClient.waitForTransactionReceipt({ hash, confirmations: 1 });
  if (receipt.status !== "success") {
    throw new Error(`bindRoot reverted (${hash})`);
  }

  const root = await rootAfterWrite(publicClient, args.registry, receipt, "Bound");
  return { leaf: 0n, root, txHash: hash };
}

export type InsertMandatesArgs = {
  rpcUrl: string;
  registry: Address;
  privateKey: Hex;
  wallet: Address;
  hashes: readonly bigint[];
  chain?: Chain;
};

export async function insertMandatesOnChain(
  args: InsertMandatesArgs,
): Promise<{ root: bigint; txHash: Hex }> {
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
    functionName: "insertMandates",
    args: [args.wallet, [...args.hashes]],
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash, confirmations: 1 });
  if (receipt.status !== "success") {
    throw new Error(`insertMandates reverted (${hash})`);
  }

  const root = await rootAfterWrite(publicClient, args.registry, receipt, "MandateInserted");
  return { root, txHash: hash };
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
