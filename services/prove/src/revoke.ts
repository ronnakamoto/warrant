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
import type { GuestSession, SessionStore } from "./session.js";
import type { LeafLoader } from "./members.js";
import { identityLeafOf, refreshMembers } from "./prove.js";

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

export async function waitUntilBalance(
  getBalance: () => Promise<bigint>,
  min: bigint,
  opts?: { tries?: number; delayMs?: number; sleep?: (ms: number) => Promise<void> },
): Promise<void> {
  const tries = opts?.tries ?? 20;
  const delayMs = opts?.delayMs ?? 250;
  const sleep = opts?.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  for (let i = 0; i < tries; i++) {
    if ((await getBalance()) >= min) return;
    if (i < tries - 1) await sleep(delayMs);
  }
  throw new Error("guest wallet not funded in time");
}

export async function sponsorRevokeGas(args: {
  wallet: Address;
  rpc: string;
  gasSponsorKey: Hex;
}): Promise<void> {
  const sponsor = privateKeyToAccount(args.gasSponsorKey);
  if (sponsor.address.toLowerCase() === args.wallet.toLowerCase()) {
    throw new Error("gas sponsor must not be the guest wallet");
  }
  const publicClient = createPublicClient({
    chain: baseSepolia,
    transport: http(args.rpc),
  });
  const balance = await publicClient.getBalance({ address: args.wallet });
  if (balance >= REVOKE_FLOOR) return;
  const sponsorWallet = createWalletClient({
    account: sponsor,
    chain: baseSepolia,
    transport: http(args.rpc),
  });
  const fundHash = await sponsorWallet.sendTransaction({
    to: args.wallet,
    value: REVOKE_FLOOR,
  });
  await publicClient.waitForTransactionReceipt({ hash: fundHash, confirmations: 1 });
  await waitUntilBalance(() => publicClient.getBalance({ address: args.wallet }), REVOKE_FLOOR);
}

export type RevokeKind = "identity" | "warrant" | "helper";

function identityLeaf(session: GuestSession): string {
  return identityLeafOf(session.state);
}

export function mandateHashForKind(
  session: GuestSession,
  store: SessionStore | undefined,
  kind: RevokeKind,
): string {
  if (kind === "identity") return identityLeaf(session);
  if (kind === "warrant") {
    const hop = session.parentId ? undefined : session.state.mandates[1];
    if (!hop?.hash) throw new Error("warrant hop missing");
    return hop.hash;
  }
  const helper = session.parentId
    ? session
    : session.helperSessionId
      ? store?.get(session.helperSessionId)
      : undefined;
  const hop = helper?.state.mandates.at(-1);
  if (!hop?.hash) throw new Error("helper hop missing");
  return hop.hash;
}

export async function prepareGuestRevoke(args: {
  session: GuestSession;
  registry: Address;
  rpc: string;
  gasSponsorKey: Hex;
  loadMembers: LeafLoader;
  sponsor?: (wallet: Address) => Promise<void>;
  kind?: RevokeKind;
  store?: SessionStore;
}): Promise<{
  siblings: string[];
  wallet: Address;
  registry: Address;
  kind: RevokeKind;
  hash: string;
}> {
  assertNotFounder(args.session.wallet);
  await refreshMembers(args.session.state, args.loadMembers);
  const kind = args.kind ?? "identity";
  const leaf = mandateHashForKind(args.session, args.store, kind);
  const siblings = await revokeSiblingsFor(args.session.state.members, leaf);
  if (args.sponsor) {
    await args.sponsor(args.session.wallet);
  } else {
    await sponsorRevokeGas({
      wallet: args.session.wallet,
      rpc: args.rpc,
      gasSponsorKey: args.gasSponsorKey,
    });
  }
  return {
    siblings: siblings.map((s) => s.toString()),
    wallet: args.session.wallet,
    registry: args.registry,
    kind,
    hash: leaf,
  };
}

function markFired(session: GuestSession, store: SessionStore): void {
  session.revoked = true;
  delete session.receipt;
  store.put(session);
}

export function markWalletFired(store: SessionStore, wallet: Address): void {
  const want = wallet.toLowerCase();
  for (const session of store.dump()) {
    if (session.wallet.toLowerCase() !== want) continue;
    markFired(session, store);
  }
}

export function markSessionFired(store: SessionStore, session: GuestSession): void {
  markFired(session, store);
  if (session.helperSessionId) {
    const helper = store.get(session.helperSessionId);
    if (helper) markFired(helper, store);
  }
}

export function markHelperFired(store: SessionStore, session: GuestSession): void {
  if (session.parentId) {
    markFired(session, store);
    const parent = store.get(session.parentId);
    if (parent) {
      delete parent.helperSessionId;
      store.put(parent);
    }
    return;
  }
  if (!session.helperSessionId) return;
  const helper = store.get(session.helperSessionId);
  if (helper) markFired(helper, store);
  delete session.helperSessionId;
  store.put(session);
}

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

  const leaf = identityLeaf(args.session);
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
    await publicClient.waitForTransactionReceipt({ hash: fundHash, confirmations: 1 });
    // Public RPCs can return the receipt before the next eth_getBalance / estimateGas
    // sees the credit — writeContract then fails with "gas required exceeds allowance (0)".
    await waitUntilBalance(
      () => publicClient.getBalance({ address: guest.address }),
      REVOKE_FLOOR,
    );
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
