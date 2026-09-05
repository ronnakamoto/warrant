# 05 — Implementation plan

This is the build plan for Warrant product code. Every numeric claim and API shape below was measured against live networks and real packages (2026-09-02–04). Evidence: `spikes/*/results.json`. Architecture law (patterns, SOLID, smells): [`docs/07-architecture.md`](07-architecture.md). Design: [`docs/02-design.md`](02-design.md).

**Rule:** do not start the next work package until the current gate is green. Each gate is a command or observable outcome that can fail.

---

## 1. Principles

1. **One composition root per process.** CLI, Hono, and the dashboard never reimplement prove, verify, or challenge hashing.
2. **Crypto behind ports.** Swapping Groth16 for Honk is a new `IVerifier` / `IProver` adapter — not a rewrite of x402.
3. **Generated artifacts are frozen.** Circom outputs and `WarrantVerifier.sol` are regenerated, never hand-edited.
4. **Spikes are radioactive.** Copy measurements and API shapes. Never `import` from `spikes/`.
5. **YAGNI.** No mid-tree revoke, Noir stub, plugin framework, or second Poseidon. One extra public input or package is a defect.
6. **Acyclic dependencies.** Types shared across packages live in `@warrant/core`. There is no `packages/types` or `packages/shared`.

---

## 2. Codebase structure

```
circuits/                     # circom sources + witness tests. No TypeScript runtime.
contracts/                    # Foundry. No TS. solc 0.8.28.
  src/MandateRegistry.sol     # LeanIMT + epoch. No Groth16.
  src/WarrantVerifier.sol     # snarkjs-generated. DO NOT EDIT.
  src/WarrantGate.sol         # composes registry + verifier.
  src/ens/                    # optional ENS wrapper (WP8).
packages/core                 # domain + prove/verify. No HTTP, no React, no Hedera SDK.
packages/x402                 # ResourceServerExtension + hooks. Depends on core + @x402/*.
packages/agent                # CLI + warrant.fetch. Depends on core + @x402/fetch.
apps/dashboard                # Next.js + Astryx (Carbon design language). UI + revoke only.
services/translate            # Hono composition root: x402 + Hedera + HCS.
deployments/                  # JSON addresses. No logic.
scripts/                      # compile-circuit, setup-groth16, download-zkey, check-boundaries.
spikes/                       # research only. Not a workspace package. Never imported.
```

### Dependency direction

```
apps/dashboard ──HTTP──► services/translate
       └── viem ──► MandateRegistry (revoke)

packages/agent ──► packages/core
       └── @x402/fetch

packages/x402 ──► packages/core
       └── @x402/core, @x402/hono

services/translate ──► packages/x402, packages/core
       └── @x402/hedera, @hiero-ledger/sdk, viem

circuits  ×  contracts  ×  packages   (no imports across these three)
spikes    ×  everything product
```

### `@warrant/core` (one file, one responsibility)

| File | Responsibility |
|---|---|
| `src/domain/scope.ts` | `uint64` bitmask; `isSubset(parent, child)`; named bits |
| `src/domain/mandate.ts` | Immutable mandate; `hashMandate` via Poseidon(5) |
| `src/domain/public-inputs.ts` | Exactly 8 slots; `toArray()` / `fromArray()` |
| `src/domain/challenge.ts` | `hashChallenge` — single keccak-mod-r implementation |
| `src/crypto/poseidon.ts` | poseidon-lite `poseidon2/4/5` only |
| `src/crypto/identity.ts` | Semaphore `Identity` wrap |
| `src/crypto/tree.ts` | Semaphore `Group` wrap + sibling pad |
| `src/prove/witness.ts` | Private inputs for D=4; dummy hops on-curve |
| `src/prove/snarkjs-prover.ts` | `IProver` |
| `src/prove/snarkjs-verifier.ts` | `IVerifier` |
| `src/index.ts` | Public barrel: `keygen`, `createMandate`, `prove`, `verify`, `hashChallenge` |

### `services/translate` (composition root)

| File | Responsibility |
|---|---|
| `src/main.ts` | Env, listen |
| `src/wiring.ts` | Construct adapters (`new` only here and in CLI) |
| `src/app.ts` | Hono routes → use-cases |
| `src/translate.ts` | String reverse / dictionary — no proofs |
| `src/hcs.ts` | Audit sink after success — no authorization |

---

## 3. Design patterns

