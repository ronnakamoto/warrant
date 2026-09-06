import { NextResponse } from "next/server";
import { parseShopBody, translateForSession } from "../../../../lib/guest-act";
import { agentCorsHeaders, publicGuestError, sessionFromBearer } from "../../../../lib/prove-client";

export async function OPTIONS(): Promise<Response> {
  return new Response(null, { status: 204, headers: agentCorsHeaders() });
}

export async function POST(req: Request): Promise<Response> {
  const sessionId = sessionFromBearer(req.headers.get("authorization"));
  if (!sessionId) {
    return NextResponse.json({ error: "missing bearer" }, { status: 401, headers: agentCorsHeaders() });
  }
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400, headers: agentCorsHeaders() });
  }
  const input = parseShopBody(raw);
  if (!input) {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400, headers: agentCorsHeaders() });
  }
  try {
    const out = await translateForSession(sessionId, input, req);
    return NextResponse.json(out.body, { status: out.status, headers: agentCorsHeaders() });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "translate failed";
    return NextResponse.json(
      { error: publicGuestError(msg) },
      { status: 503, headers: agentCorsHeaders() },
    );
  }
}
