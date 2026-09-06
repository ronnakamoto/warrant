# Feedback — The Graph (Subgraph Studio + Agent0)

Warrant’s dashboard and CLI read **MandateRegistry** from a Studio subgraph on Base Sepolia, and compose that with the public **Agent0 / ERC-8004 standardized subgraph** on the same chain (`4yYAvQLFjBhBtdRCY7eUWo181VNoTSLLFd5M7FXQAi6u`). Queries go through `gateway.thegraph.com` with a Studio API key — not mocks.

## What we pinned

- Custom subgraph: `subgraphs/mandate-registry` (`Bound` / `Revoked`, start block `46413332`).
- Standardized schema: Agent0 Base Sepolia (same GraphQL on every Agent0 network).
- Load-bearing use: dashboard list + revoke history; `warrant graph-status` for `currentRoot` before fetch.
- Subgraph MCP is documented in `packages/agent/SKILL.md` so Cursor can query the same IDs.

## Friction

1. **Studio deploy key vs query API key** — easy to swap; one sentence in Studio “use this key in the gateway URL” would help.
2. **Gateway URL shapes** — `/api/<KEY>/subgraphs/id/<ID>` vs header auth both appear in docs; we used the path form from the Agent0 guide.
3. **Testnet subgraphs on the decentralized network** — Studio is the workable path for a hackathon-sized contract; saying that on the prize page would cut an hour of “do I need to signal?”

## Wishlist

- A one-click “index this verified Base Sepolia address” from Studio given ABI + start block.
- Agent0 query examples that join on `owner` (we join off-chain to MandateRegistry wallets).
