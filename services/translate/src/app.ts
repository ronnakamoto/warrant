import { Hono } from "hono";
import { cors } from "hono/cors";
import { decodePaymentResponseHeader } from "@x402/core/http";
import { paymentMiddlewareFromHTTPServer } from "@x402/hono";
import type { Wired } from "./wiring.js";
import { parseRequestBody, withRequestBody } from "./request-body.js";
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
  const paymentMw = paymentMiddlewareFromHTTPServer(deps.wired.http);

  app.use(
    "*",
    cors({
      origin: "*",
      allowMethods: ["GET", "POST", "OPTIONS"],
      allowHeaders: ["Content-Type", "warrant"],
    }),
  );

  // Run payment middleware (incl. after-handler settle), then audit once with optional txId.
  // Must return x402's Response — discarding it leaves Hono unfinalized (500 instead of 402).
  app.use("/v1/*", async (c, next) => {
    const parsedBody = await parseRequestBody(c.req.raw);
    return withRequestBody(parsedBody, async () => {
      const out = await paymentMw(c, next);
      if (out instanceof Response) return out;
      if (c.res.status !== 200) return;
      const warrant = c.req.header("warrant");
      if (!warrant) return;
      try {
        const parsed = JSON.parse(warrant) as {
          publicSignals?: string[];
          nonce?: string;
        };
        const signals = parsed.publicSignals;
        const issued = parsed.nonce
          ? deps.wired.challenges.resolve(parsed.nonce)
          : deps.wired.challenges.last();
        if (!(signals && signals.length >= 8 && issued)) return;
        const payHdr =
          c.res.headers.get("PAYMENT-RESPONSE") ?? c.res.headers.get("payment-response");
        await hcs.submit({
          nullifier: signals[2]!,
          scope: signals[3]!,
          tier: signals[6]!,
          txId: txIdFromPaymentResponse(payHdr ?? undefined),
        });
      } catch {
        /* ignore audit failures */
      }
    });
  });

  const runTranslate = deps.translate ?? defaultTranslate;

  app.post("/v1/translate", async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const text = typeof body?.text === "string" ? body.text : "";
    const source = typeof body?.source === "string" ? body.source : undefined;
    const target = typeof body?.target === "string" ? body.target : undefined;
    const out = await runTranslate({ text, source, target });
    return c.json({ text: out, source: source ?? "en", target: target ?? "es" });
  });

  app.get("/health", (c) => c.json({ ok: true }));

  return app;
}