| Pattern | Where | Why |
|---|---|---|
| **Ports & adapters** | `IVerifier`, `IRootChecker`, `INullifierStore`, `IPersonhood`, `IProver` | Swap proof system / RPC / storage without editing the pipeline |
| **Pipeline** | `packages/x402` authorize path | Fixed decision order; one reason per failure |
| **Strategy** | `IPersonhood` (AgentBook vs tier=0) | Same interface; never a fake World ID |
| **Value objects** | `PublicInputs`, `Mandate`, `Scope`, `Challenge` | Invariants at construction; no raw `string[]` of publics past core |
| **Facade** | `@warrant/core` four verbs | CLI and fetch never open zkeys |
| **Generated-code quarantine** | `WarrantVerifier.sol`, wasm/zkey | Regenerate on circuit change |

### Ports (contracts)

```ts
interface IVerifier {
  verify(proof: WarrantProof, publics: PublicInputs): Promise<boolean>;
}

interface IProver {
  prove(witness: WarrantWitness): Promise<WarrantProof>;
}

interface IRootChecker {
  /** `0n` is never acceptable. Demo uses currentRoot only. */
  isAcceptable(merkleRoot: bigint): Promise<boolean>;
}

interface INullifierStore {
  takeRequest(nullifier: bigint, requestHash: bigint): Promise<"fresh" | "seen">;
  freeCount(nullifier: bigint): Promise<number>;
  bumpFree(nullifier: bigint): Promise<number>;
}

interface IPersonhood {
  lookupHuman(agentWallet: `0x${string}`): Promise<bigint | null>;
}
```

### Authorize pipeline (fixed order)

1. No `warrant` header → continue to 402 (client learns challenge)
2. Malformed header → abort `malformed_warrant` → **403**
3. `merkleRoot !== currentRoot` → abort `root_revoked` → **403**
4. `requestHash` mismatch → abort `request_hash_mismatch` → **403**
5. `IVerifier.verify` false → abort `invalid_proof` → **403**
6. Scope / tier fail → abort `policy` → **403**
7. `takeRequest` already seen → abort `replay` → **403**
8. Under free quota → `bumpFree`, `grantAccess: true`
9. Else → continue to 402 (Blocky402 pay)

Do not collapse steps 3 and 4. Do not put this in `onBeforeVerify`. Quota is not the replay seal.

---

## 4. SOLID (applied)

Patterns, ports, and the import graph: [`docs/07-architecture.md`](07-architecture.md).

| Principle | Application |
|---|---|
| **S** | `MandateRegistry` = tree + epoch. `WarrantGate` = verify + root check. `pipeline` = authorize. `translate` = payload. `hcs` = audit. |
| **O** | Add Honk via `HonkVerifier implements IVerifier`. Add a paid rail by registering another `@x402` scheme in `wiring.ts`. |
| **L** | Every `IRootChecker` rejects `0n`. Every `IPersonhood` returns `null` for unregistered — not `0` and not throw. |
| **I** | Resource server depends on `IVerifier` only — never `IProver`. Hooks do not require a Hedera `PrivateKey`. |
| **D** | Pipeline takes ports + injected `hashChallenge`. Core never imports Hono or `@x402/*`. |

**Do not** put `verifyProof` inside `MandateRegistry`. That couples a ~235k-gas pairing check to every bind and makes the registry untestable without a proof.

---

## 5. Code smells — refuse

| Smell | Refuse | Do instead |
|---|---|---|
| God module | `translate.ts` proves + pays + HCS | Split pipeline / translate / hcs / wiring |
| Spike import | `from "../../spikes/..."` | Rewrite; pin constants in `deployments/` or core |
| Wrong x402 layer | `onBeforeVerify { skip: true }` for free tier | `onProtectedRequest` + `grantAccess` |
| Duplicate hash | keccak in hook and in prove | Only `domain/challenge.ts` |
| Duplicate Poseidon | circomlibjs + poseidon-lite | poseidon-lite only in product TS |
| Ninth public input | “just add expiry-grace” | Frozen 8-tuple |
| Mixed revoke semantics | `isKnownRoot` in demo hook | Demo: `currentRoot` only |
| Dummy zeros | `enabled=0` with Ax=0 | Dummy hops reuse a real Identity |
| Quadratic mux | `a <== (1-i)*x + i*y` | Split signals or `Mux1` |
| Speculative packages | `packages/noir`, `IPlugin` | Delete until needed |
| Feature envy | Dashboard imports `witness.ts` | Dashboard sends revoke tx; agents prove |

**Smell gate (every WP, after WP0):**

```bash
rg "from ['\"]spikes/" --glob '!spikes/**' --glob '!docs/**' && exit 1
rg "onBeforeVerify" packages/x402 && exit 1
rg "skip:\\s*true" packages/x402 && exit 1
rg "generate_witness" packages circuits && exit 1
pnpm exec node scripts/check-boundaries.mjs
```

---

## 6. Frozen constants (spike-backed)

### Circuit

