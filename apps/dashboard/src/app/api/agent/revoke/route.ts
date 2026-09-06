import { NextResponse } from "next/server";
import { agentCorsHeaders, sessionFromBearer } from "../../../../lib/prove-client";

export async function OPTIONS(): Promise<Response> {
  return new Response(null, { status: 204, headers: agentCorsHeaders() });
}

// Hosted agent cannot burn a wallet it does not hold. Fire is MetaMask in the tab.
export async function POST(req: Request): Promise<Response> {
  const sessionId = sessionFromBearer(req.headers.get("authorization"));
  if (!sessionId) {
    return NextResponse.json({ error: "missing bearer" }, { status: 401, headers: agentCorsHeaders() });
  }
  return NextResponse.json(
    { error: "Open the tab and Fire." },
    { status: 409, headers: agentCorsHeaders() },
  );
}
