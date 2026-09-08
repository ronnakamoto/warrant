import { Hono } from "hono";
import { cors } from "hono/cors";
import { decodePaymentResponseHeader } from "@x402/core/http";
import { warrantHono } from "@ronnakamoto/warrant-x402";
import type { Wired } from "./wiring.js";
import { translate as defaultTranslate, type Translator } from "./translate.js";
import type { HcsSink } from "./hcs.js";

export type AppDeps = {
  wired: Wired;
  hcs?: HcsSink;
  translate?: Translator;
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

export function createApp(deps: AppDeps): Hono {
  const app = new Hono();
  const hcs = deps.hcs ?? deps.wired.hcs;

  app.use(
    "*",
    cors({
      origin: "*",
      allowMethods: ["GET", "POST", "OPTIONS"],
      allowHeaders: ["Content-Type", "warrant"],
    }),
  );

  app.use("/v1/*", warrantHono(deps.wired, { audit: hcs.submit }));

  const runTranslate = deps.translate ?? defaultTranslate;

  app.post("/v1/translate", async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const text = typeof body?.text === "string" ? body.text : "";
    const source = typeof body?.source === "string" ? body.source : undefined;
    const target = typeof body?.target === "string" ? body.target : undefined;
    const out = await runTranslate({ text, source, target });
    let txId: string | undefined;
    const warrant = c.req.header("warrant");
    if (warrant) {
      try {
        const parsed = JSON.parse(warrant) as { publicSignals?: string[] };
        const nullifier = parsed.publicSignals?.[2];
        if (nullifier) txId = deps.wired.sponsorTxIds.get(nullifier);
      } catch {
        /* ignore */
      }
    }
    if (!txId) {
      txId = txIdFromPaymentResponse(
        c.res.headers.get("PAYMENT-RESPONSE") ?? c.res.headers.get("payment-response") ?? undefined,
      );
    }
    return c.json({
      text: out,
      source: source ?? "en",
      target: target ?? "es",
      ...(txId ? { txId } : {}),
    });
  });

  app.get("/health", (c) => c.json({ ok: true }));

  return app;
}
