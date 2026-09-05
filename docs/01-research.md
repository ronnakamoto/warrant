# 01 — Research landscape (as of Sep 2, 2026)

This is the evidence base behind the idea. Sections: (A) the event itself, (B) what wins ETHGlobal hackathons lately, (C) the 2026 frontier in blockchain systems, (D) the 2026 frontier in applied cryptography, (E) the agent-economy stack the sponsors are pushing, (F) prior art we must not duplicate, (G) the gap.

---

## A. ETHOnline 2026 — the event

- **Dates:** Sep 4–16, 2026, fully online/async. **Submission deadline Sep 13, 12:00 EDT.** Demo video 2–4 min (720p+, human voice, no AI voiceover, no speed-up). ([Info & rules](https://ethglobal.com/events/ethonline2026/info/details))
- **Judging:** async first round screens to the top ~20%, then live 7-minute sessions (4 min demo + 3 min Q&A). Five criteria: **Technicality, Originality, Practicality, Usability (UI/UX/DX), WOW factor.** Partner prizes are judged separately and asynchronously; "the majority of prizes are paid out to projects that do not advance to live judging."
- **Rules that bite:** From-Scratch track — all project-specific code must start after kickoff (public libraries/starter kits fine). Must show real commit history ("no single-commit entries on the final day"). Must document where AI tools were used. Up to **3 partner prizes** per submission (a partner's multiple tracks count as one).
- **Sponsors and tracks** ([prize page](https://ethglobal.com/events/ethonline2026/prizes)):

| Sponsor | Pool | From-Scratch tracks that matter | Notes |
|---|---|---|---|
| The Graph | $15k | Composable/Standardized Graph products ($5k); AI tooling/use case with The Graph ($5k) | Must consume *live* Graph data; explicitly lists ERC-8004 subgraphs and x402 pay-per-query |
| Hedera | $15k | **AI & Agentic Payments on Hedera ($6k, 3×$2k)**; Tokenization ($6k); Hedera Harness OSS ($2k) | Requires a live x402-gated service settled via **Blocky402**; bonus for ERC-8004/HCS-14 identity, A2A/ACP, HCS audit trails |
| Arc (Circle) | $10k | DeFi ($1,667); Agentic Economy with Agent Stack ($1,667); Launch on Arc ($3.5k) | Nanopayments, Agent Wallets, Paymaster |
| World | $7k | **Selfie Check ($3.5k)** (From-Scratch); AgentKit ($3.5k) is *Continuity-only* | Wants a feedback document; sandbox app testing |
| 1inch | $7k | **Build an Aqua App ($5k)** | Custom SwapVM opcodes "scored higher"; on-chain execution required (fork OK) |
| ENS | $5k | **Best Use of ENSv2 ($4.5k)** | Sepolia beta; hierarchical registries, Enhanced Access Control, Permissioned Resolver; "bonus points if you bring AI agents — agents as namespaces" |
| Uniswap Foundation | $5k | Stack contribution ($3k) | v4 hooks, CCA, Permissioned Pools; FEEDBACK.md required |
| Ledger | $5k | TBA | — |
| Privy | $5k | B2B financial product ($2.5k); Best financial flow ($2.5k) | Policies, signers, key quorums, intents |
| Bazantic | $3k | Recipes / agentify an API ($1k each) | x402/MPP gateway |
| Chainlink | $2.5k | **Best Confidential Workflow ($2k)** | CRE confidential workflows (TEE, private beta) |

Observation: **7 of 11 sponsors are explicitly funding the agent economy** (x402, ERC-8004, AgentKit, Agent Stack, agents-as-ENS-namespaces, Graph-for-agents, Bazantic). Two are funding privacy/confidentiality (Chainlink CRE, World). The intersection — *private, accountable agents* — is where sponsor money and judge taste overlap.

## B. What has been winning ETHGlobal lately

- **ETHOnline 2025** (634 projects, 10 finalists): ChronoVault (ZK + TOTP wallet security), Monkey Bridge (PYUSD → virtual cards), SafeBet (lossless prediction market), Better Wallet (two-device security). Theme: **security + payments UX.**
- **ETHGlobal Cannes, Apr 2026** finalists: **ENShell** (blocks prompt-injection-driven agent transactions via an ENS-aware policy shell), **DIVE** (AI swarm oracle for prediction markets), **VEIL VPN** (TEE-proven no-logs VPN paid per use; won World ID 1st), **Corpus** (agent corps that run GTM/trading), npmguard, EVM PORST, etc. Arc track winners were all agent + nanopayment builds (PayMate, NanoCrawl, C.E.S.T.A). ([crypto.news recap](https://crypto.news/ai-agents-privacy-and-prediction-markets-define-ethglobal-cannes-2026-finalists/), [Arc recap](https://www.arc.io/blog/meet-the-arc-track-winners-from-ethglobal-cannes-hackathon-and-what-we-learned))
- **ETHGlobal Open Agents, May 2026** (180 projects): Tradewise Agentlab (x402-earning trading agent with reputation + compliance attestations), Keeper-Gate (framework-agnostic agent tooling), ZW.ARM (3-agent yield swarm). Notable: **AgentVault** (signed reasoning + bounded delegation "AgentSession": max size, slippage, allowed tokens, daily cap), **AgentRadar** (found ~17,500 of 32,000 ERC-8004 agents had empty profiles; one address registered 9,500 — the registry is spam-prone). ([KeeperHub wrap](https://keeperhub.com/blog/010-openagents-hackathon-wrap))
- **ETHGlobal Lisbon 2026**: **ArcBook** won 1inch Aqua 1st with a custom SwapVM instruction + Graph subgraph + MCP server.

Pattern: finalists in 2026 are **agent safety/accountability**, **verifiable truth**, and **privacy with a payment loop**. Pure DeFi mechanisms still win partner tracks but rarely the top 10 unless they carry a strong story.

## C. Blockchain systems — 2026 frontier

- **Ethereum roadmap.** Glamsterdam (ePBS EIP-7732, Block-Level Access Lists EIP-7928) targeted for Q4 2026; Hegotá (FOCIL EIP-7805, native account abstraction via Frame Transactions EIP-8141) after. The "Strawmap" projects 7 forks to 2029 with five north stars: fast L1, gigagas L1, teragas L2, post-quantum L1, **private L1**. ([ethereum.org](https://ethereum.org/roadmap/glamsterdam/), [Stengarl summary](https://stengarl.eth.limo/posts/mev-ethereum-protocol-roadmap-2026/))
- **Lean Ethereum** (Vitalik, Jul 2026): "biggest rebuild since the Merge" — hash-based signatures (leanXMSS), leanVM for recursive aggregation, recursive STARKs, quantum safety and privacy elevated to first-class goals. ([CoinDesk](https://www.coindesk.com/tech/2026/07/06/vitalik-buterin-says-ethereum-is-preparing-its-biggest-rebuild-since-the-merge), [Lean Consensus 2026 plan](https://hackmd.io/@tcoratger/ryS1ElrWbx))
- **Encrypted mempool.** EIP-8184 **LUCID** (Mar 2026): commit-before-reveal sealed transactions, scheme-agnostic because production-grade, post-quantum threshold encryption doesn't exist yet; critics note optionality problems remain. ([EIP-8184](https://eips.ethereum.org/EIPS/eip-8184), [ethresear.ch critique](https://ethresear.ch/t/a-criticism-of-lucid-and-encryption-scheme-agnostic-encrypted-mempool-designs/25210))
- **Real-time proving is done.** zkVMs prove 99% of mainnet blocks in <10 s; EF now targets 128-bit *provable* security and ≤300 KiB proofs (soundcalc). ([EF blog](https://blog.ethereum.org/2025/12/18/zkevm-security-foundations))
- **Agent standards on-chain.** ERC-8004 (Identity/Reputation/Validation registries) live on mainnet since Jan 2026; ~548k agents across 24 chains. Validation Registry supports TEE attestations and zkML proofs via pluggable validators. Reputation feedback can reference x402 payment proofs. ([agenteconomy.to](https://agenteconomy.to/erc-8004), [EIP-8004](https://eips.ethereum.org/EIPS/eip-8004))
- **ENSv2** beta on Sepolia: hierarchical registries, **Enhanced Access Control** (32 resource-scoped roles, each with an admin role — i.e., attenuable, delegable permission bitmaps), Permissioned Resolvers, record/namespace aliasing. ENSIP-25 binds names to ERC-8004 entries; ENSIP-26 defines `agent-context` / `agent-endpoint[]`; ENSIP-27 (May 2026) proposes `/.well-known/agent.json`. ([ENS blog](https://ens.domains/blog/post/ensv2-beta-public-testing), [EAC docs](https://ensdomains-contracts-v2.mintlify.app/access-control/enhanced-access-control), [ENSIP-25](https://ens.domains/blog/post/ensip-25))
- **Delegation frameworks.** ERC-7710/7715 (MetaMask Delegation Toolkit) ship **redelegation with caveats** — public, on-chain, enforced by caveat enforcers. Marketed for AI agents. ([MetaMask](https://docs.metamask.io/smart-accounts-kit/guides/advanced-permissions/create-redelegation/))
- **DeFi primitives.** 1inch **Aqua** (public launch Jul 28 2026): shared, self-custodial liquidity; strategies are SwapVM bytecode; `Extruction` opcode delegates pricing to an external contract. Uniswap **CCA** (continuous clearing auctions, with validation hooks and a ZK Passport module) and **Permissioned Pools** (Jul 23 2026, allowlist enforced in-hook). ([Aqua docs](https://business.1inch.com/portal/documentation/aqua/swapvm/swapvm-engine), [CCA](https://blog.uniswap.org/continuous-clearing-auctions), [Permissioned Pools](https://blog.uniswap.org/introducing-permissioned-pools-on-uniswap-v4))
- **Confidential compute goes mainstream.** Chainlink CRE Confidential Workflows (TEE handlers + Vault DON secrets; private beta); Phala dstack (TDX CVMs with compose-hash attestation; ERC-8004 + x402 agent wallets bound to compose-hash); EigenCloud (TEE + restaked slashing); Circle Gateway's batch settlement is itself TEE-signed. ([Chainlink](https://docs.chain.link/cre/concepts/confidential-workflows), [Phala](https://phala.com/solutions/ai-agents), [Circle](https://developers.circle.com/gateway/nanopayments/concepts/batched-settlement))

## D. Applied cryptography — 2026 frontier

- **FHE is no longer the bottleneck.** Zama hit 1,040 confidential ERC-7984 transfers/s on one 8×H100 node (TFHE-rs v1.7), a year ahead of plan; sparse-secret bootstrapping gives 4.5–7.5× speedups; BOLT-FHE reaches 40k bootstraps/s on an RTX 4090. ([Zama](https://www.zama.org/post/1000-tps-confidential-transfers-gpu-zama-protocol), [ePrint 2026/1730](https://eprint.iacr.org/2026/1730), [TCHES 2026](https://tches.iacr.org/index.php/TCHES/article/view/13089))
- **Obfuscation is "the final boss."** Vitalik's Jun 29 2026 post lays out the iO tower (ABE × FHE × GC × XiO × sFE) and the canonical *blockchain + obfuscated program* pattern: an `Obf(P)` with an internal keypair that accepts encrypted inputs plus a proof of chain consensus and signs outputs a contract verifies — "voting or any privacy-preserving financial/social app with no M-of-N committee." Still galactic runtimes; TEEs are today's stand-in for the same interface. ([vitalik.eth](https://vitalik.eth.link/general/2026/06/29/obfuscation1.html))
- **zkTLS crossed into production.** Reclaim (proxy, 2–4 s on mobile, 21k providers), Primus (QuickSilver MPC-TLS <1 s), TLSNotary 1.0 targeted H2 2026, vlayer, Opacity. Bottleneck is now data-source maintenance, not crypto. ([Stengarl](https://stengarl.eth.limo/posts/zktls-infrastructure/), [PSE mastermap](https://www.appliedzkp.org/mastermap/tlsnotary))
- **Anonymous credentials for agents — ACTA (PSE, May 2026).** A privacy layer above ERC-8004: credential anchoring, a policy registry (predicate hashes), a predicate verifier with a pluggable `ICircuitVerifier`, context-scoped nullifiers, a ZK reputation accumulator, and *personhood credentials* so an agent proves a real human is behind it. **Explicit open questions include:** "Privacy-preserving on-behalf-of (OBO) delegation … For recursive delegation — where an agent delegates to a sub-agent — what is the minimum predicate expressiveness needed to verify the entire chain without a trusted intermediary?" and "Private trust graphs for agent-to-agent interactions." PSE writes: "We are looking for proposals and submissions for protocol designs." ([ethresear.ch](https://ethresear.ch/t/anonymous-credentials-for-trustless-agents-acta/24797))
- **Semaphore v4 / Semaphore-Noir.** Group membership + nullifiers with EdDSA-Poseidon on Baby Jubjub and LeanIMT; Noir/UltraHonk verifiers deployed on Sepolia. Mature enough for a 12-day build. ([Semaphore v4 notes](https://hackmd.io/@vplasencia/B1sCrsoFkg), [Semaphore-Noir report](https://hashcloak.github.io/semaphore-noir-final-report/semaphore_noir.html))
- **Post-quantum** is now a roadmap item, not a paper: leanXMSS/leanMultisig, Falcon aggregation, EIP-8141 giving accounts a PQ signature path.

## E. The agent-economy stack sponsors are pushing

- **x402 v2** (Coinbase + Cloudflare; >100M payments in six months). Facilitators: Blocky402 (Hedera, open-source, `exact` scheme, fee-payer co-sign), Circle Gateway **Nanopayments** (gas-free USDC down to $0.000001, batched EIP-3009, live on 11 mainnets and Arc testnet). ([Blocky402](https://blocky402.com/docs/introduction/), [Circle](https://www.circle.com/blog/nanopayments-powered-by-circle-gateway-is-now-live-on-mainnet))
- **World AgentKit** (beta, with Coinbase): a World-ID-verified human registers an agent wallet in **AgentBook** (World Chain, gasless relay); an x402 server challenges the agent with CAIP-122, resolves an *anonymous human identifier*, and applies a policy (free tier, discount, rate limit). One human → many agents, all traceable to the same anonymous ID. Explicitly **does not constrain what the agent may do** — GitHub issue #12 (Agent Passport System) proposes scoped delegation on top, as a public JWT chain. ([AgentKit](https://github.com/worldcoin/agentkit), [issue #12](https://github.com/worldcoin/agentkit/issues/12))
- **Circle Agent Stack:** Agent Wallets (policy-bounded), Agent Marketplace, Circle CLI, Nanopayments, Skills.
- **Hedera:** x402 `exact` scheme for HBAR/HTS; HCS-14 Universal Agent IDs; HCS topics for audit trails; Scheduled Transactions for streaming/recurring pay.
- **Identity glue:** ERC-8004 ↔ ENSIP-25 ↔ ENSIP-26/27; The Graph hosts ERC-8004 ("Agent0") subgraphs.

## F. Prior art we must not rebuild

| Space | Already exists | Consequence |
|---|---|---|
| TEE dark pools / private strategies | Shell (Sui + Nitro), Darknyx (Solana + TDX), **Tacit (Chainlink CRE TEE OTC settlement)**, FXRP Dark RFQ (Flare TEE), Orcus (0G TEE trading agent) | "Enclave-signed private pricing" alone is not novel |
| Agent guardrails / policy shells | ENShell (Cannes finalist), AgentVault (bounded sessions, signed reasoning) | Public policy checks are table stakes |
| Agent discovery / identity | AgentRadar, ENS8004, ENSIP-25/26/27 | Don't build another registry/explorer |
| Public delegation chains | IETF AIP (Biscuit, Datalog attenuation), MetaMask ERC-7710 redelegation, APS proposal, UCAN/macaroons | Delegation *semantics* are solved; **privacy of the chain is not** |
| Human-backed agents | World AgentKit | Proves the root is human; says nothing about scope, budget, sub-agents, or revocation |
| x402 marketplaces | dozens (tollgate, Reckon402, DoorNo.402, Tradewise…) | Another "pay-per-call API + agent" will not stand out |

## G. The gap

Put E and F together:

1. Agents increasingly act *through other agents* (orchestrator → specialist → tool). Every practical framework wants attenuated, revocable, auditable delegation.
2. Every shipped solution publishes the delegation graph — on-chain (ERC-7710, ERC-8004 feedback events) or in-token (AIP/Biscuit, JWT chains). ACTA shows why that is an economic attack surface: "for a protocol whose edge is its execution strategy, that interaction graph is the alpha."
3. World AgentKit gives us a **large anonymity set of human-backed root keys** (AgentBook) but no delegation semantics.
4. Semaphore-class ZK gives us cheap **membership + nullifier** proofs; EdDSA-Poseidon makes **chains of signatures inside a circuit** cheap (~5k constraints per hop).
5. Recursive SNARK **delegatable anonymous credentials** now exist for EUDI-style JWTs (ePrint 2026/1855, received 2026-09-01). Pairing DACs with chainable revocation exist in the algebraic literature (DAAC-CR, IEEE TIFS 2025). Neither is an agent OBO credential rooted in World ID, bound to an x402 request, with a one-transaction cascade kill switch. PSE still asked for that combination in May 2026.

**Warrant** = a DAC for agents: anonymous, attenuated, revocable delegation chains, rooted in proof-of-personhood, presented as one ZK proof to x402 servers and smart contracts. Design follows in `02-design.md`.
