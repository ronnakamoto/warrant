import type { MiddlewareHandler } from "hono";
import { decodePaymentResponseHeader } from "@x402/core/http";
import { paymentMiddlewareFromHTTPServer } from "@x402/hono";
import {
  parseRequestBody,
  withRequestBody,
} from "./body-als.js";
import type { WarrantShop } from "./shop.js";

export {
  parseRequestBody,
  withRequestBody,
  cachedRequestBody,
  hasRequestBodyStore,
} from "./body-als.js";

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

      const payHdr =
        c.res.headers.get("PAYMENT-RESPONSE") ?? c.res.headers.get("payment-response");
      const settledTxId = txIdFromPaymentResponse(payHdr ?? undefined);
      if (settledTxId) {
        try {
          const raw = (await c.res.clone().json()) as Record<string, unknown>;
          if (raw && typeof raw === "object" && raw.txId !== settledTxId) {
            c.res = c.json({ ...raw, txId: settledTxId });
          }
        } catch {
          /* leave the original 200 */
        }
      }

      const warrant = c.req.header("warrant");
      if (!warrant || !opts?.audit) return;
      try {
        const parsed = JSON.parse(warrant) as { publicSignals?: string[] };
        const signals = parsed.publicSignals;
        if (!(signals && signals.length >= 8)) return;
        await opts.audit({
          nullifier: signals[2]!,
          scope: signals[3]!,
          tier: signals[6]!,
          ...(settledTxId ? { txId: settledTxId } : {}),
        });
      } catch {
        /* ignore audit failures */
      }
    });
  };
}
