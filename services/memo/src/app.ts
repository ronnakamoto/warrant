import { Hono } from "hono";
import { cors } from "hono/cors";
import { parseRequestBody, warrantHono } from "@ronnakamoto/warrant-x402";
import { hashscanTestnetUrl } from "./hashscan.js";
import { parseMemoText } from "./memo.js";
import type { MemoShop } from "./wiring.js";

export function createMemoApp(shop: MemoShop): Hono {
  const app = new Hono();

  app.use(
    "*",
    cors({
      origin: "*",
      allowMethods: ["GET", "POST", "OPTIONS"],
      allowHeaders: ["Content-Type", "warrant"],
    }),
  );

  // Clone-parse before warrantHono so empty/too_long never verify or settle.
  app.use("/v1/memo", async (c, next) => {
    if (c.req.method !== "POST") return next();
    const parsed = parseMemoText(await parseRequestBody(c.req.raw));
    if (!parsed.ok) return c.json({ error: parsed.error }, 400);
    return next();
  });

  app.use("/v1/*", warrantHono(shop, {
    audit: async (event) => {
      console.log(
        JSON.stringify({
          audit: "warrant",
          nullifier: event.nullifier,
          scope: event.scope,
          tier: event.tier,
          txId: event.txId ?? null,
        }),
      );
    },
  }));

  app.post("/v1/memo", async (c) => {
    const parsed = parseMemoText(await c.req.json().catch(() => ({})));
    if (!parsed.ok) return c.json({ error: parsed.error }, 400);
    try {
      const { txId } = await shop.submit(parsed.text);
      return c.json({ text: parsed.text, hashscan: hashscanTestnetUrl(txId) });
    } catch {
      return c.json({ error: "submit_failed" }, 502);
    }
  });

  app.get("/health", (c) => c.json({ ok: true }));

  return app;
}
