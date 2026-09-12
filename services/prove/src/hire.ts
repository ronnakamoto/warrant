import { randomBytes } from "node:crypto";
import { createMandate, FETCH } from "@ronnakamoto/warrant-core";
import { emptyState, ensureIdentity, identityOf, type WarrantState } from "@warrant/agent";
import type { Hex } from "viem";
import { mergeForestLeaves } from "./members.js";
import type { InsertMandatesFn } from "./mint.js";
import { createSessionId, type GuestSession, type SessionStore } from "./session.js";

export const HELPER_BUDGET = 20_000n;
export const HELPER_NAME = "helper";

export type HireOk = { ok: true; helperSessionId: string };
export type HireErr = { ok: false; error: "unknown" | "fired" | "scope" };
export type HireResult = HireOk | HireErr;

const EMPTY_EVM_KEY = "0x" as Hex;

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

export function appendHelperHop(state: WarrantState): void {
  if (state.mandates.length !== 2) throw new Error("expected two hops");
  const hop2 = state.mandates[1];
  if (!hop2 || hop2.to !== "translator") throw new Error("last hop must end at translator");
  if (!state.humanTag) throw new Error("missing humanTag");
  const humanTag = state.humanTag;

  if (!state.identities[HELPER_NAME]) {
    ensureIdentity(state, HELPER_NAME, `helper-${randomBytes(16).toString("hex")}`);
  }

  const translator = identityOf(state, "translator");
  const helper = identityOf(state, HELPER_NAME);
  const hop3 = createMandate({
    parent: translator,
    child: helper,
    scope: FETCH,
    budgetCap: HELPER_BUDGET,
    expiry: BigInt(hop2.expiry),
    tier: BigInt(hop2.tier),
    epoch: BigInt(hop2.epoch),
    parentHash: BigInt(hop2.hash),
    humanTag: BigInt(humanTag),
    parentScope: BigInt(hop2.scope),
    parentBudgetCap: BigInt(hop2.budgetCap),
    parentExpiry: BigInt(hop2.expiry),
  });
  state.mandates.push(storeMandate("translator", HELPER_NAME, hop3, humanTag));
  state.members = mergeForestLeaves(state.members, [hop3.hash.toString()]);
}

export async function hireHelper(
  store: SessionStore,
  parentId: string,
  insertMandates?: InsertMandatesFn,
): Promise<HireResult> {
  const parent = store.get(parentId);
  if (!parent) return { ok: false, error: "unknown" };
  if (parent.revoked) return { ok: false, error: "fired" };
  if (parent.parentId) return { ok: false, error: "scope" };
  if ((BigInt(parent.state.mandates[1]?.scope ?? 0) & FETCH) !== FETCH) {
    return { ok: false, error: "scope" };
  }

  if (parent.helperSessionId) store.delete(parent.helperSessionId);

  const hop2 = parent.state.mandates[1];
  if (!hop2 || hop2.to !== "translator") throw new Error("last hop must end at translator");
  if (!parent.state.humanTag) throw new Error("missing humanTag");
  const humanTag = parent.state.humanTag;

  const helperState = emptyState();
  helperState.humanTag = parent.state.humanTag;
  helperState.contextHash = parent.state.contextHash;
  helperState.rootName = parent.state.rootName;
  helperState.rootTier = parent.state.rootTier;
  helperState.rootEpoch = parent.state.rootEpoch;

  for (const name of ["alice", "orchestrator", "translator"] as const) {
    const row = parent.state.identities[name];
    if (!row) throw new Error(`missing identity: ${name}`);
    helperState.identities[name] = { privateKey: "", pkX: row.pkX, pkY: row.pkY };
  }
  if (!helperState.identities[HELPER_NAME]) {
    ensureIdentity(helperState, HELPER_NAME, `helper-${randomBytes(16).toString("hex")}`);
  }

  const translator = identityOf(parent.state, "translator");
  const helper = identityOf(helperState, HELPER_NAME);
  const hop3 = createMandate({
    parent: translator,
    child: helper,
    scope: FETCH,
    budgetCap: HELPER_BUDGET,
    expiry: BigInt(hop2.expiry),
    tier: BigInt(hop2.tier),
    epoch: BigInt(hop2.epoch),
    parentHash: BigInt(hop2.hash),
    humanTag: BigInt(humanTag),
    parentScope: BigInt(hop2.scope),
    parentBudgetCap: BigInt(hop2.budgetCap),
    parentExpiry: BigInt(hop2.expiry),
  });
  helperState.members = mergeForestLeaves(parent.state.members, [hop3.hash.toString()]);
  helperState.mandates = [
    structuredClone(hop2),
    storeMandate("translator", HELPER_NAME, hop3, humanTag),
  ];

  if (insertMandates) {
    await insertMandates({
      wallet: parent.wallet,
      hashes: [hop3.hash],
    });
  }
  parent.state.members = mergeForestLeaves(parent.state.members, [hop3.hash.toString()]);

  const helperSession: GuestSession = {
    id: createSessionId(),
    deskId: parent.deskId,
    wallet: parent.wallet,
    createdAt: parent.createdAt,
    evmPrivateKey: EMPTY_EVM_KEY,
    parentId: parent.id,
    state: helperState,
    scope: "fetch",
  };
  parent.helperSessionId = helperSession.id;
  store.put(helperSession);
  store.put(parent);
  return { ok: true, helperSessionId: helperSession.id };
}
