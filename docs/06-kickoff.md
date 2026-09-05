# 06 — Kickoff checklist (Sep 4, hour 0)

ETHOnline 2026 hacking starts **Friday Sep 4**. Submission **Sunday Sep 13, 12:00 EDT**. This repo is research: design + spikes. **Do not copy spike JS into the product.** Copy the *measurements and API shapes*, then write new code.

From-Scratch rule: no project-specific product code before kickoff. After kickoff, every WP gate is a commit.

## Before you open the laptop

- [ ] ETHGlobal account + team created; event check-in done
- [ ] Discord: ETHGlobal, World, ENS, Hedera, PSE
- [ ] World Developer Portal sandbox app (Selfie Check track). If this is blocked, ship `tier=0` *and* keep the AgentBook path in code — do not fake a World ID
- [x] Hedera testnet ECDSA account `0.0.10311260` (~998 HBAR). Key in gitignored `.env`. Research HCS topic `0.0.10336558`. Live Blocky402 settle: 1000 tinybars to `0.0.98` (tx `0.0.7162784@1788502420.541125170`).
- [x] One Base Sepolia wallet with test ETH (for `MandateRegistry`) — see `deployments/base-sepolia.json`
- [ ] One Ethereum Sepolia wallet with test ETH (ENS WP8 only — skipped solo)
- [ ] `circom` 2.2.x and Foundry on PATH (`foundryup`, then `~/.local/bin` / `~/.foundry/bin`)
- [ ] Re-read `docs/05-implementation-plan.md` §5 work packages — that file is the source of truth for *order*, not `docs/03-execution.md`
- [ ] Re-read `docs/07-architecture.md` — that file is the source of truth for *structure*, SOLID, and what not to write

## Hour 0–2 (WP0)

1. `pnpm init` workspace matching `docs/07-architecture.md` §2: `circuits/`, `contracts/`, `packages/core`, `packages/x402`, `packages/agent`, `apps/dashboard`, `services/translate`, `deployments/`, `scripts/check-boundaries.mjs`.
2. Foundry `forge init` in `contracts/`. solc **0.8.28** (spike verifier compiled).
3. `.env.example` with the RPCs pinned in the plan (World Chain Alchemy public, Base Sepolia, Sepolia, Blocky402 testnet, Hedera mirror, AgentBook address).
4. First commit: scaffold only. Message like `WP0: monorepo scaffold`.

**Gate:** `forge build` and `circom --version` in a clean shell.

## Circuit rules (from spikes — print this next to the ZK lead)

- Public inputs stay **exactly 8**: `merkleRoot, contextHash, nullifier, effectiveScope, effectiveBudgetCap, minExpiry, tier, requestHash`. A 9th regenerates the Solidity verifier.
- Membership is **`BinaryMerkleRoot` from `@zk-kit/binary-merkle-root.circom` ≥ 2.0.0** (single `index` + `Num2Bits`). Do **not** reuse `spikes/zk/circuits/warrant_core.circom`'s full-binary `MerklePoseidon`. v1.x of that template was under-constrained (PSE, Jul 2025).
- Pad LeanIMT siblings with `0` to `MAX_DEPTH`. Pass `depth = proof.siblings.length`.
- Never write `a <== (1-i)*x + i*y` (two muls → `error[T3001]`). Split signals or `Mux1`.
- `"type": "module"` in package.json breaks circom's CJS `generate_witness.js`. Use `snarkjs wtns calculate`.
- Dummy hops: `enabled=0` **and** `EdDSAPoseidonVerifier.enabled=0`, but Ax/Ay/R8 must be **real Baby Jubjub points** (reuse an Identity). Zeros fail because curve ops are not gated.
- Full reference circuit: `spikes/zk/circuits/warrant_full.circom` — **56,794** constraints, prove **2.2 s**. zkey **27.9 MB** → `download-zkey.sh`, never git.
- Free-tier x402: `{ grantAccess: true }` on `onProtectedRequest`, matching AgentKit. Not `onBeforeVerify { skip: true }`.
- `requestHash = keccak256(method|path|nonce|merkleRoot|amount|payTo|bodyHash) mod r`. Demo revoke checks `merkleRoot == currentRoot` (not the 1h history window).
- Pin `@zk-kit/binary-merkle-root.circom@2.0.0` (or newer 2.x). Re-run `spikes/ens/ensv2.mjs` on day 9 — they redeploy.

## Partner submissions (max 3)

World **Selfie Check** (From-Scratch) + ENS **ENSv2** + Hedera **Agentic Payments**. AgentKit prize is Continuity-only — do not enter it.

Write `FEEDBACK_WORLD.md`, `FEEDBACK_ENS.md`, `FEEDBACK_HEDERA.md` as you hit snags, not on day 12.

## Video (do not improvise)

Script is `docs/03-execution.md` §4; solo shot list is `docs/08-demo-runbook.md`. 2–4 min, ≥720p, **human voice**, no AI voiceover, no speed-up. Two takes on Sep 12. Submit **before 10:00 EDT Sep 13**. Attribute AI in `AI_USAGE.md`.
