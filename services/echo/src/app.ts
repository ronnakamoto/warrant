import { Hono } from "hono";
import { cors } from "hono/cors";
import { warrantHono, type WarrantShop } from "@ronnakamoto/warrant-x402";

export async function echo(body: unknown): Promise<{ text: string }> {
  const text =
    body && typeof body === "object" && "text" in body && typeof body.text === "string"
      ? body.text
      : "";
  return { text };
}

export function createEchoApp(shop: WarrantShop): Hono {
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

  app.post("/v1/echo", async (c) => {
    const body = await c.req.json().catch(() => ({}));
    return c.json(await echo(body));
  });

  app.get("/health", (c) => c.json({ ok: true }));

  return app;
}
