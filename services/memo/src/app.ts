import { Hono } from "hono";
import { cors } from "hono/cors";
import { warrantHono } from "@ronnakamoto/warrant-x402";
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
    const { txId } = await shop.submit(parsed.text);
    return c.json({ text: parsed.text, hashscan: hashscanTestnetUrl(txId) });
  });

  app.get("/health", (c) => c.json({ ok: true }));

  return app;
}
