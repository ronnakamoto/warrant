import { NextResponse } from "next/server";
import {
  deskCookie,
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

export async function POST(req: Request): Promise<Response> {
  if (!guestOriginAllowed(req)) return forbiddenGuestResponse();
  let body: { wallet?: unknown; nonce?: unknown; signature?: unknown } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "wallet, nonce, and signature required" }, { status: 400 });
  }
  if (
    typeof body.wallet !== "string" ||
    typeof body.nonce !== "string" ||
    typeof body.signature !== "string"
  ) {
    return NextResponse.json({ error: "wallet, nonce, and signature required" }, { status: 400 });
  }
  try {
    const res = await proveRequest(
      "/v1/desk-recover",
      { wallet: body.wallet, nonce: body.nonce, signature: body.signature },
      req,
    );
    const proveBody = (await res.json().catch(() => ({}))) as {
      deskId?: unknown;
      warrants?: unknown;
      error?: unknown;
    };
    if (!res.ok) {
      return NextResponse.json(
        {
          error: publicGuestError(
            typeof proveBody.error === "string" ? proveBody.error : "recover failed",
          ),
        },
        { status: res.status },
      );
    }
    const warrants = Array.isArray(proveBody.warrants) ? proveBody.warrants : [];
    const out = NextResponse.json(guestWarrantsBody(warrants, req.headers.get("cookie")));
    if (typeof proveBody.deskId === "string" && proveBody.deskId) {
      out.headers.set("set-cookie", deskCookie(proveBody.deskId));
    }
    return out;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "recover failed";
    return NextResponse.json({ error: publicGuestError(msg) }, { status: 503 });
  }
}
