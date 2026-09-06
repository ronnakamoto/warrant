export type LeafLoader = () => Promise<string[]>;

const BINDINGS_QUERY = `{
  bindings(first: 200, orderBy: index, orderDirection: asc) {
    leaf
    index
  }
}`;

/** Ordered LeanIMT members from the Studio subgraph (insertion index). */
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
      body: JSON.stringify({ query: BINDINGS_QUERY }),
    });
    if (!res.ok) {
      throw new Error(`graph members HTTP ${res.status}`);
    }
    const json = (await res.json()) as {
      data?: { bindings?: Array<{ leaf: string }> };
      errors?: unknown;
    };
    const bindings = json.data?.bindings;
    if (!bindings || bindings.length === 0) {
      throw new Error("graph members: empty bindings");
    }
    return bindings.map((b) => b.leaf);
  };
}

export function mergeGuestLeaf(members: string[], guestLeaf: string): string[] {
  if (members.includes(guestLeaf)) return members;
  return [...members, guestLeaf];
}
