import { NextResponse } from "next/server";
import {
  clientIpFromRequest,
  forbiddenGuestResponse,
  guestCookie,
  guestOriginAllowed,
  proveRequest,
  publicGuestError,
  verifyTurnstile,
} from "../../../lib/prove-client";

export async function POST(req: Request): Promise<Response> {
  if (!guestOriginAllowed(req)) return forbiddenGuestResponse();
  let turnstile = "";
  try {
    const body = (await req.clone().json()) as { turnstile?: unknown };
    if (typeof body.turnstile === "string") turnstile = body.turnstile;
  } catch {
    /* empty body is fine */
  }
  try {
    if (!(await verifyTurnstile(turnstile, clientIpFromRequest(req)))) {
      return NextResponse.json({ error: "captcha" }, { status: 403 });
    }
    const res = await proveRequest("/v1/mint", {}, req);
    const body = await res.json().catch(() => ({}));
    if (res.status === 429) {
      return NextResponse.json({ error: "rate_limited" }, { status: 429 });
    }
    if (!res.ok) {
      return NextResponse.json(
        { error: publicGuestError(typeof body.error === "string" ? body.error : "mint failed") },
        { status: res.status },
      );
    }
    const sessionId = body.sessionId as string | undefined;
    if (!sessionId) {
      return NextResponse.json({ error: publicGuestError("mint returned no session") }, { status: 502 });
    }
    const out = NextResponse.json({
      token: sessionId,
      wallet: body.wallet,
      ready: true,
    });
    out.headers.set("set-cookie", guestCookie(sessionId));
    return out;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "mint failed";
    return NextResponse.json({ error: publicGuestError(msg) }, { status: 503 });
  }
}
