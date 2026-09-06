import { NextResponse } from "next/server";
import {
  forbiddenGuestResponse,
  guestOriginAllowed,
  proveRequest,
  publicGuestError,
  sessionFromCookie,
} from "../../../../lib/prove-client";

export async function POST(req: Request): Promise<Response> {
  if (!guestOriginAllowed(req)) return forbiddenGuestResponse();
  const sessionId = sessionFromCookie(req.headers.get("cookie"));
  if (!sessionId) {
    return NextResponse.json({ error: "no session" }, { status: 401 });
  }
  try {
    const res = await proveRequest("/v1/revoke", { sessionId }, req);
    const body = await res.json().catch(() => ({}));
    return NextResponse.json(
      res.ok ? { txHash: body.txHash } : { error: publicGuestError(body.error ?? "revoke failed") },
      { status: res.ok ? 200 : res.status },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "revoke failed";
    return NextResponse.json({ error: publicGuestError(msg) }, { status: 503 });
  }
}
