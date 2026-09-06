import { NextResponse } from "next/server";
import {
  deskFromCookie,
  forbiddenGuestResponse,
  guestOriginAllowed,
  guestWarrantsBody,
  proveRequest,
  publicGuestError,
} from "../../../../lib/prove-client";

export async function GET(req: Request): Promise<Response> {
  if (!guestOriginAllowed(req)) return forbiddenGuestResponse();
  const deskId = deskFromCookie(req.headers.get("cookie"));
  if (!deskId) return NextResponse.json({ error: "no desk" }, { status: 401 });
  const res = await proveRequest("/v1/desk", { deskId }, req);
  const body = (await res.json().catch(() => ({}))) as { warrants?: unknown[]; error?: string };
  if (!res.ok) {
    return NextResponse.json(
      { error: publicGuestError(typeof body.error === "string" ? body.error : "desk list failed") },
      { status: res.status },
    );
  }
  const warrants = Array.isArray(body.warrants) ? body.warrants : [];
  return NextResponse.json(guestWarrantsBody(warrants, req.headers.get("cookie")));
}
