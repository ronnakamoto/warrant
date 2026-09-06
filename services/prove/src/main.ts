import { createSnarkjsProver } from "@warrant/agent";
import { createProveApp } from "./app.js";
import { createGraphLeafLoader } from "./members.js";
import { assertProductionProveEnv, shouldEnforceStrictProd } from "./prod-guard.js";
import { createPersistedSessionStore } from "./persist.js";
import { createSessionStore } from "./session.js";
import type { Address, Hex } from "viem";

async function main(): Promise<void> {
  if (shouldEnforceStrictProd()) {
    assertProductionProveEnv(process.env);
  }
  const secret = process.env.PROVE_SECRET;
  if (!secret) {
    throw new Error("PROVE_SECRET is required");
  }
  const bindPrivateKey = process.env.BIND_PRIVATE_KEY as Hex | undefined;
  const gasSponsorKey = (process.env.GAS_SPONSOR_PRIVATE_KEY || process.env.BIND_PRIVATE_KEY) as
    | Hex
    | undefined;
  if (
    bindPrivateKey &&
    gasSponsorKey &&
    gasSponsorKey.toLowerCase() === bindPrivateKey.toLowerCase()
  ) {
    console.warn("prove: GAS_SPONSOR_PRIVATE_KEY equals BIND_PRIVATE_KEY — set a distinct sponsor before public host");
  }
  const registry = process.env.REGISTRY_ADDRESS as Address | undefined;
  const rpc = process.env.BASE_SEPOLIA_RPC;
  const queryUrl = process.env.GRAPH_WARRANT_QUERY_URL;
  if (!bindPrivateKey || !registry || !rpc) {
    throw new Error("BIND_PRIVATE_KEY, REGISTRY_ADDRESS, and BASE_SEPOLIA_RPC are required");
  }
  if (!queryUrl) {
    throw new Error("GRAPH_WARRANT_QUERY_URL is required so guest proofs see the live tree");
  }

  const ttlMs = Number(process.env.GUEST_TTL_MS ?? 30 * 60 * 1000);
  const sessionPath = process.env.WARRANT_SESSION_PATH;
  const store = sessionPath
    ? createPersistedSessionStore({ path: sessionPath, ttlMs })
    : createSessionStore({ ttlMs });
  setInterval(() => store.sweep(), 60_000).unref();

  const allowedOrigins = (process.env.PROVE_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const app = createProveApp({
    authSecret: secret,
    store,
    bindPrivateKey,
    gasSponsorKey,
    registry,
    rpc,
    allowedOrigins: allowedOrigins.length > 0 ? allowedOrigins : undefined,
    loadMembers: createGraphLeafLoader({
      queryUrl,
      apiKey: process.env.GRAPH_API_KEY,
    }),
    prover: createSnarkjsProver(),
  });

  const port = Number(process.env.PORT ?? process.env.PROVE_PORT ?? 8788);
  const { serve } = await import("@hono/node-server");
  serve({ fetch: app.fetch, port });
  console.log(`prove listening on :${port}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
