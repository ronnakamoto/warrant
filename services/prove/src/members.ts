export type LeafLoader = () => Promise<string[]>;

const FOREST_QUERY = `{
  forestLeaves(first: 1000, orderBy: index, orderDirection: asc) {
    leaf
    index
  }
}`;

const BINDINGS_QUERY = `{
  bindings(first: 200, orderBy: index, orderDirection: asc) {
    leaf
    index
  }
}`;

/** Ordered LeanIMT members from the Studio subgraph (insertion index, including 0 tombstones). */
export function createGraphLeafLoader(opts: {
  queryUrl: string;
  apiKey?: string;
  fetchImpl?: typeof fetch;
}): LeafLoader {
  const fetchImpl = opts.fetchImpl ?? fetch;
  return async () => {
    const res = await fetchImpl(opts.queryUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "user-agent": "warrant-prove/0.0.0",
        ...(opts.apiKey ? { authorization: `Bearer ${opts.apiKey}` } : {}),
      },
      body: JSON.stringify({ query: FOREST_QUERY }),
    });
    if (!res.ok) {
      throw new Error(`graph members HTTP ${res.status}`);
    }
    const json = (await res.json()) as {
      data?: { forestLeaves?: Array<{ leaf: string }> };
      errors?: unknown;
    };
    const forest = json.data?.forestLeaves;
    if (forest && forest.length > 0) {
      return forest.map((row) => row.leaf);
    }
    const fallback = await fetchImpl(opts.queryUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "user-agent": "warrant-prove/0.0.0",
        ...(opts.apiKey ? { authorization: `Bearer ${opts.apiKey}` } : {}),
      },
      body: JSON.stringify({ query: BINDINGS_QUERY }),
    });
    if (!fallback.ok) {
      throw new Error(`graph members HTTP ${fallback.status}`);
    }
    const fallbackJson = (await fallback.json()) as {
      data?: { bindings?: Array<{ leaf: string }> };
    };
    const bindings = fallbackJson.data?.bindings;
    if (!bindings || bindings.length === 0) {
      throw new Error("graph members: empty forest");
    }
    return bindings.map((b) => b.leaf);
  };
}

export function mergeForestLeaves(members: string[], extra: readonly string[]): string[] {
  const out = [...members];
  for (const leaf of extra) {
    if (leaf && !out.includes(leaf)) out.push(leaf);
  }
  return out;
}

export function mergeGuestLeaf(members: string[], guestLeaf: string): string[] {
  return mergeForestLeaves(members, [guestLeaf]);
}
