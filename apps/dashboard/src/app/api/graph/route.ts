import { NextResponse } from "next/server";
import { AGENT0_BASE_SEPOLIA_ID } from "../../../lib/graph";

type Source = "warrant" | "agent0";

function gatewayUrl(subgraphId: string, apiKey: string): string {
  return `https://gateway.thegraph.com/api/${apiKey}/subgraphs/id/${subgraphId}`;
}

function warrantUrl(apiKey: string): string | null {
  const direct = process.env.GRAPH_WARRANT_QUERY_URL;
  if (direct) return direct;
  const id = process.env.GRAPH_WARRANT_SUBGRAPH_ID;
  if (!id) return null;
  if (id.startsWith("http")) return id;
  return gatewayUrl(id, apiKey);
}

export async function POST(req: Request): Promise<Response> {
  const apiKey = process.env.GRAPH_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "GRAPH_API_KEY is unset. Create a key in Subgraph Studio." },
      { status: 503 },
    );
  }

  let body: { source?: Source; query?: string };
  try {
    body = (await req.json()) as { source?: Source; query?: string };
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const source: Source = body.source === "agent0" ? "agent0" : "warrant";
  const query = typeof body.query === "string" ? body.query : "";
  if (!query.includes("{")) {
    return NextResponse.json({ error: "query required" }, { status: 400 });
  }

  const url =
    source === "agent0"
      ? gatewayUrl(
          process.env.GRAPH_AGENT0_SUBGRAPH_ID ?? AGENT0_BASE_SEPOLIA_ID,
          apiKey,
        )
      : warrantUrl(apiKey);
  if (!url) {
    return NextResponse.json(
      {
        error:
          "GRAPH_WARRANT_QUERY_URL is unset. Deploy subgraphs/mandate-registry to Studio.",
      },
      { status: 503 },
    );
  }

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      // Cloudflare 1010 without a browser-like UA on gateway.thegraph.com
      "user-agent": "warrant-dashboard/0.0.0",
    },
    body: JSON.stringify({ query }),
  });
  const json: unknown = await res.json().catch(() => ({ error: "bad gateway body" }));
  return NextResponse.json(json, { status: res.ok ? 200 : res.status });
}
