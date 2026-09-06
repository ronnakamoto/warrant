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

type RevokeBody = { sessionId?: string; all?: boolean };
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

  if (body.all === true) {
    if (!deskId) {
      return NextResponse.json({ error: "no desk" }, { status: 401 });
    }
    try {
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
      const txHashes: string[] = [];
      for (const warrant of warrants) {
        if (warrant.status !== "live") continue;
        const res = await proveRequest("/v1/revoke", { sessionId: warrant.id, deskId }, req);
        const revokeBody = await res.json().catch(() => ({}));
        if (!res.ok) {
          return NextResponse.json(
            { error: publicGuestError(GUEST_COPY.revokeFailed) },
            { status: 503 },
          );
        }
        if (typeof revokeBody.txHash === "string") txHashes.push(revokeBody.txHash);
      }
      return NextResponse.json({ txHashes });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "revoke failed";
      return NextResponse.json({ error: publicGuestError(msg) }, { status: 503 });
    }
  }

  const sessionId =
    typeof body.sessionId === "string" ? body.sessionId : sessionFromCookie(req.headers.get("cookie"));
  if (!sessionId) {
    return NextResponse.json({ error: "no session" }, { status: 401 });
  }
  try {
    const res = await proveRequest("/v1/revoke", { sessionId, deskId }, req);
    const resBody = await res.json().catch(() => ({}));
    return NextResponse.json(
      res.ok ? { txHash: resBody.txHash } : { error: publicGuestError(resBody.error ?? "revoke failed") },
      { status: res.ok ? 200 : res.status },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "revoke failed";
    return NextResponse.json({ error: publicGuestError(msg) }, { status: 503 });
  }
}
