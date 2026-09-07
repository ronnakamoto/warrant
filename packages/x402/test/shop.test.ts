import assert from "node:assert/strict";
import {
  FETCH,
  TRANSLATE,
  hashChallenge,
  type ChallengeParts,
  type IVerifier,
  type PublicInputs,
} from "@warrant/core";
import { decodePaymentRequiredHeader } from "@x402/core/http";
import {
  createWarrantShop,
  initializeWarrantShop,
  mockHederaFacilitator,
  type WarrantShop,
} from "../src/shop.ts";
import { FixedRootChecker } from "../src/roots.ts";
import { MemoryNullifierStore } from "../src/nullifiers.ts";

const liveRoot = 111n;
const path = "/v1/echo";
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
    getUrl: () => `https://echo.warrant.example${path}`,
    getAcceptHeader: () => "application/json",
    getUserAgent: () => "warrant-shop-test",
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

async function issueChallenge(shop: WarrantShop): Promise<ChallengeParts> {
  const result = await shop.http.processHTTPRequest({
    adapter: adapter(),
    path,
    method: "POST",
  });
  assert.equal(result.response?.status, 402);
  const body = paymentRequiredFromResult(result);
  const info = (body.extensions as { warrant?: { info?: { nonce?: string; merkleRoot?: string } } })
    ?.warrant?.info;
  assert.ok(info?.nonce);
  return {
    method: "POST",
    path,
    nonce: info.nonce,
    merkleRoot: info.merkleRoot!,
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
    effectiveScope: FETCH,
    effectiveBudgetCap: 200_000n,
    minExpiry: 1_700_000_000n,
    tier: 2n,
    requestHash: hashChallenge(ch),
    ...over,
  };
}

function warrantHeader(p: PublicInputs, nonceHint?: string): string {
  return JSON.stringify({
    proof: { pi_a: [], pi_b: [], pi_c: [] },
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

describe("createWarrantShop", function () {
  const verifierOk: IVerifier = { async verify() { return true; } };

  async function setup(over: { freeCallsPerHuman?: number } = {}) {
    const shop = createWarrantShop({
      route: "POST /v1/echo",
      description: "echo",
      policy: {
        requireScope: FETCH,
        minTier: 0,
        freeCallsPerHuman: over.freeCallsPerHuman ?? 3,
      },
      amount,
      payTo,
      verifier: verifierOk,
      roots: new FixedRootChecker(liveRoot),
      getMerkleRoot: () => String(liveRoot),
      nullifiers: new MemoryNullifierStore(),
      facilitatorClient: mockHederaFacilitator(),
      defaultPath: path,
    });
    await initializeWarrantShop(shop);
    return shop;
  }

  it("no header → 402 with extensions.warrant on the echo route", async function () {
    const shop = await setup();
    const result = await shop.http.processHTTPRequest({
      adapter: adapter(),
      path,
      method: "POST",
    });
    assert.equal(result.response?.status, 402);
    const body = paymentRequiredFromResult(result);
    const extensions = body.extensions as Record<string, { info?: { nonce?: string } }>;
    assert.ok(extensions?.warrant?.info?.nonce);
    const accepts = body.accepts as Array<{ network?: string }>;
    assert.equal(accepts?.[0]?.network, "hedera:testnet");
  });

  it("TRANSLATE scope on a FETCH shop → 403 policy", async function () {
    const shop = await setup();
    const ch = await issueChallenge(shop);
    const result = await shop.http.processHTTPRequest({
      adapter: adapter({
        warrant: warrantHeader(publics(ch, { effectiveScope: TRANSLATE }), ch.nonce),
      }),
      path,
      method: "POST",
    });
    assert.equal(result.response?.status, 403);
    assert.equal((result.response?.body as { error?: string }).error, "policy");
  });

  it("valid FETCH proof under quota → no-payment-required", async function () {
    const shop = await setup();
    const ch = await issueChallenge(shop);
    const result = await shop.http.processHTTPRequest({
      adapter: adapter({ warrant: warrantHeader(publics(ch), ch.nonce) }),
      path,
      method: "POST",
    });
    assert.equal(result.type, "no-payment-required");
  });

  it("unknown nonce → 403 challenge_missing", async function () {
    const shop = await setup();
    const ch: ChallengeParts = {
      method: "POST",
      path,
      nonce: "never-issued",
      merkleRoot: String(liveRoot),
      amount,
      payTo,
      bodyHash: "",
    };
    const result = await shop.http.processHTTPRequest({
      adapter: adapter({ warrant: warrantHeader(publics(ch), "never-issued") }),
      path,
      method: "POST",
    });
    assert.equal(result.response?.status, 403);
    assert.equal((result.response?.body as { error?: string }).error, "challenge_missing");
  });

  it("client-supplied challenge.amount is ignored", async function () {
    const shop = await setup();
    const ch = await issueChallenge(shop);
    const evil = {
      proof: { pi_a: [], pi_b: [], pi_c: [] },
      publicSignals: [
        liveRoot,
        99n,
        42n,
        FETCH,
        200_000n,
        1_700_000_000n,
        2n,
        hashChallenge(ch),
      ].map(String),
      challenge: {
        ...ch,
        amount: "1",
        payTo: "0.0.attacker",
        nonce: ch.nonce,
        path,
      },
      nonce: ch.nonce,
    };
    const result = await shop.http.processHTTPRequest({
      adapter: adapter({ warrant: JSON.stringify(evil) }),
      path,
      method: "POST",
    });
    assert.equal(result.type, "no-payment-required");
  });

  it("proof bound to attacker amount → 403 request_hash_mismatch", async function () {
    const shop = await setup();
    const ch = await issueChallenge(shop);
    const forged = hashChallenge({ ...ch, amount: "1" });
    const result = await shop.http.processHTTPRequest({
      adapter: adapter({
        warrant: warrantHeader(publics(ch, { requestHash: forged }), ch.nonce),
      }),
      path,
      method: "POST",
    });
    assert.equal(result.response?.status, 403);
    assert.equal((result.response?.body as { error?: string }).error, "request_hash_mismatch");
  });

  it("stale root → 403 root_revoked", async function () {
    const shop = await setup();
    const ch = await issueChallenge(shop);
    const result = await shop.http.processHTTPRequest({
      adapter: adapter({
        warrant: warrantHeader(publics(ch, { merkleRoot: 999n }), ch.nonce),
      }),
      path,
      method: "POST",
    });
    assert.equal(result.response?.status, 403);
    assert.equal((result.response?.body as { error?: string }).error, "root_revoked");
  });

  it("getBody consumed without ALS → 403, not an empty-hash grant", async function () {
    const shop = await setup();
    const ch = await issueChallenge(shop);
    const consumed = {
      getHeader: (name: string) =>
        name.toLowerCase() === "warrant"
          ? warrantHeader(publics(ch), ch.nonce)
          : undefined,
      getMethod: () => "POST",
      getPath: () => path,
      getUrl: () => `https://echo.warrant.example${path}`,
      getAcceptHeader: () => "application/json",
      getUserAgent: () => "warrant-shop-test",
      getBody: async () => undefined,
    };
    const result = await shop.http.processHTTPRequest({
      adapter: consumed,
      path,
      method: "POST",
    });
    assert.equal(result.response?.status, 403);
    assert.equal((result.response?.body as { error?: string }).error, "challenge_missing");
  });
});
