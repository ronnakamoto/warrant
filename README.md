# Warrant

Zero-knowledge chains of custody for AI agents.

A human delegates authority to an agent; that agent may delegate a narrower mandate to a sub-agent. The leaf agent proves to an API, contract, or peer that it acts under a real, unique human — within scope, within budget, and not revoked — without revealing who the human is or which agents sit in the chain. Verification is a constant-size proof, checked by an `x402` server or on-chain. Revoking the root invalidates the entire tree.

Existing agent-delegation systems (IETF AIP/Biscuit, MetaMask ERC-7710, World AgentKit, Agent Passport) expose the chain. PSE’s May 2026 *ACTA* proposal lists privacy-preserving recursive delegation as an open problem. Warrant addresses that gap with Semaphore-class ZK (EdDSA-Poseidon over Baby Jubjub, Groth16/Honk), World ID AgentBook roots, ENSv2 indexing, and x402 settlement.

## Documentation

| Document | Description |
|---|---|
| [`docs/01-research.md`](docs/01-research.md) | Landscape: systems and cryptography developments in 2025–26, prior art, and the gap Warrant targets. |
| [`docs/02-design.md`](docs/02-design.md) | Design: threat model, data structures, ZK circuit, contracts, x402 middleware, SDK, and integrations. |
| [`docs/03-execution.md`](docs/03-execution.md) | Demo outline and evaluation criteria. Build order lives in `docs/05`. |
| [`docs/04-alternatives.md`](docs/04-alternatives.md) | Alternatives considered and why Warrant was chosen. |
| [`docs/05-implementation-plan.md`](docs/05-implementation-plan.md) | Implementation plan: work packages, gates, constraint budget, and spike-backed decisions. |
| [`docs/06-kickoff.md`](docs/06-kickoff.md) | Kickoff checklist: circuit constraints, partner tracks, and delivery constraints. |
| [`docs/07-architecture.md`](docs/07-architecture.md) | Software architecture: package boundaries, patterns, and coding standards. |

## Properties

- **Authorization, not identity** — Verifiers learn that a mandate is valid under a personhood-rooted tree; they do not learn the human or intermediate agents.
- **Attenuation** — Each hop can only narrow scope, budget, and TTL.
- **Cascade revocation** — Killing the root immediately invalidates every descendant mandate.
- **Practical integration** — Drop-in x402 middleware, a CLI for agent frameworks, and testnet contracts with Blocky402 (Hedera) or Circle Gateway payments.

Example developer surface:

```bash
warrant delegate --scope translate --budget 2 --ttl 1h --to <sub-agent>
```

## Status

Research and design are complete, with closed spike evidence (16 spikes) and an architecture plan in [`docs/07-architecture.md`](docs/07-architecture.md). Implementation follows [`docs/05-implementation-plan.md`](docs/05-implementation-plan.md).
