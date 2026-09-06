import { NextResponse } from "next/server";
import {
  deskFromCookie,
  forbiddenGuestResponse,
  guestOriginAllowed,
  proveRequest,
} from "../../../../lib/prove-client";

export async function GET(req: Request): Promise<Response> {
  if (!guestOriginAllowed(req)) return forbiddenGuestResponse();
  const deskId = deskFromCookie(req.headers.get("cookie"));
  if (!deskId) return NextResponse.json({ error: "no desk" }, { status: 401 });
  const res = await proveRequest("/v1/desk", { deskId }, req);
  const body = await res.json().catch(() => ({}));
  return NextResponse.json(body, { status: res.status });
}
