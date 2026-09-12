import {
  hashChallenge,
  hashLeaf,
  prove,
  type ChallengeParts,
  type IProver,
  type PublicInputs,
  type WarrantProof,
} from "@ronnakamoto/warrant-core";
import {
  identityOf,
  loadMandates,
  publicOf,
  rebuildGroup,
  requireTags,
  type WarrantState,
} from "./store.js";

export type ProveForChallengeArgs = {
  state: WarrantState;
  /** Acting agent (last hop child). */
  as: string;
  challenge: ChallengeParts;
  /** Required — construct via createSnarkjsProver() in cli/demo composition root. */
  prover: IProver;
};

export type ProveResult = {
  proof: WarrantProof;
  publics: PublicInputs;
  nonce: string;
  requestHash: string;
};

/**
 * Prove a warrant for the live x402 challenge using the stored mandate chain.
 * Facade over `@ronnakamoto/warrant-core` prove — never opens zkeys itself.
 */
export async function proveForChallenge(args: ProveForChallengeArgs): Promise<ProveResult> {
  const { state, as, challenge, prover } = args;
  if (!state.rootName) throw new Error("no bound root — run warrant bind-root first");
  if (state.mandates.length === 0) {
    throw new Error("no mandates — run warrant delegate first");
  }
  const { humanTag, contextHash } = requireTags(state);

  const rootPk = publicOf(state, state.rootName);
  const mandates = loadMandates(state);
  if (mandates.length < 2) throw new Error("need parent hop and leaf hop");
  const pair = mandates.slice(-2);
  const parentHop = state.mandates[state.mandates.length - 2]!;
  const parentSignerPk =
    BigInt(parentHop.parentHash) === 0n ? rootPk : publicOf(state, parentHop.from);
  const leaf = identityOf(state, as);
  if (leaf.publicKey[0] !== pair[1]!.childPkX || leaf.publicKey[1] !== pair[1]!.childPkY) {
    throw new Error(`--as ${as} is not the tip of the mandate chain`);
  }

  const group = rebuildGroup(state);
  const tier = BigInt(state.rootTier ?? 0);
  const epoch = BigInt(state.rootEpoch ?? 0);
  const rootLeaf = hashLeaf(rootPk[0], rootPk[1], tier, epoch);
  const leafIndex = state.members.findIndex((m) => m === rootLeaf.toString());
  if (leafIndex < 0) throw new Error("root leaf missing from local membership group");

  const requestHash = hashChallenge(challenge);
  const minExpiry = pair.reduce(
    (min, m) => (m.expiry < min ? m.expiry : min),
    pair[0]!.expiry,
  );

  const { proof, publics } = await prove(
    {
      rootPk,
      parentSignerPk,
      leaf,
      mandates: pair,
      group,
      leafIndex,
      humanTag: BigInt(humanTag),
      contextHash: BigInt(contextHash),
      requestHash,
      minExpiry,
      epoch,
      tier,
    },
    prover,
  );

  return {
    proof,
    publics,
    nonce: challenge.nonce,
    requestHash: requestHash.toString(),
  };
}

export function warrantHeaderJson(result: ProveResult): string {
  const { proof, publics, nonce } = result;
  return JSON.stringify({
    proof,
    publicSignals: [
      publics.merkleRoot,
      publics.contextHash,
      publics.nullifier,
      publics.effectiveScope,
      publics.effectiveBudgetCap,
      publics.minExpiry,
      publics.tier,
      publics.requestHash,
    ].map(String),
    nonce,
  });
}
