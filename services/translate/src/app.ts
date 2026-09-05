import { Hono } from "hono";
import { paymentMiddlewareFromHTTPServer } from "@x402/hono";
import type { Wired } from "./wiring.js";
import { translate } from "./translate.js";
import type { HcsSink } from "./hcs.js";

export type AppDeps = {
  wired: Wired;
  hcs?: HcsSink;
};

export function createApp(deps: AppDeps): Hono {
  const app = new Hono();
  const hcs = deps.hcs ?? deps.wired.hcs;

  app.use("/v1/*", paymentMiddlewareFromHTTPServer(deps.wired.http));

  app.post("/v1/translate", async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const text = typeof body?.text === "string" ? body.text : "";
    const out = translate(text);
    // Audit: nullifier-only after middleware authorized the request
    const warrant = c.req.header("warrant");
    if (warrant) {
      try {
        const parsed = JSON.parse(warrant) as {
          publicSignals?: string[];
          nonce?: string;
        };
        const signals = parsed.publicSignals;
        // Prefer server-issued challenge lookup when nonce hint present
        const issued = parsed.nonce
          ? deps.wired.challenges.resolve(parsed.nonce)
          : deps.wired.challenges.last();
        if (signals && signals.length >= 8 && issued) {
          // Only audit when nullifier matches a sealed request under this challenge
          await hcs.submit({
            nullifier: signals[2]!,
            scope: signals[3]!,
            tier: signals[6]!,
          });
        }
      } catch {
        /* ignore */
      }
    }
    return c.json({ text: out });
  });

  app.get("/health", (c) => c.json({ ok: true }));

  return app;
}
