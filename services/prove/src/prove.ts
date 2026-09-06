import {
  proveForChallenge,
  warrantHeaderJson,
  type WarrantState,
} from "@warrant/agent";
import type { ChallengeParts, IProver } from "@warrant/core";
import type { GuestSession } from "./session.js";
import type { LeafLoader } from "./members.js";
import { mergeGuestLeaf } from "./members.js";
import { hashLeaf } from "@warrant/core";
import { identityOf } from "@warrant/agent";

export async function refreshMembers(
  state: WarrantState,
  loadMembers: LeafLoader,
): Promise<void> {
  const name = state.rootName;
  if (!name || !state.identities[name]) return;
  const root = identityOf(state, name);
  const leaf = hashLeaf(
    root.publicKey[0],
    root.publicKey[1],
    BigInt(state.rootTier ?? 0),
    BigInt(state.rootEpoch ?? 0),
  ).toString();
  try {
    state.members = mergeGuestLeaf(await loadMembers(), leaf);
  } catch {
    /* keep existing members if Graph is behind */
  }
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
    as: "translator",
    challenge: args.challenge,
    prover: args.prover,
  });
  return {
    warrant: warrantHeaderJson(result),
    nullifier: String(result.publics.nullifier),
  };
}
