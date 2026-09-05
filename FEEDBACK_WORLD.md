# Feedback — World (Selfie Check / AgentBook)

Warrant treats World ID / AgentBook as the **personhood root** for production-shaped binds. Solo demo path uses documented **`tier=0`** when Sandbox / AgentKit access is blocked, while keeping the AgentBook read adapter in code.

## What we pinned

- World Chain `480` public RPC + AgentBook address in `.env.example` (`AGENTBOOK_ADDRESS`).
- On-chain `MandateRegistry` **never** checks personhood; PoP/AgentBook stay off-chain before `bindRoot` (operator mode).

## Friction

1. **Selfie Check / Sandbox access** — From-Scratch track depends on Developer Portal sandbox states that were not available for the full bind path in this build window. Shipping `tier=0` + disclosing it is workable, but docs should state clearly which sandbox errors mean “retry later” vs “wrong app config.”
2. **AgentBook as anonymity set** — Product story assumes the live AgentBook set; for a hackathon demo the set is often size 1. A short “demo vs production anonymity set” callout in World docs would prevent over-claiming.
3. **Continuity vs From-Scratch** — AgentKit Continuity prize vs Selfie Check From-Scratch split is easy to mis-enter; a decision tree on the track page would help.

## What we did instead

- Operator-gated `bindRoot` with off-chain policy hooks.
- Permissionless self-bind **tier=0 only** for local/anvil tests (not for public mempools — PK squatting).
- Nullifier tags (`humanTag`, `contextHash`) minted per root at bind time — not a shared demo constant.

## Wishlist

- Stable Sandbox App deep-link + example “tier attestation → off-chain allowlist → bind tx” for agent frameworks.
- Public read API shape for AgentBook membership checks that matches a single `IPersonhood.lookupHuman(wallet)` port.
