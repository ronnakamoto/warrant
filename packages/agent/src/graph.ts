import { AGENT0_BASE_SEPOLIA_ID } from "./graph-ids.js";

export { AGENT0_BASE_SEPOLIA_ID } from "./graph-ids.js";

export const WARRANT_STATUS_QUERY = `{
  registry(id: "1") { currentRoot size updatedAt }
  bindings(first: 50, orderBy: index, orderDirection: asc) {
    wallet
    leaf
    tier
    epoch
    revokedOnce
  }
}`;

export const AGENT0_X402_QUERY = `{
  agentRegistrationFiles(where: { x402Support: true, active: true }, first: 10) {
    agentId
    name
    x402Support
  }
}`;

export type GraphStatus = {
  currentRoot: string | null;
  size: string | null;
  bindings: number;
  agent0X402: number;
};

function gatewayUrl(subgraphId: string, apiKey: string): string {
  return `https://gateway.thegraph.com/api/${apiKey}/subgraphs/id/${subgraphId}`;
}

function resolveUrl(target: string, apiKey: string | undefined): string {
  if (target.startsWith("http")) return target;
  if (!apiKey) throw new Error("GRAPH_API_KEY is unset (Subgraph Studio)");
  return gatewayUrl(target, apiKey);
}

export async function querySubgraph(
  target: string,
  query: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<unknown> {
  const url = resolveUrl(target, env.GRAPH_API_KEY);
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "user-agent": "warrant-agent/0.0.0",
    },
    body: JSON.stringify({ query }),
  });
  const json = (await res.json()) as { data?: unknown; errors?: unknown };
  if (!res.ok || json.errors) {
    throw new Error(`subgraph ${target}: ${JSON.stringify(json.errors ?? res.status)}`);
  }
  return json.data;
}

export async function loadGraphStatus(env: NodeJS.ProcessEnv = process.env): Promise<GraphStatus> {
  const warrantTarget = env.GRAPH_WARRANT_QUERY_URL ?? env.GRAPH_WARRANT_SUBGRAPH_ID;
  if (!warrantTarget) throw new Error("GRAPH_WARRANT_QUERY_URL is unset");
  const agent0Id = env.GRAPH_AGENT0_SUBGRAPH_ID ?? AGENT0_BASE_SEPOLIA_ID;

  const [warrant, agent0] = await Promise.all([
    querySubgraph(warrantTarget, WARRANT_STATUS_QUERY, env) as Promise<{
      registry?: { currentRoot?: string; size?: string };
      bindings?: unknown[];
    }>,
    querySubgraph(agent0Id, AGENT0_X402_QUERY, env) as Promise<{
      agentRegistrationFiles?: unknown[];
    }>,
  ]);

  return {
    currentRoot: warrant.registry?.currentRoot ?? null,
    size: warrant.registry?.size ?? null,
    bindings: warrant.bindings?.length ?? 0,
    agent0X402: agent0.agentRegistrationFiles?.length ?? 0,
  };
}
