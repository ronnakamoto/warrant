export const MEMO_MAX = 240;

export function parseMemoText(body: unknown): { ok: true; text: string } | { ok: false; error: "empty" | "too_long" } {
  const text =
    body && typeof body === "object" && "text" in body && typeof (body as { text: unknown }).text === "string"
      ? (body as { text: string }).text.trim()
      : "";
  if (!text) return { ok: false, error: "empty" };
  if ([...text].length > MEMO_MAX) return { ok: false, error: "too_long" };
  return { ok: true, text };
}
