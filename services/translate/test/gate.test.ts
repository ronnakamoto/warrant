import assert from "node:assert/strict";
import {
  TRANSLATE,
  hashChallenge,
  type ChallengeParts,
  type IVerifier,
  type PublicInputs,
  type WarrantProof,
} from "@warrant/core";
import { decodePaymentRequiredHeader } from "@x402/core/http";
import {
  initializeWired,
  mockHederaFacilitator,
  wire,
  type Wired,
} from "../src/wiring.ts";

const liveRoot = 111n;
const path = "/v1/translate";
const amount = "100000";
const payTo = "0.0.10311260";

function adapter(headers: Record<string, string> = {}, body?: unknown) {
  const h = Object.fromEntries(
    Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]),
  );
  return {
    getHeader: (name: string) => h[name.toLowerCase()],
    getMethod: () => "POST",
    getPath: () => path,
    getUrl: () => `https://translate.warrant.example${path}`,
    getAcceptHeader: () => "application/json",
    getUserAgent: () => "warrant-gate-test",
    getBody: body === undefined ? undefined : () => body,
  };
}

function paymentRequiredFromResult(result: {
  response?: { headers?: Record<string, string>; body?: unknown };
}): Record<string, unknown> {
  const header =
    result.response?.headers?.["payment-required"] ??
    result.response?.headers?.["PAYMENT-REQUIRED"];
  if (typeof header === "string" && header.length > 0) {
    return decodePaymentRequiredHeader(header) as unknown as Record<string, unknown>;
  }
  return (result.response?.body ?? {}) as Record<string, unknown>;
}

/** Issue a server 402 and return the authoritative challenge (server fields only). */
async function issueChallenge(wired: Wired): Promise<ChallengeParts> {
  const result = await wired.http.processHTTPRequest({
    adapter: adapter(),
    path,
    method: "POST",
  });
  assert.equal(result.response?.status, 402);
  const body = paymentRequiredFromResult(result);
  const info = (body.extensions as { warrant?: { info?: { nonce?: string; merkleRoot?: string } } })
    ?.warrant?.info;
  assert.ok(info?.nonce, "server nonce missing");
  assert.ok(info.merkleRoot, "server merkleRoot missing");
  return {
    method: "POST",
    path,
    nonce: info.nonce,
    merkleRoot: info.merkleRoot,
    amount,
    payTo,
    bodyHash: "",
  };
}

function publics(ch: ChallengeParts, over: Partial<PublicInputs> = {}): PublicInputs {
  return {
    merkleRoot: liveRoot,
    contextHash: 99n,
    nullifier: 42n,
    effectiveScope: TRANSLATE,
    effectiveBudgetCap: 200_000n,
    minExpiry: 1_700_000_000n,
    tier: 2n,
    requestHash: hashChallenge(ch),
    ...over,
  };
}

/** Warrant header: proof + publics + optional nonce hint only (no client challenge). */
function warrantHeader(p: PublicInputs, nonceHint?: string): string {
  const proof: WarrantProof = { pi_a: [], pi_b: [], pi_c: [] };
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
    ...(nonceHint ? { nonce: nonceHint } : {}),
  });
}

