import { Hono } from "hono";
import type { ChallengeParts, IProver } from "@warrant/core";
import type { Address, Hex } from "viem";
import { mintGuest, type BindRootFn } from "./mint.js";
import { proveGuest } from "./prove.js";
import { revokeGuest } from "./revoke.js";
import { createRateLimiter, type RateLimiter } from "./rate-limit.js";
import type { LeafLoader } from "./members.js";
import type { SessionStore } from "./session.js";

type RevokeFn = typeof revokeGuest;

export const AUTH_HEADER = "x-warrant-prove-secret";
const BODY_LIMIT = 64 * 1024;
const PROVE_TIMEOUT_MS = 30_000;

export type ProveAppOpts = {
  authSecret: string;
  store?: SessionStore;
  bindPrivateKey?: Hex;
  gasSponsorKey?: Hex;
  registry?: Address;
  rpc?: string;
  loadMembers?: LeafLoader;
  prover?: IProver;
  bindRoot?: BindRootFn;
  mintLimiter?: RateLimiter;
  proveTimeoutMs?: number;
  allowedOrigins?: string[];
  revokeGuest?: RevokeFn;
};

function clientKey(c: { req: { header: (n: string) => string | undefined } }): string {
  return (
    c.req.header("x-warrant-client-ip")?.split(",")[0]?.trim() ||
    c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ||
    "local"
  );
}

function originAllowed(
  c: { req: { header: (n: string) => string | undefined } },
  allowed?: string[],
): boolean {
  if (!allowed || allowed.length === 0) return true;
  const origin = c.req.header("x-warrant-dashboard-origin");
  return typeof origin === "string" && allowed.includes(origin);
}

export function createProveApp(opts: ProveAppOpts): Hono {
  const app = new Hono();
  const limiter =
    opts.mintLimiter ?? createRateLimiter({ max: 5, windowMs: 60 * 60 * 1000 });

  app.get("/health", (c) => c.json({ ok: true }));

  app.use("/v1/*", async (c, next) => {
    if (c.req.header(AUTH_HEADER) !== opts.authSecret) {
      return c.json({ error: "unauthorized" }, 401);
    }
    if (!originAllowed(c, opts.allowedOrigins)) {
      return c.json({ error: "forbidden origin" }, 403);
    }
    return next();
  });

  app.post("/v1/mint", async (c) => {
    if (!opts.store || !opts.bindPrivateKey || !opts.registry || !opts.rpc || !opts.loadMembers) {
      return c.json({ error: "mint not configured" }, 503);
    }
    if (!limiter.take(clientKey(c))) {
      return c.json({ error: "rate_limited" }, 429);
    }
    const minted = await mintGuest({
      store: opts.store,
      bindPrivateKey: opts.bindPrivateKey,
      registry: opts.registry,
      rpc: opts.rpc,
      loadMembers: opts.loadMembers,
      bindRoot: opts.bindRoot,
    });
    return c.json({ sessionId: minted.sessionId, wallet: minted.wallet });
  });

  app.post("/v1/prove", async (c) => {
    if (!opts.store || !opts.prover) {
      return c.json({ error: "prove not configured" }, 503);
    }
    const raw = await c.req.text();
    if (raw.length > BODY_LIMIT) {
      return c.json({ error: "payload too large" }, 413);
    }
    const body = JSON.parse(raw) as { sessionId?: string; challenge?: ChallengeParts };
    if (!body.sessionId || !body.challenge) {
      return c.json({ error: "sessionId and challenge required" }, 400);
    }
    const session = opts.store.get(body.sessionId);
    if (!session) return c.json({ error: "unknown session" }, 404);

    const timeoutMs = opts.proveTimeoutMs ?? PROVE_TIMEOUT_MS;
    let proved: { warrant: string; nullifier: string } | { timeout: true };
    try {
    proved = await Promise.race([
      proveGuest({
        session,
        challenge: body.challenge,
        prover: opts.prover,
        loadMembers: opts.loadMembers,
      }),
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(Object.assign(new Error("prove timeout"), { status: 408 })), timeoutMs);
      }),
    ]).catch((err: Error & { status?: number }) => {
      if (err.status === 408 || /timeout/i.test(err.message)) {
        return { timeout: true as const };
      }
      throw err;
    });
    } catch (err) {
      const message = err instanceof Error ? err.message : "prove failed";
      return c.json({ error: message }, 400);
    }
    if ("timeout" in proved) {
      return c.json({ error: "prove timeout" }, 408);
    }
    return c.json({ warrant: proved.warrant, nullifier: proved.nullifier });
  });

  app.post("/v1/revoke", async (c) => {
    if (!opts.store || !opts.registry || !opts.rpc || !opts.gasSponsorKey || !opts.loadMembers) {
      return c.json({ error: "revoke not configured" }, 503);
    }
    const body = await c.req.json<{ sessionId?: string }>();
    if (!body.sessionId) return c.json({ error: "sessionId required" }, 400);
    const session = opts.store.get(body.sessionId);
    if (!session) return c.json({ error: "unknown session" }, 404);
    const runRevoke = opts.revokeGuest ?? revokeGuest;
    const out = await runRevoke({
      session,
      registry: opts.registry,
      rpc: opts.rpc,
      gasSponsorKey: opts.gasSponsorKey,
      loadMembers: opts.loadMembers,
    });
    session.revoked = true;
    return c.json({ txHash: out.txHash });
  });

  return app;
}
