import { NextResponse } from "next/server";
import {
  clearDeskCookie,
  clearGuestCookie,
  forbiddenGuestResponse,
  guestOriginAllowed,
} from "../../../../lib/prove-client";

export async function POST(req: Request): Promise<Response> {
  if (!guestOriginAllowed(req)) return forbiddenGuestResponse();
  const out = new NextResponse(null, { status: 204 });
  out.headers.append("set-cookie", clearGuestCookie());
  out.headers.append("set-cookie", clearDeskCookie());
  return out;
}