| Constant | Value |
|---|---|
| Public inputs (8) | `merkleRoot, contextHash, nullifier, effectiveScope, effectiveBudgetCap, minExpiry, tier, requestHash` |
| Max depth D | 4 (padded) |
| LeanIMT | `BinaryMerkleRoot(20)`, pin `@zk-kit/binary-merkle-root.circom` ≥ 2.0.0 |
| EdDSA | 5× `EdDSAPoseidonVerifier` (4 mandate + 1 request) |
| Mandate hash | `Poseidon(5)([childPkX, childPkY, scope, budgetCap, expiry])` |
| Leaf | `Poseidon(4)([pkX, pkY, tier, epoch])` |
| `requestHash` | `keccak256(method\|path\|nonce\|merkleRoot\|amount\|payTo\|bodyHash) mod r` |
| Lean target | &lt; 15k constraints (measured 13,018) |
| Full target | &lt; 60k constraints (measured 56,794); prove &lt; 8 s (measured 2.2 s) |
| pot / zkey | pot16; zkey ~27.9 MB — host via release, never commit |

### Chains

| Concern | Chain |
|---|---|
| Personhood | World Chain 480 (AgentBook read) |
| Registry + verifier | Base Sepolia |
| Paid service + HCS | Hedera testnet |
| Agent namespaces | Ethereum Sepolia (WP8, optional) |

### Pinned externals

| Item | Value |
|---|---|
| AgentBook | `0xA23aB2712eA7BBa896930544C7d6636a96b944dA` |
| Hedera operator | `0.0.10311260` |
| HCS topic | `0.0.10336558` |
| Blocky402 | `https://api.testnet.blocky402.com` |
| x402 packages | `@x402/core@2.24.0` (+ hono / fetch / hedera) |
| Extension key | `"warrant"` |

Do not deploy `MandateRegistry` on Hedera for v1. Root check is an `eth_call` from the resource server to Base.

---

## 7. Testing strategy

| Layer | Assert | Must not |
|---|---|---|
| `circuits/test` | Witness pass/fail: scope, budget, expiry, epoch, sig, dummy hops | Network |
| `contracts/test` | bind, revoke, current vs known root, verify gas, tampered publics | Hono |
| `packages/core` | mandate hash, challenge hash, publics length = 8, sibling pad | RPC |
| `packages/x402` | pipeline table with fake `IVerifier` | Live Blocky402 |
| `services/translate` | One integration test: recorded 402 + fixture proof | World App |

Product code: failing test on the invariant first, then the module. Do not port a spike script into `src/` and wrap tests afterwards.

---

## 8. Work packages

### WP0 — Scaffold

**Deliver:** pnpm workspace; Foundry; circom path; package stubs per §2; `scripts/check-boundaries.mjs`; `.env.example` with pinned RPCs.

**Architecture:** empty files match §2; boundary script encodes the forbid table in §2 / `docs/07`.

**Gate:**

```bash
forge build && circom --version
pnpm exec node scripts/check-boundaries.mjs   # must fail on spikes/ or core→hono
```

### WP1 — Circuit v1 (LeanIMT + attenuation, no EdDSA)

**Deliver:** product rewrite of lean circuit; D=4 + `enabled[]`; same 8 publics; negative witness tests (widened scope, wrong root, budget/expiry, stale epoch, wrong nullifier).

**Gate:** `snarkjs r1cs info` shows &lt; 15k constraints; all negative cases throw at witness generation.

### WP2 — Circuit v2 (5× EdDSAPoseidon)

**Deliver:** full circuit; on-curve dummy hops; local ceremony + `CEREMONY.md`; `download-zkey.sh`; export Solidity verifier into `contracts/src/WarrantVerifier.sol`.

**Gate:** valid 2-hop chain proves; tampered sig fails; `forge build` succeeds with generated verifier.

### WP3 — MandateRegistry + WarrantGate

**Deliver:** LeanIMT registry (bind / revoke / rootHistory); separate `WarrantGate`; AgentBook check off-chain at bind time (document honestly); forge tests; deploy Base Sepolia when funded.

**Architecture:** registry must not call Groth16.

**Gate:** `forge test` green; `cast` can read `currentRoot` on anvil (and on Base Sepolia after deploy).

### WP4 — `@warrant/core`

**Deliver:** four-verb facade; ports + snarkjs adapters; `PublicInputs` length encoded in the type.

**Gate:** unit test proves a 2-hop chain against a local MandateRegistry fork (`anvil`).

### WP5 — x402 extension + translate service

**Deliver:** `warrant` extension + `onProtectedRequest` hooks; pipeline §3; Hono `POST /v1/translate`; register `ExactHederaScheme` before `initialize()`.

**Gate:**

| Call | Expected |
|---|---|
| No header | **402** with `extensions.warrant` |
| Valid proof, fresh nullifier, under quota | **200**, no payment |
| Fourth call, same nullifier (quota exhausted) | **402** `hedera:testnet` |
| Revoked root | **403** `root_revoked` |

