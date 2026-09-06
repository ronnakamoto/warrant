import { decodePaymentRequiredHeader } from "@x402/core/http";
import { wrapFetchWithPayment, x402Client } from "@x402/fetch";
import { bodyHashFromCanonical, type ChallengeParts, type IProver } from "@warrant/core";
import { proveForChallenge, warrantHeaderJson } from "./prove-flow.js";
import { loadState, type WarrantState } from "./store.js";

export type WarrantFetchOptions = {
  /** Agent tip of the mandate chain (e.g. translator). */
  as: string;
  state?: WarrantState;
  storePath?: string;
  /**
   * Required when a 402 warrant challenge must be proven.
   * Construct via createSnarkjsProver() in cli/demo composition roots.
   */
  prover: IProver;
  /**
   * Optional payment-capable fetch for quota-exhausted 402s.
   * When omitted, a second 402 after a valid warrant is returned as-is.
   */
  paymentFetch?: typeof globalThis.fetch;
  fetchImpl?: typeof globalThis.fetch;
  /** Amount/payTo defaults if PaymentRequired accepts[0] lacks them. */
  amount?: string;
  payTo?: string;
};

function paymentRequiredFromResponse(res: Response): Record<string, unknown> | null {
  const header =
    res.headers.get("PAYMENT-REQUIRED") ?? res.headers.get("payment-required");
  if (header) {
    try {
      return decodePaymentRequiredHeader(header) as unknown as Record<string, unknown>;
    } catch {
      /* fall through */
    }
  }
  return null;
}

function challengeFromPaymentRequired(
  body: Record<string, unknown>,
  method: string,
  path: string,
  bodyHash: string,
  defaults: { amount: string; payTo: string },
): ChallengeParts {
  const extensions = body.extensions as
    | { warrant?: { info?: { nonce?: string; merkleRoot?: string } } }
    | undefined;
  const info = extensions?.warrant?.info;
  if (!info?.nonce || !info.merkleRoot) {
    throw new Error("402 missing extensions.warrant.info.nonce/merkleRoot");
  }
  const accepts = body.accepts as Array<{ amount?: string; payTo?: string; price?: { amount?: string } }> | undefined;
  const accept0 = accepts?.[0];
  const amount =
    accept0?.amount ?? accept0?.price?.amount ?? defaults.amount;
  const payTo = accept0?.payTo ?? defaults.payTo;
  return {
    method,
    path,
    nonce: info.nonce,
    merkleRoot: info.merkleRoot,
    amount,
    payTo,
    bodyHash,
  };
}

/**
 * Fetch wrapper: on 402 with warrant challenge, prove and retry with `warrant` header.
 * Does not use onBeforeVerify. Payment rail is optional via paymentFetch / wrapFetchWithPayment.
 */
export async function warrantFetch(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  opts: WarrantFetchOptions,
): Promise<Response> {
  const state = opts.state ?? loadState(opts.storePath);
  const url = typeof input === "string" || input instanceof URL ? new URL(String(input)) : new URL(input.url);
  const method = (init?.method ?? "GET").toUpperCase();
  const path = url.pathname;

  const bodyHash = bodyHashFromCanonical(
    typeof init?.body === "string" || init?.body instanceof Uint8Array ? init.body : undefined,
  );

  const doFetch = opts.fetchImpl ?? globalThis.fetch;
  // Probe without paymentFetch so free-tier warrant challenges are not auto-settled.
  const res1 = await doFetch(input, init);

  if (res1.status !== 402) return res1;

  let pr = paymentRequiredFromResponse(res1);
  if (!pr) {
    try {
      pr = (await res1.clone().json()) as Record<string, unknown>;
    } catch {
      return res1;
    }
  }

  const extensions = pr.extensions as { warrant?: unknown } | undefined;
  if (!extensions?.warrant) {
    // Pure payment 402 — settle when a payment-capable fetch is provided.
    if (opts.paymentFetch) return opts.paymentFetch(input, init);
    return res1;
  }

  const challenge = challengeFromPaymentRequired(pr, method, path, bodyHash, {
    amount: opts.amount ?? "100000",
    payTo: opts.payTo ?? "0.0.10311260",
  });

  const proved = await proveForChallenge({
    state,
    as: opts.as,
    challenge,
    prover: opts.prover,
  });

  const headers = new Headers(init?.headers);
  headers.set("warrant", warrantHeaderJson(proved));

  // Retry with warrant; paymentFetch settles quota-exhausted exact/hedera 402s.
  const retryFetch = opts.paymentFetch ?? doFetch;
  return retryFetch(input, { ...init, headers });
}

/** Helper: wrap global fetch with warrant + optional x402 payment client. */
export function createWarrantFetch(
  opts: WarrantFetchOptions & { x402?: x402Client },
): typeof globalThis.fetch {
  const paymentFetch = opts.x402
    ? wrapFetchWithPayment(globalThis.fetch, opts.x402)
    : undefined;
  return (input, init) =>
    warrantFetch(input, init, {
      ...opts,
      paymentFetch,
    });
}
