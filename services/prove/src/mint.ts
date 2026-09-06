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
import { isAddress, type Address, type Hex } from "viem";
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

export type ReadBindingFn = (args: {
  rpcUrl: string;
  registry: Address;
  wallet: Address;
}) => Promise<{ epoch: number; tier: number; leaf: bigint; pkX: bigint; pkY: bigint }>;

export type MintGuestDeps = {
  store: SessionStore;
  bindPrivateKey: Hex;
  registry: Address;
  rpc: string;
  loadMembers: LeafLoader;
  wallet: Address;
  bindRoot?: BindRootFn;
  readBinding?: ReadBindingFn;
  now?: () => number;
  deskId?: string;
};

const EMPTY_EVM_KEY = "0x" as Hex;

function isAlreadyBound(err: unknown): boolean {
  const msg = err instanceof Error ? `${err.message} ${(err as { shortMessage?: string }).shortMessage ?? ""}` : String(err);
  return /AlreadyBound|already bound/i.test(msg);
}

function priorAliceForWallet(store: SessionStore, wallet: Address) {
  const want = wallet.toLowerCase();
  for (const session of store.dump()) {
    if (session.wallet.toLowerCase() === want && session.state.identities.alice) {
      return session;
    }
  }
  return undefined;
}

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
  if (!isAddress(deps.wallet)) throw new Error("wallet required");
  assertNotFounder(deps.wallet);
  const bind = deps.bindRoot ?? bindRootOnChain;

  const state = emptyState();
  const seed = randomBytes(16).toString("hex");
  ensureIdentity(state, "orchestrator", `orch-${seed}`);
  ensureIdentity(state, "translator", `trans-${seed}`);

  let txHash: Hex = "0x";
  let epoch = 0;
  let leaf: bigint;

  const prior = priorAliceForWallet(deps.store, deps.wallet);
  if (prior?.state.identities.alice) {
    state.identities.alice = structuredClone(prior.state.identities.alice);
    const reused = identityOf(state, "alice");
    const read = deps.readBinding ?? (await import("@warrant/agent")).readBinding;
    const onchain = await read({
      rpcUrl: deps.rpc,
      registry: deps.registry,
      wallet: deps.wallet,
    });
    if (reused.publicKey[0] !== onchain.pkX || reused.publicKey[1] !== onchain.pkY) {
      throw new Error("wallet already bound");
    }
    epoch = onchain.epoch;
    leaf = onchain.leaf;
  } else {
    ensureIdentity(state, "alice", `alice-${seed}`);
    const alice = identityOf(state, "alice");
    try {
      const bound = await bind({
        rpcUrl: deps.rpc,
        registry: deps.registry,
        privateKey: deps.bindPrivateKey,
        wallet: deps.wallet,
        pkX: alice.publicKey[0],
        pkY: alice.publicKey[1],
        tier: 0,
      });
      txHash = bound.txHash ?? "0x";
      leaf = hashLeaf(alice.publicKey[0], alice.publicKey[1], 0n, 0n);
    } catch (err) {
      if (!isAlreadyBound(err)) throw err;
      throw new Error("wallet already bound");
    }
  }

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
  state.rootWallet = deps.wallet;
  state.rootTier = 0;
  state.rootEpoch = epoch;

  const expiry = BigInt(Math.floor((deps.now ?? Date.now)() / 1000)) + TTL_SECONDS;
  assembleGuestTree(state, expiry);

  const deskId = deps.deskId ?? createDeskId();
  const session: GuestSession = {
    id: createSessionId(),
    deskId,
    state,
    evmPrivateKey: EMPTY_EVM_KEY,
    wallet: deps.wallet,
    createdAt: (deps.now ?? Date.now)(),
  };
  deps.store.put(session);

  return {
    sessionId: session.id,
    wallet: deps.wallet,
    txHash,
    deskId,
  };
}
