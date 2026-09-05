import {
  hashChallenge,
  hashLeaf,
  prove,
  type ChallengeParts,
  type IProver,
  type PublicInputs,
  type WarrantProof,
} from "@warrant/core";
import {
  identityOf,
  rebuildGroup,
  replayMandates,
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
 * Facade over `@warrant/core` prove — never opens zkeys itself.
 */
export async function proveForChallenge(args: ProveForChallengeArgs): Promise<ProveResult> {
  const { state, as, challenge, prover } = args;
  if (!state.rootName) throw new Error("no bound root — run warrant bind-root first");
  if (state.mandates.length === 0) {
    throw new Error("no mandates — run warrant delegate first");
  }
  const { humanTag, contextHash } = requireTags(state);

  const root = identityOf(state, state.rootName);
  const mandates = replayMandates(state);
  const children = state.mandates.map((m) => identityOf(state, m.to));
  const acting = identityOf(state, as);
  const lastChild = children[children.length - 1]!;
  if (
    acting.publicKey[0] !== lastChild.publicKey[0] ||
    acting.publicKey[1] !== lastChild.publicKey[1]
  ) {
    throw new Error(`--as ${as} is not the tip of the mandate chain`);
  }

  const group = rebuildGroup(state);
  const tier = BigInt(state.rootTier ?? 0);
  const epoch = BigInt(state.rootEpoch ?? 0);
  const rootLeaf = hashLeaf(root.publicKey[0], root.publicKey[1], tier, epoch);
  const leafIndex = state.members.findIndex((m) => m === rootLeaf.toString());
  if (leafIndex < 0) throw new Error("root leaf missing from local membership group");

  const requestHash = hashChallenge(challenge);
  const minExpiry = mandates.reduce(
    (min, m) => (m.expiry < min ? m.expiry : min),
    mandates[0]!.expiry,
  );

  const { proof, publics } = await prove(
    {
      root,
      children,
      mandates,
      group,
      leafIndex,
      humanTag: BigInt(humanTag),
      contextHash: BigInt(contextHash),
      requestHash,
      minExpiry,
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
