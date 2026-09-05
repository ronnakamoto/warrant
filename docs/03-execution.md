# 03 — Execution: 12 days, 3 partner prizes, one 4-minute video

Use `docs/05-implementation-plan.md` for build order and `docs/06-kickoff.md` at hour 0. This file keeps the video script and judging self-check.

## 1. Partner-prize selection (max 3 partners)

| Pick | Track | Why Warrant fits | Must-haves from the rules |
|---|---|---|---|
| **World** | Selfie Check ($3.5k, From-Scratch) — *AgentKit ($3.5k) only if you enter as Continuity* | Selfie Check is Warrant's **tier-1 personhood root**; the proof carries the tier so services can price/limit by assurance ("risk, eligibility, fairness, abuse prevention" — verbatim track language). | Use the World ID **Sandbox App**; ship a **feedback document** on AgentKit/Selfie Check docs, Developer Portal, sandbox states and errors. |
| **ENS** | Best Use of ENSv2 ($4.5k) | Agents as namespaces in a **custom PermissionedRegistry**; scope bits ↔ **Enhanced Access Control roles**; Permissioned Resolver holds ENSIP-25/26 records; revocation unregisters subnames. The prize text literally asks for "agents as namespaces, each with their own identity and permissions." | Sepolia ENSv2 only; ENSv2 must be central, not cosmetic; live demo, no hard-coded values. |
| **Hedera** | AI & Agentic Payments on Hedera ($6k, up to 3×$2k) | The paid service consumed by the sub-agent is an **x402-gated endpoint on Hedera testnet settled via Blocky402**; HCS topic = privacy-preserving audit trail; ERC-8004/HCS-14 identity for the service. | Live x402 service through Blocky402; ≥1 real paid request end-to-end; README with architecture + payment flow; ≤5-min video. |

Alternates if a pick falls through: **Arc** (Agentic Economy with Agent Stack — swap Blocky402 for Circle Gateway Nanopayments on Arc testnet; `@circle-fin/x402-batching` supports `arcTestnet`), **The Graph** (AI use case — the dashboard reads ERC-8004 + Warrant subgraph live), **Chainlink** (run the proving/policy service as a CRE Confidential Workflow — only if you get private-beta access before day 3).

Also file **FEEDBACK.md**-style docs for every partner touched; partners weight feedback heavily and it costs an hour.

## 2. Team and split (3–4 people)

- **ZK lead** — circuit (circom+snarkjs first; Noir if ahead of schedule), trusted setup, verifier contract, `@warrant/core` prove/verify.
- **Contracts lead** — `MandateRegistry` (LeanIMT, epoch revocation, root history), `WarrantGate`, ERC-8004 validator, ENSv2 custom registry + EAC mapping on Sepolia, Hedera EVM mirror.
- **Agents/payments lead** — `@warrant/x402` middleware, `@warrant/agent` fetch wrapper + SKILL.md + CLI, Hedera translate service via Blocky402, HCS audit topic, two demo agents (orchestrator + sub-agent) using Claude tool-use.
- **Product lead** — dashboard (tree view, revoke, verifier log), video, README/architecture diagram, feedback documents, submission form.

Solo? Cut ENSv2 to a thin integration and skip the on-chain gate; keep circuit + middleware + Hedera + revocation demo. The core wow survives.

## 3. Day-by-day (Sep 4 → Sep 13 noon EDT)

| Day | Deliverable | Gate |
|---|---|---|
| **4 (Fri)** | Repo scaffold (pnpm monorepo: `circuits/`, `contracts/`, `packages/core|x402|agent`, `apps/dashboard`, `services/hedera-translate`). Circuit v0: 1-hop mandate + Merkle + nullifier passes tests. `MandateRegistry` skeleton + LeanIMT. | `snarkjs` proof verifies locally |
| **5** | Circuit v1: D=4 padded chain, attenuation constraints, requestHash binding. Groth16 setup, Solidity verifier generated. | Foundry test: valid chain passes, widened scope fails, stale epoch fails |
| **6** | `bindRoot` gated by AgentBook (World Chain read) + Selfie Check tier path via World ID Sandbox. `revoke` epoch bump. `@warrant/core` API stable. | Bind → prove → verify on Base Sepolia |
| **7** | `@warrant/x402` middleware with `warrant` 402 extension; policy DSL; nullifier store; fallthrough to x402 payment. Hedera `/translate` service behind Blocky402 testnet facilitator. | curl with warrant → free tier; without → 402 → paid HBAR settlement |
| **8** | `@warrant/agent`: fetch wrapper, CLI, SKILL.md. Two live agents: `orchestrator` delegates `translate` + $2 to `translator` sub-agent, which calls the Hedera service. HCS audit topic. **Commit + push daily from here on; partners check history.** | End-to-end: human → agent → sub-agent → paid call, server log shows only nullifier |
| **9** | ENSv2 Sepolia: custom PermissionedRegistry `agents.<demo>.eth`, EAC role bitmap ↔ scope bits, Permissioned Resolver, ENSIP-25 record to ERC-8004 id, ENSIP-26 endpoint. Revocation → `unregister`. | ENS Explorer shows the agent tree; revoke removes leaf |
| **10** | Dashboard: private tree, revoke button, verifier log, ENS + HCS links. ERC-8004 Validation Registry validator writes `warrant` responses. | Full demo path clickable |
| **11** | Hardening: root-history window, replay tests, rate-limit tests, error UX. Architecture diagram. README with payment-flow section (Hedera requirement). Feedback docs (World, ENS, Hedera). | Fresh-clone run-through by a teammate who didn't build it |
| **12** | Record video (see §4). Two takes. Cut waiting, never speed up. Final README pass. | Video 2:00–4:00, 720p+, human voice |
| **13 (Sun)** | Submit by **10:00 EDT** (two-hour buffer). Select Finalist + 3 partners. Attribute AI usage. | Submitted |

