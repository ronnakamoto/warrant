import { keccak256, stringToBytes } from "viem";

export type ChallengeParts = {
  method: string;
  path: string;
  nonce: string;
  merkleRoot: string;
  amount: string;
  payTo: string;
  bodyHash: string;
};

const AUTH = "x-warrant-prove-secret";

type Env = NodeJS.Dict<string>;

export function isStrictHost(env: Env = process.env): boolean {
  const v = env.WARRANT_STRICT_PROD?.trim().toLowerCase();
  return env.NODE_ENV === "production" || v === "1" || v === "true";
}

export function proveConfig(): { url: string; secret: string; translateUrl: string } {
  const url = process.env.PROVE_URL;
  const secret = process.env.PROVE_SECRET;
  const translateUrl = process.env.TRANSLATE_URL ?? "http://127.0.0.1:8787/v1/translate";
  if (!url || !secret) {
    throw new Error("PROVE_URL and PROVE_SECRET are required");
  }
  return { url: url.replace(/\/$/, ""), secret, translateUrl };
}

export function guestCookie(sessionId: string, env: Env = process.env): string {
  const secure = isStrictHost(env) ? "; Secure" : "";
  return `warrant_guest=${sessionId}; Path=/; HttpOnly; SameSite=Lax; Max-Age=1800${secure}`;
}

export function clearGuestCookie(env: Env = process.env): string {
  const secure = isStrictHost(env) ? "; Secure" : "";
  return `warrant_guest=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
}

export function guestOriginAllowed(req: Request, env: Env = process.env): boolean {
  if (!isStrictHost(env) && !env.DASHBOARD_ORIGIN) return true;
  const allowed = (env.DASHBOARD_ORIGIN ?? new URL(req.url).origin)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const origin = req.headers.get("origin");
  if (origin) return allowed.includes(origin);
  const referer = req.headers.get("referer");
  if (!referer) return false;
  try {
    return allowed.includes(new URL(referer).origin);
  } catch {
    return false;
  }
}

export function publicGuestError(raw: string, env: Env = process.env): string {
  if (isStrictHost(env)) return "Something went wrong. Try again in a moment.";
  return raw;
}

export function clientIpFromRequest(req: Request): string | undefined {
  const forwarded = req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip");
  return forwarded?.split(",")[0]?.trim() || undefined;
}

export function forbiddenGuestResponse(): Response {
  return new Response(JSON.stringify({ error: "forbidden" }), {
    status: 403,
    headers: { "content-type": "application/json" },
  });
}

export async function verifyTurnstile(
  token: string,
  ip: string | undefined,
  env: Env = process.env,
): Promise<boolean> {
  const secret = env.TURNSTILE_SECRET;
  if (!secret) return true;
  if (!token) return false;
  const body = new URLSearchParams({ secret, response: token });
  if (ip) body.set("remoteip", ip);
  const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    body,
  });
  const json = (await res.json().catch(() => ({}))) as { success?: boolean };
  return json.success === true;
}

export function proveForwardHeaders(req: Request): Record<string, string> {
  const headers: Record<string, string> = {};
  const ip = clientIpFromRequest(req);
  if (ip) headers["x-warrant-client-ip"] = ip;
  const origin = req.headers.get("origin") ?? process.env.DASHBOARD_ORIGIN;
  if (origin) headers["x-warrant-dashboard-origin"] = origin;
  return headers;
}

export function sessionFromCookie(header: string | null): string | undefined {
  if (!header) return undefined;
  const m = /(?:^|;\s*)warrant_guest=([^;]+)/.exec(header);
  return m?.[1];
}

export function sessionFromBearer(header: string | null): string | undefined {
  if (!header) return undefined;
  const m = /^\s*Bearer\s+(\S+)\s*$/i.exec(header);
  if (m?.[1]) return m[1];
  const raw = header.trim();
  return raw.length > 0 ? raw : undefined;
}

export function agentCorsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Max-Age": "86400",
  };
}

export async function proveRequest(
  path: "/v1/mint" | "/v1/prove" | "/v1/revoke",
  body: unknown,
  req?: Request,
): Promise<Response> {
  const { url, secret } = proveConfig();
  return fetch(`${url}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      [AUTH]: secret,
      ...(req ? proveForwardHeaders(req) : {}),
    },
    body: JSON.stringify(body ?? {}),
  });
}

export function paymentRequiredFromResponse(
  headers: Headers,
  body: Record<string, unknown> | null,
): Record<string, unknown> | null {
  const header = headers.get("PAYMENT-REQUIRED") ?? headers.get("payment-required");
  if (header) {
    try {
      return JSON.parse(Buffer.from(header, "base64").toString("utf8")) as Record<string, unknown>;
    } catch {
      try {
        return JSON.parse(header) as Record<string, unknown>;
      } catch {
        /* fall through */
      }
    }
  }
  if (body && typeof body === "object" && body.extensions) return body;
  return body;
}

export function challengeFrom402(
  payload: Record<string, unknown>,
  method: string,
  path: string,
  bodyHash: string,
): ChallengeParts {
  const extensions = payload.extensions as
    | { warrant?: { info?: { nonce?: string; merkleRoot?: string } } }
    | undefined;
  const info = extensions?.warrant?.info;
  if (!info?.nonce || !info.merkleRoot) {
    throw new Error("402 missing warrant challenge");
  }
  const accepts = payload.accepts as
    | Array<{ amount?: string; payTo?: string; price?: { amount?: string } }>
    | undefined;
  const accept0 = accepts?.[0];
  return {
    method,
    path,
    nonce: info.nonce,
    merkleRoot: info.merkleRoot,
    amount: accept0?.amount ?? accept0?.price?.amount ?? "100000",
    payTo: accept0?.payTo ?? "0.0.1",
    bodyHash,
  };
}

export function hashTranslateBody(text: string, source?: string, target?: string): string {
  return keccak256(stringToBytes(JSON.stringify({ text, source, target })));
}
