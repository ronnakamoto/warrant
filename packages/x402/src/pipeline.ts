import {
  fromArray,
  isSubset,
  PUBLIC_INPUT_COUNT,
  type ChallengeParts,
  type INullifierStore,
  type IRootChecker,
  type IVerifier,
  type PublicInputs,
  type WarrantProof,
} from "@warrant/core";
import type { WarrantPolicy } from "./policy.js";

export type WarrantHeaderPayload = {
  proof: WarrantProof;
  publicSignals: string[] | bigint[];
};

export type PipelineRequest = {
  /** Raw `warrant` header value, or undefined if missing. */
  warrantHeader: string | undefined;
  method: string;
  path: string;
  /** Live challenge fields from extensions.warrant.info + accepts[0]. */
  challenge: ChallengeParts;
};

export type PipelineResult =
  | { kind: "continue" }
  | { kind: "grant" }
  | { kind: "abort"; reason: string };

export type PipelineDeps = {
  verifier: IVerifier;
  roots: IRootChecker;
  nullifiers: INullifierStore;
  hashChallenge: (parts: ChallengeParts) => bigint;
  policy: WarrantPolicy;
};

function parseHeader(raw: string): WarrantHeaderPayload | null {
  try {
    const body = JSON.parse(raw) as WarrantHeaderPayload;
    if (!body || typeof body !== "object") return null;
    if (!body.proof || !Array.isArray(body.publicSignals)) return null;
    if (body.publicSignals.length !== PUBLIC_INPUT_COUNT) return null;
    return body;
  } catch {
    return null;
  }
}

function toPublics(signals: string[] | bigint[]): PublicInputs {
  return fromArray(signals.map((s) => BigInt(s)));
}

/**
 * Fixed authorize order (docs/05 §3). Quota is not the replay seal.
 * Missing header → continue (402). Abort reasons → 403. Grant → free path.
 */
export function createWarrantPipeline(deps: PipelineDeps) {
  return {
    async handle(req: PipelineRequest): Promise<PipelineResult> {
      // 1. No warrant header → continue to 402
      if (!req.warrantHeader) {
        return { kind: "continue" };
      }

      // 2. Malformed header → 403
      const parsed = parseHeader(req.warrantHeader);
      if (!parsed) {
        return { kind: "abort", reason: "malformed_warrant" };
      }

      let publics: PublicInputs;
      try {
        publics = toPublics(parsed.publicSignals);
      } catch {
        return { kind: "abort", reason: "malformed_warrant" };
      }

      // 3. Root revoked (currentRoot only) — before requestHash
      if (!(await deps.roots.isAcceptable(publics.merkleRoot))) {
        return { kind: "abort", reason: "root_revoked" };
      }

      // 4. Challenge binding
      const expected = deps.hashChallenge({
        ...req.challenge,
        method: req.challenge.method ?? req.method,
        path: req.challenge.path || req.path,
      });
      if (publics.requestHash !== expected) {
        return { kind: "abort", reason: "request_hash_mismatch" };
      }

      // 5. Groth16
      if (!(await deps.verifier.verify(parsed.proof, publics))) {
        return { kind: "abort", reason: "invalid_proof" };
      }

      // 6. Policy: resource requireScope bits ⊆ effectiveScope; tier floor
      if (!isSubset(publics.effectiveScope, deps.policy.requireScope)) {
        return { kind: "abort", reason: "policy" };
      }
      if (Number(publics.tier) < deps.policy.minTier) {
        return { kind: "abort", reason: "policy" };
      }

      // 7. Replay seal
      const seal = await deps.nullifiers.takeRequest(publics.nullifier, publics.requestHash);
      if (seal === "seen") {
        return { kind: "abort", reason: "replay" };
      }

      // 8. Free quota (atomic consume — quota is not the replay seal)
      const free = await deps.nullifiers.consumeFree(
        publics.nullifier,
        deps.policy.freeCallsPerHuman,
      );
      if (free === "granted") {
        return { kind: "grant" };
      }

      // 9. Exhausted → continue to 402 (pay)
      return { kind: "continue" };
    },
  };
}

export type WarrantPipeline = ReturnType<typeof createWarrantPipeline>;