Stretch (only after Day 10 gate): Noir/Honk port; Uniswap CCA `IValidationHook` that requires a warrant to bid; Arc Nanopayments as second payment rail; Graph subgraph.

## 4. The 4-minute demo video (script)

**0:00–0:20 — Hook.** "Agents now hire agents. Every system that lets them publishes the org chart. Warrant lets a sub-agent prove it's acting for a real human, within scope and budget — and reveal nothing else."

**0:20–0:50 — Root.** Alice verifies with World ID (sandbox) and binds her root key. Show the AgentBook entry and the `MandateRegistry` leaf. "This tree of 1 is her anonymity set today; in production it's every AgentBook agent."

**0:50–1:30 — Delegate.** Terminal: `warrant delegate --to research-agent --scope fetch,translate,pay --budget 20 --ttl 24h`. The research agent (Claude) decides it needs a translation and runs `warrant delegate --to translator --scope translate --budget 2 --ttl 1h`. Show attenuation being enforced when it *tries* to grant `trade` (fails client-side and would fail in-circuit).

**1:30–2:20 — Prove and pay.** Translator calls the Hedera `/translate` endpoint. Server returns 402 with `warrant` + x402 requirements; agent proves (show ~1.5 s), first three calls free (per-human nullifier), fourth call settles HBAR through Blocky402. Split screen: **server log shows `nullifier=0x8f…, scope=translate, tier=2, paid=0.1 HBAR` — no name, no address, no chain.** HashScan tx + HCS message appear.

**2:20–2:50 — ENSv2.** ENS Explorer on Sepolia: `translator.research.alice-agents.eth` with EAC roles = its scope; ENSIP-25 link to its ERC-8004 id. "Transparency when you want it, the same permissions model either way."

**2:50–3:30 — Revoke.** Alice clicks **Revoke**. One tx bumps her epoch. All three agents' next calls fail. "The server never learned Alice existed, and it still enforced her decision."

**3:30–4:00 — Why it matters + what's next.** ACTA open problem answered; proof-system-agnostic; PQ-ready; ask: bind AgentBook natively. Team, links.

## 5. Judging rubric — self-check before submitting

- **Technicality:** Is the circuit real (repo has `.circom`/`.nr`, tests for negative cases, gas report)? Is revocation on-chain? Is payment real (HashScan link)?
- **Originality:** Does the README's first paragraph state the *unsolved* problem and cite ACTA? Is the comparison table (AIP, ERC-7710, AgentKit, APS) present?
- **Practicality:** Can a stranger run `pnpm demo` and reproduce the paid call? Is the middleware usable by any x402 server in <10 lines?
- **Usability:** Is the CLI three commands? Is the dashboard's revoke one click? Is there a SKILL.md so agents self-integrate?
- **WOW:** Does the video show the *nameless log* and the *live revocation*? Those two moments are the memory hooks.

## 6. What kills hackathon projects (avoid)

1. Single giant commit on the last day → disqualification risk. Push daily with meaningful messages.
2. Mocked data where partners demand live (Hedera: real Blocky402 settlement; ENS: no hard-coded values; Graph: live queries).
3. Video over 4:00, under 720p, AI voice, or sped up → automatic rejection.
4. Demoing the crypto instead of the *user* story. Lead with Alice, revoke at the end, keep the circuit to one slide.
5. Scope creep: Noir port, Uniswap hook, Graph subgraph are stretch. Ship the loop first: bind → delegate → prove → pay → revoke.
6. Forgetting the partner feedback docs — they're cheap and partners read them.
7. Not attributing AI tool usage (required by the rules).

## 7. Risks and mitigations

| Risk | Mitigation |
|---|---|
| World AgentKit beta access unavailable | Selfie Check via Sandbox as tier-1 root; keep an `AgentBookMock` adapter behind the same interface and disclose it |
| Blocky402 testnet hiccups | Circle Gateway Nanopayments on Arc/Base Sepolia as second rail via `@circle-fin/x402-batching`; the middleware is rail-agnostic |
| Circuit constraint blow-up | D=3 fallback; Merkle depth 16; drop `requestHash` signature to a hash-binding of `leafPk` if needed |
| ENSv2 Sepolia redeploys (they happened in May) | Pin deployment addresses in `deployments/` and re-run a `phase` script on day 9 |
| Trusted-setup questions in Q&A | Prepare the one-line answer: "Groth16 with a disclosed local ceremony for the hackathon; ACTA's `ICircuitVerifier` abstraction lets us swap to Honk or a PQ backend without touching contracts" |
