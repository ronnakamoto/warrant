import {
  challengeFrom402,
  hashTranslateBody,
  paymentRequiredFromResponse,
  proveConfig,
  proveRequest,
  publicGuestError,
} from "./prove-client";

export type ActResult = { status: number; body: Record<string, unknown> };

export type LiveWarrant = { id: string; status: string };

export async function revokeEachLive(
  warrants: LiveWarrant[],
  revoke: (id: string) => Promise<{ ok: boolean; txHash?: string }>,
): Promise<{ txHashes: string[]; failed: number }> {
  const txHashes: string[] = [];
  let failed = 0;
  for (const warrant of warrants) {
    if (warrant.status !== "live") continue;
    const out = await revoke(warrant.id);
    if (out.ok) {
      if (typeof out.txHash === "string" && out.txHash.length > 0) txHashes.push(out.txHash);
    } else {
      failed += 1;
    }
  }
  return { txHashes, failed };
}

export async function translateForSession(
  sessionId: string,
  input: { text: string; source: string; target: string },
  req?: Request,
): Promise<ActResult> {
  const { text, source, target } = input;
  const payload = JSON.stringify({ text, source, target });
  const { translateUrl } = proveConfig();
  const probe = await fetch(translateUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: payload,
  });

  if (probe.status === 200) {
    return { status: 200, body: (await probe.json()) as Record<string, unknown> };
  }
  if (probe.status === 403) {
    const err = (await probe.json().catch(() => ({}))) as { error?: string };
    return { status: 403, body: { error: typeof err.error === "string" ? err.error : "root_revoked" } };
  }
  if (probe.status !== 402) {
    return { status: probe.status, body: { error: `translate HTTP ${probe.status}` } };
  }

  const rawBody = (await probe.json().catch(() => ({}))) as Record<string, unknown>;
  const pr = paymentRequiredFromResponse(probe.headers, rawBody) ?? {};
  const extensions = pr.extensions as { warrant?: unknown } | undefined;
  if (!extensions?.warrant) {
    return { status: 402, body: { error: "quota" } };
  }

  const url = new URL(translateUrl);
  const challenge = challengeFrom402(pr, "POST", url.pathname, hashTranslateBody(text, source, target));
  const proved = await proveRequest("/v1/prove", { sessionId, challenge }, req);
  const provedBody = (await proved.json().catch(() => ({}))) as {
    warrant?: string;
    nullifier?: string;
    error?: string;
  };
  if (!proved.ok || !provedBody.warrant) {
    return {
      status: proved.status === 408 ? 408 : 502,
      body: { error: provedBody.error ?? "prove failed" },
    };
  }

  const retry = await fetch(translateUrl, {
    method: "POST",
    headers: { "content-type": "application/json", warrant: provedBody.warrant },
    body: payload,
  });
  if (retry.status === 402) return { status: 402, body: { error: "quota" } };
  if (retry.status === 403) return { status: 403, body: { error: "root_revoked" } };
  if (!retry.ok) return { status: retry.status, body: { error: `translate HTTP ${retry.status}` } };
  const translated = (await retry.json()) as { text?: string; source?: string; target?: string };
  return {
    status: 200,
    body: {
      text: translated.text,
      source: translated.source ?? source,
      target: translated.target ?? target,
      nullifier: provedBody.nullifier,
    },
  };
}

export function parseShopBody(raw: unknown): { text: string; source: string; target: string } | null {
  if (!raw || typeof raw !== "object") return null;
  const input = raw as { text?: unknown; source?: unknown; target?: unknown };
  return {
    text: typeof input.text === "string" ? input.text : "",
    source: typeof input.source === "string" ? input.source : "en",
    target: typeof input.target === "string" ? input.target : "es",
  };
}

export { publicGuestError };
