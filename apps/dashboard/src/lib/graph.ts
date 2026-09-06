import type { BindingRow } from "./mirror.js";

export const AGENT0_BASE_SEPOLIA_ID = "4yYAvQLFjBhBtdRCY7eUWo181VNoTSLLFd5M7FXQAi6u";

export const WARRANT_MIRROR_QUERY = `{
  registry(id: "1") { currentRoot size updatedAt }
  bindings(first: 200, orderBy: index, orderDirection: asc) {
    id
    wallet
    leaf
    tier
    epoch
    index
    revokedOnce
  }
  revokeEvents(first: 20, orderBy: timestamp, orderDirection: desc) {
    id
    wallet
    epoch
    root
    timestamp
    txHash
  }
}`;

export const AGENT0_RECENT_QUERY = `{
  agents(first: 50, orderBy: createdAt, orderDirection: desc) {
    id
    owner
    registrationFile { name x402Support }
  }
}`;

export type WarrantBindingNode = {
  id: string;
  wallet: string;
  leaf: string;
  tier: number;
  epoch: number;
  index: string;
  revokedOnce: boolean;
};

export type WarrantRevokeNode = {
  id: string;
  wallet: string;
  epoch: number;
  root: string;
  timestamp: string;
  txHash: string;
};

export type WarrantGraphData = {
  registry: { currentRoot: string; size: string; updatedAt: string } | null;
  bindings: WarrantBindingNode[];
  revokeEvents: WarrantRevokeNode[];
};

export type Agent0Node = {
  id: string;
  owner: string;
  registrationFile?: { name?: string | null; x402Support?: boolean | null } | null;
};

export type Agent0GraphData = {
  agents: Agent0Node[];
};

export function rowFromOnchain(
  wallet: string,
  row: { pkX: bigint; pkY: bigint; tier: number; epoch: number },
): BindingRow {
  return {
    wallet: normalizeAddr(wallet),
    pkX: row.pkX.toString(),
    pkY: row.pkY.toString(),
    tier: row.tier,
    epoch: row.epoch,
  };
}

export function walletsFromWarrantData(data: WarrantGraphData): string[] {
  return (data.bindings ?? []).map((b) => normalizeAddr(b.wallet));
}

export function expectedLeafByWallet(data: WarrantGraphData): Map<string, string> {
  const map = new Map<string, string>();
  for (const b of data.bindings ?? []) {
    map.set(normalizeAddr(b.wallet), String(b.leaf));
  }
  return map;
}

export function agent0ByOwner(agents: Agent0Node[]): Map<string, Agent0Node> {
  const map = new Map<string, Agent0Node>();
  for (const a of agents ?? []) {
    if (!a.owner) continue;
    map.set(normalizeAddr(a.owner), a);
  }
  return map;
}

export function countAgent0Overlap(bindings: BindingRow[], agents: Agent0Node[]): number {
  const byOwner = agent0ByOwner(agents);
  let n = 0;
  for (const b of bindings) {
    if (byOwner.has(normalizeAddr(b.wallet))) n += 1;
  }
  return n;
}

function normalizeAddr(value: string): string {
  const hex = value.startsWith("0x") ? value : `0x${value}`;
  return hex.toLowerCase();
}
