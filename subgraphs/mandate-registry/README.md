# MandateRegistry subgraph (Base Sepolia)

Indexes `Bound` / `Revoked` on [`0x103749E5529c3Ce31A1EB8e0657280AaE7e9dA89`](https://sepolia.basescan.org/address/0x103749E5529c3Ce31A1EB8e0657280AaE7e9dA89) from block `46413332`.

This is a **Subgraph Studio** deployment. Querying it live (plus the public [Agent0 / ERC-8004 subgraph on Base Sepolia](https://thegraph.com/explorer/subgraphs/4yYAvQLFjBhBtdRCY7eUWo181VNoTSLLFd5M7FXQAi6u)) is how the dashboard and CLI read the registry — not a static JSON dump.

## Deploy

The Studio **query API key** (`GRAPH_API_KEY`) cannot deploy. You need a **deploy key** from the subgraph page.

1. Create a subgraph named `warrant-mandate-registry` (Base Sepolia) in [Subgraph Studio](https://thegraph.com/studio).
2. Copy **Deploy key** from that page (not the API key).
3. From this directory:

```bash
npm install
npx graph codegen
npx graph build
npx graph deploy warrant-mandate-registry \
  --version-label 0.0.1 \
  --deploy-key <DEPLOY_KEY> \
  --node https://api.studio.thegraph.com/deploy/
```

4. Put the printed **Studio query URL** and a Studio **query API key** in the repo `.env`:

```text
GRAPH_API_KEY=
GRAPH_WARRANT_QUERY_URL=https://api.studio.thegraph.com/query/<user>/warrant-mandate-registry/version/latest
# Agent0 Base Sepolia (standardized ERC-8004 schema)
GRAPH_AGENT0_SUBGRAPH_ID=4yYAvQLFjBhBtdRCY7eUWo181VNoTSLLFd5M7FXQAi6u
```

Gateway URL shape (same as Studio / Explorer):

`https://gateway.thegraph.com/api/<API_KEY>/subgraphs/id/<SUBGRAPH_ID>`
