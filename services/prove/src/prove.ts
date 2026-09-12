import {
  proveForChallenge,
  publicOf,
  warrantHeaderJson,
  type WarrantState,
} from "@warrant/agent";
import type { ChallengeParts, IProver } from "@ronnakamoto/warrant-core";
import type { GuestSession } from "./session.js";
import type { LeafLoader } from "./members.js";
import { mergeForestLeaves, mergeGuestLeaf } from "./members.js";
import { hashLeaf } from "@ronnakamoto/warrant-core";

export function identityLeafOf(state: WarrantState): string {
  const [pkX, pkY] = publicOf(state, state.rootName ?? "alice");
  return hashLeaf(
    pkX,
    pkY,
    BigInt(state.rootTier ?? 0),
    BigInt(state.rootEpoch ?? 0),
  ).toString();
}

export async function refreshMembers(
  state: WarrantState,
  loadMembers: LeafLoader,
): Promise<void> {
  const name = state.rootName;
  if (!name || !state.identities[name]) return;
  const leaf = identityLeafOf(state);
  try {
    state.members = mergeGuestLeaf(await loadMembers(), leaf);
  } catch {
    state.members = mergeForestLeaves(state.members, [leaf, ...state.mandates.map((m) => m.hash)]);
  }
}

export function actingName(session: GuestSession): "translator" | "helper" {
  return session.parentId ? "helper" : "translator";
}

export async function proveGuest(args: {
  session: GuestSession;
  challenge: ChallengeParts;
  prover: IProver;
  loadMembers?: LeafLoader;
}): Promise<{ warrant: string; nullifier: string }> {
  if (args.loadMembers && !args.session.revoked) {
    await refreshMembers(args.session.state, args.loadMembers);
  }
  const result = await proveForChallenge({
    state: args.session.state,
    as: actingName(args.session),
    challenge: args.challenge,
    prover: args.prover,
  });
  return {
    warrant: warrantHeaderJson(result),
    nullifier: String(result.publics.nullifier),
  };
}
