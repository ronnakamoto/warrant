import { NextResponse } from "next/server";
import { GUEST_COPY } from "../../../../lib/guest-copy";
import {
  deskFromCookie,
  forbiddenGuestResponse,
  guestOriginAllowed,
  proveRequest,
  publicGuestError,
  sessionFromCookie,
} from "../../../../lib/prove-client";

type RevokeBody = { sessionId?: string; all?: boolean; txHash?: string };
type WarrantView = { id: string; status: string };

export async function POST(req: Request): Promise<Response> {
  if (!guestOriginAllowed(req)) return forbiddenGuestResponse();

  let body: RevokeBody = {};
  try {
    body = (await req.json()) as RevokeBody;
  } catch {
    /* empty body is fine */
  }

  const deskId = deskFromCookie(req.headers.get("cookie"));
  const txHash = typeof body.txHash === "string" ? body.txHash.trim() : "";

  try {
    if (body.all === true && !txHash) {
      if (!deskId) {
        return NextResponse.json({ error: "no desk" }, { status: 401 });
      }
      const listRes = await proveRequest("/v1/desk", { deskId }, req);
      const listBody = await listRes.json().catch(() => ({}));
      if (!listRes.ok) {
        return NextResponse.json(
          {
            error: publicGuestError(
              typeof listBody.error === "string" ? listBody.error : "desk list failed",
            ),
          },
          { status: listRes.status },
        );
      }
      const warrants = (listBody.warrants ?? []) as WarrantView[];
      const firstLive = warrants.find((w) => w.status === "live");
      if (!firstLive) {
        return NextResponse.json({ error: publicGuestError(GUEST_COPY.revokeFailed) }, { status: 404 });
      }
      const res = await proveRequest("/v1/revoke", { sessionId: firstLive.id, deskId }, req);
      const prep = await res.json().catch(() => ({}));
      return NextResponse.json(
        res.ok ? { ...prep, sessionId: firstLive.id } : { error: publicGuestError(prep.error ?? "revoke failed") },
        { status: res.ok ? 200 : res.status },
      );
    }

    const sessionId =
      typeof body.sessionId === "string" ? body.sessionId : sessionFromCookie(req.headers.get("cookie"));
    if (!sessionId) {
      return NextResponse.json({ error: "no session" }, { status: 401 });
    }
    const res = await proveRequest(
      "/v1/revoke",
      { sessionId, deskId, ...(txHash ? { txHash } : {}) },
      req,
    );
    const resBody = await res.json().catch(() => ({}));
    if (!res.ok) {
      return NextResponse.json(
        { error: publicGuestError(resBody.error ?? "revoke failed") },
        { status: res.status },
      );
    }
    return NextResponse.json(resBody);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "revoke failed";
    return NextResponse.json({ error: publicGuestError(msg) }, { status: 503 });
  }
}
