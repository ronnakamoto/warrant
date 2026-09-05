# 04 — Alternatives considered

Both of these are strong enough to build; they ranked below Warrant on originality (prior art exists) or on judge appeal. Keep them as pivots if Warrant's dependency on World ID access becomes a blocker on day 2–3.

## B1. "Dark Aqua" — confidential market-making strategies on 1inch Aqua

**Idea.** A maker's pricing logic runs inside a TEE (Chainlink CRE Confidential Workflow, or Phala dstack) with private signals and secret API keys. The enclave publishes short-lived, nonce'd, signed quotes. A new **SwapVM opcode** (`VerifyAttestedQuote`, registered on a redeployed `AquaSwapVMRouter`) — or a Path-C `Extruction` target — verifies the enclave signature + an on-chain attestation registry (enclave measurement → key) and fills against the maker's Aqua virtual balances. Strategy stays secret; liquidity stays shared and self-custodial.

**Why it's attractive.** 1inch's $5k track explicitly scores custom opcodes higher; Chainlink's $2k Confidential Workflow track fits exactly; the on-chain market-maker "alpha leakage" problem is real; Vitalik's "Obf(P) signs, contract verifies" framing gives it a research story.

**Why it ranked second.** TEE-signed private trading already exists in five hackathon/prod repos (Tacit — on CRE itself, Shell, Darknyx, FXRP Dark RFQ, Orcus). Judges who saw Cannes/Lisbon will pattern-match it to RFQ-with-a-TEE. It is also DeFi-mechanism heavy, which in 2026 has been winning partner tracks more than the top 10.

**If built:** lead with the *taker* UX (quotes you can't get picked off on) and the *opcode* (the novel engineering), and spend the video's wow moment on a public XYC strategy being arbitraged next to a dark one that isn't.

## B2. "Pay-on-Proof" — x402 with cryptographic delivery and objective reputation

**Idea.** x402 is pay-first with no recourse. Add an escrow mode: the buyer's payment authorization (Nanopayments EIP-3009 or Blocky402 `exact`) is held by a facilitator; the seller must return a **proof of delivery** — a zkTLS proof (Reclaim/Primus) that the upstream API returned what the seller claims, or a TEE attestation of the compute — before settlement. Every settled/failed job is written to the **ERC-8004 Validation Registry** by a validator contract, turning agent reputation from subjective feedback into proven outcomes; The Graph indexes it.

**Why it's attractive.** Practical and immediately useful; touches Hedera/Arc/Graph/Bazantic; "objective reputation for agents" is a clean story; zkTLS is hot and production-ready.

**Why it ranked third.** x402 is the most-hackathoned primitive of 2026; "x402 + escrow" and "x402 + zkTLS" have both appeared in Open Agents honorable mentions. Also, it changes x402's synchronous flow, which sponsors may resist.

## B3. Others briefly considered

- **Sealed agent auctions (LUCID-style commit-before-reveal for agent job markets).** Interesting but needs a decryption committee or TEE; weaker product story.
- **FHE-private ERC-8004 reputation aggregation (Zama fhevm).** Novel, but Zama isn't a sponsor and ACTA's ZK accumulator already covers it more cheaply.
- **Post-quantum agent wallets via EIP-8141 frames.** Hegotá isn't live; would be a spec demo, not a product.
- **ZK allowlists for Uniswap Permissioned Pools / CCA.** Aztec's ZK Passport module in CCA is direct prior art.

## Adjacent: Pricing Plane Protocol (do not merge)

Ron, *The Pricing Plane Protocol* (2026-07-09 working draft). Cross-layer paid HTTP: streams → short-lived request-bound leases → billing receipts. Four primitives (PBL, MRPP, CPC, Inert Stream). x402 scheme id `evm-stream-lease-v1`. MVP receipts are **provider-signed EIP-712**; the Groth16-wrapped zkVM receipt is **specified V2, not implemented**. `AgentAuthorization` binds OIDC to public ERC-7710 spend — not private recursive OBO.

PPP and Warrant sit on **different planes**. PPP is *how money and price attach to HTTP*. Warrant is *private recursive who-may-call*. Composing them is a later product story, not a 12-day scope change.

**Do not steal for ETHOnline:** inert streams / Superfluid / Sablier; MRPP pricing functions and CPC lattices; replacing Blocky402 `exact` with `evm-stream-lease-v1`; building PPP's unbenchmarked V2 zkVM receipt (would fight pot16 and the frozen 8-tuple). That is B2 (Pay-on-Proof) ranked below Warrant: x402+escrow is already hackathoned, and it splits originality away from ACTA's open problem.

**Already in Warrant, same shape:** request-bound capability. Spike 16 `requestHash` is our lease binding. PPP's `deliveryId` is a *payment* replay nullifier (May 2026 x402 duplicate-settlement papers). Optional later: consume `(nullifier, requestHash)` together — never a 9th public.

**Steal only the honesty:** MVP receipts are signed by the least-trusted party. Stay equally explicit: Groth16 ceremony, anonymity set = bound roots, mid-tree revoke is v2, budgets are ceilings not global ledgers.

## Decision

Warrant wins on the criteria that matter most for a finalist slot: it is the only candidate for which a named research group has publicly said "this is unsolved, send us designs," while still being buildable in 12 days with off-the-shelf ZK tooling and demoable through live payments.