describe("WP5 translate gate (processHTTPRequest)", function () {
  const verifierOk: IVerifier = {
    async verify() {
      return true;
    },
  };

  async function setup() {
    const wired = wire({
      facilitatorClient: mockHederaFacilitator(),
      fixedMerkleRoot: liveRoot,
      verifier: verifierOk,
      amount,
      payTo,
      policy: { requireScope: TRANSLATE, minTier: 1, freeCallsPerHuman: 3 },
    });
    await initializeWired(wired);
    return wired;
  }

  it("no header → 402 with extensions.warrant", async function () {
    const wired = await setup();
    const result = await wired.http.processHTTPRequest({
      adapter: adapter(),
      path,
      method: "POST",
    });
    assert.equal(result.type, "payment-error");
    assert.equal(result.response?.status, 402);
    const body = paymentRequiredFromResult(result);
    const extensions = body.extensions as
      | Record<string, { info?: { nonce?: string } }>
      | undefined;
    assert.ok(extensions?.warrant, "extensions.warrant missing");
    assert.ok(extensions.warrant.info?.nonce, "warrant nonce missing");
    const accepts = body.accepts as Array<{ network?: string }> | undefined;
    assert.equal(accepts?.[0]?.network, "hedera:testnet");
  });

  it("valid proof, fresh nullifier, under quota → no-payment-required (200 free)", async function () {
    const wired = await setup();
    const ch = await issueChallenge(wired);
    const result = await wired.http.processHTTPRequest({
      adapter: adapter({ warrant: warrantHeader(publics(ch), ch.nonce) }),
      path,
      method: "POST",
    });
    assert.equal(result.type, "no-payment-required");
  });

  it("client-supplied challenge fields are ignored (server amount/payTo win)", async function () {
    const wired = await setup();
    const ch = await issueChallenge(wired);
    // Attacker embeds wrong amount in a fake challenge object — must not be used
    const evil = {
      proof: { pi_a: [], pi_b: [], pi_c: [] },
      publicSignals: [
        ...[
          liveRoot,
          99n,
          42n,
          TRANSLATE,
          200_000n,
          1_700_000_000n,
          2n,
          hashChallenge(ch),
        ].map(String),
      ],
      challenge: {
        ...ch,
        amount: "1",
        payTo: "0.0.attacker",
        nonce: ch.nonce,
        path,
      },
      nonce: ch.nonce,
    };
    const result = await wired.http.processHTTPRequest({
      adapter: adapter({ warrant: JSON.stringify(evil) }),
      path,
      method: "POST",
    });
    assert.equal(result.type, "no-payment-required");
  });

  it("proof bound to attacker amount fails against server challenge", async function () {
    const wired = await setup();
    const ch = await issueChallenge(wired);
    const forged = hashChallenge({ ...ch, amount: "1" });
    const result = await wired.http.processHTTPRequest({
      adapter: adapter({
        warrant: warrantHeader(publics(ch, { requestHash: forged }), ch.nonce),
      }),
      path,
      method: "POST",
    });
    assert.equal(result.type, "payment-error");
    assert.equal(result.response?.status, 403);
    const body = result.response?.body as { error?: string } | undefined;
    assert.equal(body?.error, "request_hash_mismatch");
  });

  it("warrant without issued challenge → 403 challenge_missing", async function () {
    const wired = await setup();
    // No prior 402 — store empty; nonce hint unknown
    const ch: ChallengeParts = {
      method: "POST",
      path,
      nonce: "never-issued",
      merkleRoot: String(liveRoot),
      amount,
      payTo,
      bodyHash: "",
    };
    const result = await wired.http.processHTTPRequest({
      adapter: adapter({ warrant: warrantHeader(publics(ch), "never-issued") }),
      path,
      method: "POST",
    });
    assert.equal(result.type, "payment-error");
    assert.equal(result.response?.status, 403);
    const body = result.response?.body as { error?: string } | undefined;
    assert.equal(body?.error, "challenge_missing");
  });

  it("fourth call same nullifier → 402 hedera:testnet", async function () {
    const wired = await setup();
    for (let i = 0; i < 3; i++) {
      const ch = await issueChallenge(wired);
      const r = await wired.http.processHTTPRequest({
        adapter: adapter({ warrant: warrantHeader(publics(ch), ch.nonce) }),
        path,
        method: "POST",
      });
      assert.equal(r.type, "no-payment-required", `free ${i}`);
    }
    const ch4 = await issueChallenge(wired);
    const result = await wired.http.processHTTPRequest({
      adapter: adapter({ warrant: warrantHeader(publics(ch4), ch4.nonce) }),
      path,
      method: "POST",
    });
    assert.equal(result.type, "payment-error");
    assert.equal(result.response?.status, 402);
    const body = paymentRequiredFromResult(result);
    const accepts = body.accepts as Array<{ network?: string }> | undefined;
    assert.equal(accepts?.[0]?.network, "hedera:testnet");
  });

  it("revoked root → 403 root_revoked", async function () {
    const wired = await setup();
    const ch = await issueChallenge(wired);
    const p = publics(ch, { merkleRoot: 999n });
    const result = await wired.http.processHTTPRequest({
      adapter: adapter({ warrant: warrantHeader(p, ch.nonce) }),
      path,
      method: "POST",
    });
    assert.equal(result.type, "payment-error");
    assert.equal(result.response?.status, 403);
    const body = result.response?.body as { error?: string } | undefined;
    assert.equal(body?.error, "root_revoked");
  });

  it("registers ExactHederaScheme before initialize()", async function () {
    const wired = wire({
      facilitatorClient: mockHederaFacilitator(),
      fixedMerkleRoot: liveRoot,
      verifier: verifierOk,
    });
    await initializeWired(wired);
    assert.ok(wired.server);
  });
});
