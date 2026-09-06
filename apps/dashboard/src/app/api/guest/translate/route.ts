import { NextResponse } from "next/server";
import { parseShopBody, translateForSession } from "../../../../lib/guest-act";
import {
  forbiddenGuestResponse,
  guestOriginAllowed,
  publicGuestError,
  sessionFromCookie,
} from "../../../../lib/prove-client";

export async function POST(req: Request): Promise<Response> {
  if (!guestOriginAllowed(req)) return forbiddenGuestResponse();
  const sessionId = sessionFromCookie(req.headers.get("cookie"));
  if (!sessionId) {
    return NextResponse.json({ error: "no session" }, { status: 401 });
  }
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  const input = parseShopBody(raw);
  if (!input) return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  try {
    const out = await translateForSession(sessionId, input, req);
    return NextResponse.json(out.body, { status: out.status });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "translate failed";
    return NextResponse.json({ error: publicGuestError(msg) }, { status: 503 });
  }
}
