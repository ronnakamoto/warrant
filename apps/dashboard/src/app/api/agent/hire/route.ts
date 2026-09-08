import { NextResponse } from "next/server";
import { hireForSession } from "../../../../lib/guest-act";
import { PUBLIC_APP_ORIGIN } from "../../../../lib/guest-copy";
import { agentCorsHeaders, publicGuestError, sessionFromBearer } from "../../../../lib/prove-client";

export async function OPTIONS(): Promise<Response> {
  return new Response(null, { status: 204, headers: agentCorsHeaders() });
}

export async function POST(req: Request): Promise<Response> {
  const sessionId = sessionFromBearer(req.headers.get("authorization"));
  if (!sessionId) {
    return NextResponse.json({ error: "missing bearer" }, { status: 401, headers: agentCorsHeaders() });
  }
  try {
    await req.json();
  } catch {
    /* empty body or no JSON is OK */
  }
  let origin = PUBLIC_APP_ORIGIN;
  try {
    origin = new URL(req.url).origin || PUBLIC_APP_ORIGIN;
  } catch {
    /* keep PUBLIC_APP_ORIGIN */
  }
  try {
    const out = await hireForSession(sessionId, req, {}, origin);
    return NextResponse.json(out.body, {
      status: out.status,
      headers: { ...agentCorsHeaders(), ...out.headers },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "hire failed";
    return NextResponse.json(
      { error: publicGuestError(msg) },
      { status: 503, headers: agentCorsHeaders() },
    );
  }
}
