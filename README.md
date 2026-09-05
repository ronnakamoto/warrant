# Warrant — zero-knowledge chains of custody for AI agents

Research and a hackathon-ready design for **ETHOnline 2026** (ETHGlobal, Sep 4–16 2026, submissions due Sep 13 12:00 EDT).

> **One-line pitch:** A human delegates authority to an agent, the agent delegates a narrower slice to a sub-agent, and the sub-agent proves to any API, contract, or other agent that *it acts under a real, unique human, within scope, within budget, not revoked* — while revealing **nothing** about who the human is or which agents sit in between. One constant-size proof, verified by an `x402` server in milliseconds or by a smart contract on-chain. Revoke the root and the whole tree dies instantly.

Nobody has shipped this. Every existing agent-delegation system (IETF AIP/Biscuit, MetaMask ERC-7710 redelegation, World AgentKit, the Agent Passport proposal) publishes the chain. PSE's May 2026 *ACTA* proposal names "privacy-preserving recursive delegation" as an **open problem** and asks for submissions. Warrant is the answer, built on Semaphore-class ZK (EdDSA-Poseidon over Baby Jubjub, Groth16/Honk), rooted in World ID's AgentBook, indexed in ENSv2, paid through x402.

## Contents

| File | What it is |
|---|---|
| [`docs/01-research.md`](docs/01-research.md) | Deep-research landscape: what changed in blockchain systems and cryptography in 2025–26, what ETHGlobal judges and sponsors reward, and what has already been built (so we don't rebuild it). Every claim linked. |
| [`docs/02-design.md`](docs/02-design.md) | The idea in full: threat model, data structures, ZK circuit, contracts, x402 middleware, agent SDK, ENSv2 and Hedera integrations, and the honest limitations. |
| [`docs/03-execution.md`](docs/03-execution.md) | Original 12-day sketch (demo script, judging rubric). **Use `docs/05-implementation-plan.md` for build order.** |
| [`docs/04-alternatives.md`](docs/04-alternatives.md) | Two strong backup ideas ("Dark Aqua" and "Pay-on-Proof x402") and why they ranked below Warrant. |
| [`docs/05-implementation-plan.md`](docs/05-implementation-plan.md) | **The plan to execute.** Work packages, gates, constraint budget, and pinned addresses — all backed by live spikes in `spikes/`. |
| [`docs/06-kickoff.md`](docs/06-kickoff.md) | Hour-0 checklist for Friday Sep 4. Circuit rules, partner tracks, video constraints. |
| [`docs/07-architecture.md`](docs/07-architecture.md) | **How to write the product code.** Package boundaries, SOLID, the patterns we will use, and the smells we will refuse. WP0 follows this. |

## Why this can win (and the honest caveat)

ETHGlobal judges score **Technicality, Originality, Practicality, Usability, WOW**. Warrant is designed against each:

- **Technicality** — a real ZK circuit over a chain of signatures + Merkle membership + context nullifiers + on-chain cascade revocation, wired into a live payment protocol and live agents.
- **Originality** — first implementation of an explicitly open research problem (ACTA §"Open Questions"), not a re-skin of x402 or another agent marketplace.
- **Practicality** — drop-in middleware for any x402 server, a CLI any agent framework can call, testnet contracts, real payments through Blocky402 (Hedera) or Circle Gateway.
- **Usability** — `warrant delegate --scope translate --budget 2 --ttl 1h --to <sub-agent>` is the whole developer experience; the dashboard is a tree with a red "Revoke" button.
- **WOW** — live on stage: revoke the human's root, watch three running sub-agents get 401'd on their next call, then show the server log that never contained a name, an address, or a tree.

No idea wins with "101% certainty" — roughly 600 teams enter and ~10 become finalists. What this document gives you is the highest-leverage position we could find: a genuinely new mechanism, at the intersection of the two loudest 2026 narratives (agents and privacy), aligned with three of the richest sponsor tracks, and small enough to *finish*. Execution — a working demo, clean commit history, a crisp video — is the rest of the probability.

## Status

Research, design, **closed spike evidence** (16 spikes), and a **software-architecture plan** (`docs/07-architecture.md`). Product code starts Sep 4. Build order: `docs/05`. Code shape: `docs/07`.
