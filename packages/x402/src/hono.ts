import { AsyncLocalStorage } from "node:async_hooks";
import type { MiddlewareHandler } from "hono";
import { decodePaymentResponseHeader } from "@x402/core/http";
import { paymentMiddlewareFromHTTPServer } from "@x402/hono";
import type { WarrantShop } from "./shop.js";

/**
 * x402's Hono adapter calls `c.req.json()` during `processHTTPRequest`.
 * A second `getBody()` in `resolveChallenge` then returns undefined, so the
 * server hashed `""` while the client hashed the real JSON (request_hash_mismatch).
 * Stash a clone-parsed body for the rest of the request.
 */
const als = new AsyncLocalStorage<{ body: unknown }>();

export async function parseRequestBody(req: Request): Promise<unknown> {
  const raw = await req.clone().text();
  if (raw.length === 0) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

export function withRequestBody<T>(body: unknown, fn: () => T): T {
  return als.run({ body }, fn);
}

export function cachedRequestBody(): unknown {
  return als.getStore()?.body;
}

/** True inside `withRequestBody` (including an empty POST). */
export function hasRequestBodyStore(): boolean {
  return als.getStore() !== undefined;
}

export type WarrantAuditEvent = {
  nullifier: string;
  scope: string;
  tier: string;
  txId?: string;
};

function txIdFromPaymentResponse(header: string | undefined): string | undefined {
  if (!header) return undefined;
  try {
    const decoded = decodePaymentResponseHeader(header) as { transaction?: string };
    return typeof decoded.transaction === "string" && decoded.transaction.length > 0
      ? decoded.transaction
      : undefined;
  } catch {
    return undefined;
  }
}

export function warrantHono(
  shop: WarrantShop,
  opts?: {
    audit?: (event: WarrantAuditEvent) => Promise<void>;
  },
): MiddlewareHandler {
  const paymentMw = paymentMiddlewareFromHTTPServer(shop.http);
  return async (c, next) => {
    const parsedBody = await parseRequestBody(c.req.raw);
    return withRequestBody(parsedBody, async () => {
      const out = await paymentMw(c, next);
      if (out instanceof Response) return out;
      if (c.res.status !== 200) return;
      const warrant = c.req.header("warrant");
      if (!warrant || !opts?.audit) return;
      try {
        const parsed = JSON.parse(warrant) as { publicSignals?: string[] };
        const signals = parsed.publicSignals;
        if (!(signals && signals.length >= 8)) return;
        const payHdr =
          c.res.headers.get("PAYMENT-RESPONSE") ?? c.res.headers.get("payment-response");
        const txId = txIdFromPaymentResponse(payHdr ?? undefined);
        await opts.audit({
          nullifier: signals[2]!,
          scope: signals[3]!,
          tier: signals[6]!,
          ...(txId ? { txId } : {}),
        });
      } catch {
        /* ignore audit failures */
      }
    });
  };
}
