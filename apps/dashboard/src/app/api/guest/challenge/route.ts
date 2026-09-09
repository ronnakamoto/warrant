import { NextResponse } from "next/server";
import {
  forbiddenGuestResponse,
  guestOriginAllowed,
  proveRequest,
  publicGuestError,
} from "../../../../lib/prove-client";

export async function POST(req: Request): Promise<Response> {
  if (!guestOriginAllowed(req)) return forbiddenGuestResponse();
  try {
    const res = await proveRequest("/v1/desk-challenge", {}, req);
    const body = await res.json().catch(() => ({}));
    return NextResponse.json(body, { status: res.status });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "challenge failed";
    return NextResponse.json({ error: publicGuestError(msg) }, { status: 503 });
  }
}
