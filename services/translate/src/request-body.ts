import { AsyncLocalStorage } from "node:async_hooks";

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