### WP6 — Agent CLI + two-agent demo

**Deliver:** `warrant keygen | bind-root | delegate | prove`; `warrant.fetch`; orchestrator + translator; HCS submit after success.

**Gate:** one session shows delegate → call → HashScan/mirror message → server log with nullifier only (no names/addresses/tree).

### WP7 — Dashboard + revoke

**Deliver:** Next.js (React 19+) dashboard with a clear split:

| Layer | Choice |
|---|---|
| **Component runtime** | **[Astryx](https://astryx.atmeta.com/docs/getting-started)** — `@astryxdesign/core`, `@stylexjs/stylex`, `@astryxdesign/cli` |
| **Design language** | **[IBM Carbon Design System](https://carbondesignsystem.com/)** — color roles, layering, typography, spacing density, and interaction patterns |

Setup: install Astryx per getting started; run `npx @astryxdesign/cli init`. Do **not** default to `theme-neutral` as the product look. Create an editable Astryx theme (e.g. `npx @astryxdesign/cli theme template` or `theme add` then reshape) whose tokens map to Carbon roles — default **g10** (light), optional **g100** (dark). Reference [Carbon color](https://carbondesignsystem.com/elements/color/usage/) and themes; IBM Blue 60 (`#0f62fe`) for primary interactive; danger for Revoke.

Local mandate tree; destructive revoke → `MandateRegistry.revoke()`; verifier log; explorer links. Components via `@astryxdesign/core/<Component>` only — **never** `@carbon/react` / `@carbon/styles` (that would be a second UI kit). StyleX `xstyle` only for layout glue, not a parallel token set.

**Gate:** click Revoke; next `warrant.fetch` receives **403** `root_revoked`. UI is Astryx components under a Carbon-mapped theme (g10/g100 roles visible — not stock Astryx neutral/butter/etc.).

### WP8 — ENSv2 (optional)

**Deliver:** PermissionedRegistry clone; scope bits as EAC roles; revoke unregisters subname. Droppable — product demos without it.

**Gate:** explorer shows subname; after revoke it is gone. Or: explicitly skip and note in README.

### WP9 — Docs polish + partner feedback

**Deliver:** README runnable; `FEEDBACK_WORLD.md`, `FEEDBACK_ENS.md`, `FEEDBACK_HEDERA.md` if those tracks are pursued.

**Gate:** someone who did not write the code reproduces the paid call from the README.

### WP10 — Definition of done

End-to-end demo:

1. Bind a personhood-backed (or documented tier=0) root.
2. Delegate `translate` / attenuated budget / TTL; widened scope rejected.
3. Translator calls `/v1/translate`; free then paid path; server log shows only a nullifier.
4. Revoke; next call fails with `root_revoked`.
5. Optional: ENS subname appears then disappears.

If 1–4 pass, the implementation is done. Everything else is polish.

---

## 9. Non-goals (v1)

- Noir / UltraHonk port (keep `IVerifier` escape hatch only)
- Mid-tree revocation (short TTLs + root kill switch)
- Exact global budget across verifiers
- On-chain Groth16 on Hedera
- The Graph, Uniswap/Aqua hooks
- Mainnet deployment
- Keeper/relayer for on-chain AgentBook gating
- Importing or shipping spike JS as product code

---

## 10. Risks (remaining)

| Risk | Status | Mitigation |
|---|---|---|
| Circuit too large / slow | Closed | 56,794 constraints; prove 2.2 s |
| zkey too large for git | Closed | 27.9 MB via `download-zkey.sh` |
| Wrong free-tier hook layer | Closed | `onProtectedRequest` + `grantAccess` (spike 10/16) |
| World App unavailable | Open | Documented `tier=0` adapter; keep AgentBook path in code |
| ENSv2 redeploy | Open | WP8 droppable; re-pin addresses before demo |
| Quadratic / dummy-hop footguns | Process | Smell gate + WP1/WP2 negative tests |
| Scheme not registered | Process | `ExactHederaScheme` before `initialize()` in wiring |

---

## 11. Solo path

Skip WP8. Keep Next.js + Astryx with the Carbon-mapped theme, but shrink to one page (tree + revoke + log). Do not skip WP0 boundaries, WP2 verifier export, WP5 pipeline order, WP7 Astryx+Carbon UI, or revoke semantics (**403**).

---

## 12. Relationship to other docs

| Doc | Role |
|---|---|
| `02-design.md` | What Warrant is (threat model, structures, circuit sketch) |
| `05` (this file) | What to build, in what order, with gates |
| `07-architecture.md` | How product code must be shaped (patterns, SOLID, smells) |
| `spikes/` | Evidence only — not a package |
