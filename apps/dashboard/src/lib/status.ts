export type TreeStatusKind = "empty" | "local-only" | "sync" | "drift";

export type TreeStatus = {
  kind: TreeStatusKind;
  title: string;
  detail: string;
};

export function shortRoot(value: string | undefined | null): string {
  const s = (value ?? "").trim();
  if (!s || s === "0" || s === "—") return "—";
  if (s.length <= 18) return s;
  return `${s.slice(0, 8)}…${s.slice(-6)}`;
}

export function shortWallet(addr: string | undefined | null): string {
  const s = (addr ?? "").trim();
  if (!s) return "—";
  if (s.length < 12) return s;
  return `${s.slice(0, 6)}…${s.slice(-4)}`;
}

export function logKindLabel(
  kind: "info" | "bound" | "revoked" | "error" | "loaded" | "checked",
): string {
  if (kind === "info") return "note";
  return kind;
}

export function rootsMatch(chainRoot: string, localRoot: string): boolean {
  const a = chainRoot.trim();
  const b = localRoot.trim();
  if (!a || a === "—" || !b || b === "0") return false;
  return a === b;
}

export function treeStatus(
  memberCount: number,
  chainRoot: string,
  localRoot: string,
): TreeStatus {
  if (memberCount === 0) {
    return {
      kind: "empty",
      title: "No one loaded yet",
      detail: "Load the live list from The Graph — then you can stop them.",
    };
  }
  if (!chainRoot || chainRoot === "—") {
    return {
      kind: "local-only",
      title: "List loaded — not checked on-chain",
      detail: "Confirm on Base Sepolia that these agents can still prove.",
    };
  }
  if (rootsMatch(chainRoot, localRoot)) {
    return {
      kind: "sync",
      title: "Live — agents can still prove",
      detail: `On-chain list ${shortRoot(localRoot)} matches what you loaded.`,
    };
  }
  return {
    kind: "drift",
    title: "This list doesn’t match the chain",
    detail: `On-chain ${shortRoot(chainRoot)} is different from what you loaded (${shortRoot(localRoot)}). Get a fresher copy from your agent app.`,
  };
}

export function friendlyError(raw: string): string {
  const msg = raw.trim();
  if (/JSON|Unexpected token|position \d+/i.test(msg)) {
    return "That file isn’t valid JSON. Use dashboard-mirror.json from your agent app.";
  }
  if (/Private key/i.test(msg)) {
    return "Enter the 0x key for the wallet that started this list. It stays in this browser.";
  }
  if (/No binding/i.test(msg)) {
    return "That key isn’t the wallet that created this list.";
  }
  if (/members\[\] required/i.test(msg)) {
    return "This file is missing the people you delegated to.";
  }
  if (/valid MandateRegistry/i.test(msg)) {
    return "Open Network settings and set the registry address first.";
  }
  if (/GRAPH_API_KEY/i.test(msg)) {
    return "Add a Subgraph Studio API key to .env (GRAPH_API_KEY).";
  }
  if (/GRAPH_WARRANT_QUERY_URL|GRAPH_WARRANT_SUBGRAPH_ID/i.test(msg)) {
    return "Deploy subgraphs/mandate-registry to Studio and set GRAPH_WARRANT_QUERY_URL.";
  }
  return msg;
}

export function formatLogTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
