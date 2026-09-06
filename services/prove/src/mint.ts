import { randomBytes } from "node:crypto";
import { createMandate, hashLeaf, TRANSLATE } from "@warrant/core";
import {
  appendLeaf,
  bindRootOnChain,
  emptyState,
  ensureIdentity,
  freshFieldTag,
  identityOf,
  type WarrantState,
} from "@warrant/agent";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import type { Address, Hex } from "viem";
import { assertNotFounder } from "./founders.js";
import { mergeGuestLeaf, type LeafLoader } from "./members.js";
import { createSessionId, createDeskId, type GuestSession, type SessionStore } from "./session.js";

export type BindRootFn = (args: {
  rpcUrl: string;
  registry: Address;
  privateKey: Hex;
  wallet: Address;
  pkX: bigint;
  pkY: bigint;
  tier: number;
}) => Promise<{ leaf: bigint; root: bigint; txHash?: Hex }>;

export type MintGuestDeps = {
  store: SessionStore;
  bindPrivateKey: Hex;
  registry: Address;
  rpc: string;
  loadMembers: LeafLoader;
  bindRoot?: BindRootFn;
  generateEvmKey?: () => Hex;
  now?: () => number;
  deskId?: string;
};

const PARENT_BUDGET = 2_000_000n;
const LEAF_BUDGET = 200_000n;
const TTL_SECONDS = 30n * 60n;

export function assembleGuestTree(state: WarrantState, expiry: bigint): void {
  const { humanTag } = requireHuman(state);
  const alice = identityOf(state, "alice");
  const orch = identityOf(state, "orchestrator");
  const trans = identityOf(state, "translator");
  const hop1 = createMandate({
    parent: alice,
    child: orch,
    scope: TRANSLATE,
    budgetCap: PARENT_BUDGET,
    expiry,
    tier: BigInt(state.rootTier ?? 0),
    epoch: BigInt(state.rootEpoch ?? 0),
    parentHash: 0n,
    humanTag: BigInt(humanTag),
  });
  const hop2 = createMandate({
    parent: orch,
    child: trans,
    scope: TRANSLATE,
    budgetCap: LEAF_BUDGET,
    expiry,
    tier: hop1.tier,
    epoch: hop1.epoch,
    parentHash: hop1.hash,
    humanTag: BigInt(humanTag),
    parentScope: hop1.scope,
    parentBudgetCap: hop1.budgetCap,
    parentExpiry: hop1.expiry,
  });
  state.mandates = [storeMandate("alice", "orchestrator", hop1, humanTag), storeMandate("orchestrator", "translator", hop2, humanTag)];
}

function requireHuman(state: WarrantState): { humanTag: string } {
  if (!state.humanTag) throw new Error("missing humanTag");
  return { humanTag: state.humanTag };
}

function storeMandate(
  from: string,
  to: string,
  signed: ReturnType<typeof createMandate>,
  humanTag: string,
) {
  return {
    from,
    to,
    scope: signed.scope.toString(),
    budgetCap: signed.budgetCap.toString(),
    expiry: signed.expiry.toString(),
    tier: signed.tier.toString(),
    epoch: signed.epoch.toString(),
    parentHash: signed.parentHash.toString(),
    humanTag,
    hash: signed.hash.toString(),
    signature: {
      S: signed.signature.S.toString(),
      R8x: signed.signature.R8x.toString(),
      R8y: signed.signature.R8y.toString(),
    },
  };
}

export async function mintGuest(deps: MintGuestDeps): Promise<{
  sessionId: string;
  wallet: Address;
  txHash: Hex;
  deskId: string;
}> {
  const bind = deps.bindRoot ?? bindRootOnChain;
  const evmKey = (deps.generateEvmKey ?? generatePrivateKey)();
  const account = privateKeyToAccount(evmKey);
  assertNotFounder(account.address);

  const state = emptyState();
  const seed = randomBytes(16).toString("hex");
  ensureIdentity(state, "alice", `alice-${seed}`);
  ensureIdentity(state, "orchestrator", `orch-${seed}`);
  ensureIdentity(state, "translator", `trans-${seed}`);
  const alice = identityOf(state, "alice");

  const bound = await bind({
    rpcUrl: deps.rpc,
    registry: deps.registry,
    privateKey: deps.bindPrivateKey,
    wallet: account.address,
    pkX: alice.publicKey[0],
    pkY: alice.publicKey[1],
    tier: 0,
  });

  const leaf = hashLeaf(alice.publicKey[0], alice.publicKey[1], 0n, 0n);
  let members: string[];
  try {
    members = mergeGuestLeaf(await deps.loadMembers(), leaf.toString());
  } catch {
    members = [leaf.toString()];
  }
  state.members = members;
  if (!state.members.includes(leaf.toString())) appendLeaf(state, leaf);

  state.humanTag = freshFieldTag();
  state.contextHash = freshFieldTag();
  state.rootName = "alice";
  state.rootWallet = account.address;
  state.rootTier = 0;
  state.rootEpoch = 0;

  const expiry = BigInt(Math.floor((deps.now ?? Date.now)() / 1000)) + TTL_SECONDS;
  assembleGuestTree(state, expiry);

  const deskId = deps.deskId ?? createDeskId();
  const session: GuestSession = {
    id: createSessionId(),
    deskId,
    state,
    evmPrivateKey: evmKey,
    wallet: account.address,
    createdAt: (deps.now ?? Date.now)(),
  };
  deps.store.put(session);

  return {
    sessionId: session.id,
    wallet: account.address,
    txHash: bound.txHash ?? "0x",
    deskId,
  };
}
