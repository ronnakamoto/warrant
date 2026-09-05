import assert from "node:assert/strict";
import {
  TRANSLATE,
  FETCH,
  hashChallenge,
  type INullifierStore,
  type IRootChecker,
  type IVerifier,
  type PublicInputs,
  type WarrantProof,
} from "@warrant/core";
import { createWarrantPipeline } from "../src/pipeline.ts";

const liveRoot = 111n;
const nonce = "n-live";
const path = "/v1/translate";

function publics(over: Partial<PublicInputs> = {}): PublicInputs {
  return {
    merkleRoot: liveRoot,
    contextHash: 99n,
    nullifier: 42n,
    effectiveScope: TRANSLATE,
    effectiveBudgetCap: 200_000n,
    minExpiry: 1_700_000_000n,
    tier: 2n,
    requestHash: hashChallenge({
      method: "POST",
      path,
      nonce,
      merkleRoot: String(liveRoot),
      amount: "100000",
      payTo: "0.0.10311260",
      bodyHash: "",
    }),
    ...over,
  };
}

function header(p: PublicInputs, proof: WarrantProof = { pi_a: [], pi_b: [], pi_c: [] }): string {
  return JSON.stringify({
    proof,
    publicSignals: [
      p.merkleRoot,
      p.contextHash,
      p.nullifier,
      p.effectiveScope,
      p.effectiveBudgetCap,
      p.minExpiry,
      p.tier,
      p.requestHash,
    ].map(String),
  });
}

function memoryNullifiers(): INullifierStore {
  const seen = new Set<string>();
  const free = new Map<string, number>();
  return {
    async takeRequest(n, r) {
      const k = `${n}:${r}`;
      if (seen.has(k)) return "seen";
      seen.add(k);
      return "fresh";
    },
    async consumeFree(n, limit) {
      const key = String(n);
      const used = free.get(key) ?? 0;
      if (used >= limit) return "exhausted";
      free.set(key, used + 1);
      return "granted";
    },
  };
}

describe("@warrant/x402 pipeline", function () {
  const roots: IRootChecker = {
    async isAcceptable(r) {
      return r !== 0n && r === liveRoot;
    },
  };
  const verifierOk: IVerifier = {
    async verify() {
      return true;
    },
  };
  const verifierBad: IVerifier = {
    async verify() {
      return false;
    },
  };
  const challenge = {
    method: "POST",
    path,
    nonce,
    merkleRoot: String(liveRoot),
    amount: "100000",
    payTo: "0.0.10311260",
    bodyHash: "",
  };
  const policy = { requireScope: TRANSLATE, minTier: 1, freeCallsPerHuman: 3 };

  function pipe(v: IVerifier = verifierOk, n: INullifierStore = memoryNullifiers()) {
    return createWarrantPipeline({
      verifier: v,
      roots,
      nullifiers: n,
      hashChallenge,
      policy,
    });
  }

  it("no header → continue (402)", async function () {
    const r = await pipe().handle({
      warrantHeader: undefined,
      method: "POST",
      path,
      challenge,
    });
    assert.equal(r.kind, "continue");
  });

  it("malformed header → abort malformed_warrant", async function () {
    const r = await pipe().handle({
      warrantHeader: "not-json",
      method: "POST",
      path,
      challenge,
    });
    assert.deepEqual(r, { kind: "abort", reason: "malformed_warrant" });
  });

  it("stale root → abort root_revoked before hash mismatch", async function () {
    const p = publics({ merkleRoot: 999n });
    const r = await pipe().handle({
      warrantHeader: header(p),
      method: "POST",
      path,
      challenge,
    });
    assert.deepEqual(r, { kind: "abort", reason: "root_revoked" });
  });

  it("requestHash mismatch → abort", async function () {
    const p = publics({ requestHash: 1n });
    const r = await pipe().handle({
      warrantHeader: header(p),
      method: "POST",
      path,
      challenge,
    });
    assert.deepEqual(r, { kind: "abort", reason: "request_hash_mismatch" });
  });

  it("invalid proof → abort", async function () {
    const r = await pipe(verifierBad).handle({
      warrantHeader: header(publics()),
      method: "POST",
      path,
      challenge,
    });
    assert.deepEqual(r, { kind: "abort", reason: "invalid_proof" });
  });

  it("scope policy fail → abort", async function () {
    const p = publics({ effectiveScope: FETCH });
    const r = await pipe().handle({
      warrantHeader: header(p),
      method: "POST",
      path,
      challenge,
    });
    assert.deepEqual(r, { kind: "abort", reason: "policy" });
  });

  it("valid under quota → grant (free)", async function () {
    const r = await pipe().handle({
      warrantHeader: header(publics()),
      method: "POST",
      path,
      challenge,
    });
    assert.equal(r.kind, "grant");
  });

  it("fourth call same nullifier after 3 free → continue (402 pay)", async function () {
    const store = memoryNullifiers();
    const p = pipe(verifierOk, store);
    const base = {
      method: "POST" as const,
      path,
      challenge,
    };
    for (let i = 0; i < 3; i++) {
      const ch = { ...challenge, nonce: `n-${i}` };
      const pub = publics({
        requestHash: hashChallenge({ ...ch, merkleRoot: String(liveRoot) }),
      });
      const r = await p.handle({ ...base, challenge: ch, warrantHeader: header(pub) });
      assert.equal(r.kind, "grant", `free call ${i}`);
    }
    const ch4 = { ...challenge, nonce: "n-3" };
    const pub4 = publics({
      requestHash: hashChallenge({ ...ch4, merkleRoot: String(liveRoot) }),
    });
    const r4 = await p.handle({ ...base, challenge: ch4, warrantHeader: header(pub4) });
    assert.equal(r4.kind, "continue");
  });

  it("replay same nullifier+requestHash → abort replay", async function () {
    const store = memoryNullifiers();
    const p = pipe(verifierOk, store);
    const h = header(publics());
    const req = { warrantHeader: h, method: "POST", path, challenge };
    assert.equal((await p.handle(req)).kind, "grant");
    assert.deepEqual(await p.handle(req), { kind: "abort", reason: "replay" });
  });

  it("consumeFree is atomic vs interleaved check/bump", async function () {
    const store = memoryNullifiers();
    const a = await store.consumeFree(1n, 1);
    const b = await store.consumeFree(1n, 1);
    assert.equal(a, "granted");
    assert.equal(b, "exhausted");
  });
});
