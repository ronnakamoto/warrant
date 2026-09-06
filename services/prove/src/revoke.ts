import { hashLeaf } from "@warrant/core";
import { identityOf } from "@warrant/agent";
import { LeanIMT } from "@zk-kit/lean-imt";
import { poseidon2 } from "poseidon-lite";
import {
  createPublicClient,
  createWalletClient,
  http,
  parseEther,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";
import { assertNotFounder } from "./founders.js";
import type { GuestSession } from "./session.js";
import type { LeafLoader } from "./members.js";
import { refreshMembers } from "./prove.js";

const revokeAbi = [
  {
    type: "function",
    name: "revoke",
    stateMutability: "nonpayable",
    inputs: [{ name: "siblings", type: "uint256[]" }],
    outputs: [{ name: "root", type: "uint256" }],
  },
] as const;

export const REVOKE_FLOOR = parseEther("0.00015");

export type RevokeClients = {
  sendGas?: (to: Address, value: bigint) => Promise<Hex>;
  revoke?: (siblings: bigint[]) => Promise<Hex>;
};

export async function revokeSiblingsFor(members: string[], leaf: string): Promise<bigint[]> {
  const tree = new LeanIMT((a, b) => poseidon2([BigInt(a), BigInt(b)]));
  for (const m of members) tree.insert(BigInt(m));
  const index = members.indexOf(leaf);
  if (index < 0) throw new Error("guest leaf missing from membership");
  return tree.generateProof(index).siblings.map((s) => BigInt(s));
}

export async function revokeGuest(args: {
  session: GuestSession;
  registry: Address;
  rpc: string;
  gasSponsorKey: Hex;
  loadMembers: LeafLoader;
  clients?: RevokeClients;
}): Promise<{ txHash: Hex }> {
  assertNotFounder(args.session.wallet);
  await refreshMembers(args.session.state, args.loadMembers);

  const root = identityOf(args.session.state, args.session.state.rootName ?? "alice");
  const leaf = hashLeaf(
    root.publicKey[0],
    root.publicKey[1],
    BigInt(args.session.state.rootTier ?? 0),
    BigInt(args.session.state.rootEpoch ?? 0),
  ).toString();
  const siblings = await revokeSiblingsFor(args.session.state.members, leaf);

  if (args.clients?.revoke) {
    const txHash = await args.clients.revoke(siblings);
    return { txHash };
  }

  const sponsor = privateKeyToAccount(args.gasSponsorKey);
  const guest = privateKeyToAccount(args.session.evmPrivateKey);
  if (guest.address.toLowerCase() === sponsor.address.toLowerCase()) {
    throw new Error("gas sponsor must not be the guest wallet");
  }

  const publicClient = createPublicClient({
    chain: baseSepolia,
    transport: http(args.rpc),
  });
  const balance = await publicClient.getBalance({ address: guest.address });
  if (balance < REVOKE_FLOOR) {
    const sponsorWallet = createWalletClient({
      account: sponsor,
      chain: baseSepolia,
      transport: http(args.rpc),
    });
    const fundHash = await sponsorWallet.sendTransaction({
      to: guest.address,
      value: REVOKE_FLOOR,
    });
    await publicClient.waitForTransactionReceipt({ hash: fundHash });
  }

  const guestWallet = createWalletClient({
    account: guest,
    chain: baseSepolia,
    transport: http(args.rpc),
  });
  const txHash = await guestWallet.writeContract({
    address: args.registry,
    abi: revokeAbi,
    functionName: "revoke",
    args: [siblings],
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
  if (receipt.status !== "success") {
    throw new Error(`revoke reverted (${txHash})`);
  }
  return { txHash };
}
