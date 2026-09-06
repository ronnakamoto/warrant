import { NextResponse } from "next/server";
import { agentCorsHeaders, proveRequest, publicGuestError, sessionFromBearer } from "../../../../lib/prove-client";

export async function OPTIONS(): Promise<Response> {
  return new Response(null, { status: 204, headers: agentCorsHeaders() });
}

export async function POST(req: Request): Promise<Response> {
  const sessionId = sessionFromBearer(req.headers.get("authorization"));
  if (!sessionId) {
    return NextResponse.json({ error: "missing bearer" }, { status: 401, headers: agentCorsHeaders() });
  }
  try {
    const res = await proveRequest("/v1/revoke", { sessionId }, req);
    const body = await res.json().catch(() => ({}));
    return NextResponse.json(
      res.ok ? { txHash: body.txHash } : { error: publicGuestError(body.error ?? "revoke failed") },
      { status: res.ok ? 200 : res.status, headers: agentCorsHeaders() },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "revoke failed";
    return NextResponse.json(
      { error: publicGuestError(msg) },
      { status: 503, headers: agentCorsHeaders() },
    );
  }
}
