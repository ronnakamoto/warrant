# 07 — Software architecture (patterns, SOLID, structure, smells)

`docs/05-implementation-plan.md` is the **build order** (work packages, gates, measured numbers). This file is the **shape of the product code**. WP0 must follow it. Spikes stay research; they are not a package.

If a change violates a rule here, it is a defect even if the demo still works.

---

## 0. Verdict on the previous plan

`docs/05` is clear on *what to ship and in what order*. It was **not** a software-architecture plan:

| Question | In `docs/05`? | Here |
|---|---|---|
| Work packages, gates, spike numbers | Yes | Unchanged — keep using 05 |
| Folder list | Sketch only | Exact files + one responsibility each |
| Who may import whom | No | Acyclic dependency rule |
| SOLID applied to *this* repo | No | Per package, with forbidden counterexamples |
| Design patterns we will actually use | Named `ICircuitVerifier` once | Ports/adapters, strategy, pipeline, value objects, generated-code quarantine |
| Code-smell prevention | Circuit footguns only | Product + crypto + x402 smells from the spikes |

This document fills that gap. It is deliberately small: a hackathon dies from a god-module, not from missing a fifteenth pattern.

---

## 1. Design goals (quality, not features)

1. **The demo path is one composition root.** CLI, Hono, and the dashboard never reimplement prove/verify/hash.
2. **Crypto is behind ports.** Swapping Groth16 for Honk is an `IVerifier` impl, not a rewrite of x402.
3. **Generated artifacts are frozen.** Circom output and `WarrantVerifier.sol` are not edited by hand.
4. **Spike JS is radioactive.** Copy measurements and API *shapes*. Never `import` from `spikes/`.
5. **YAGNI.** No Noir stub, no Graph, no mid-tree revoke, no generic plugin framework. One extra hop, one extra public input, or one extra package is a smell.

---

## 2. Codebase structure

### 2.1 Workspace (pnpm)

```
circuits/                     # circom sources + witness tests. No TypeScript runtime.
contracts/                    # Foundry. No TS. solc 0.8.28.
  src/MandateRegistry.sol     # LeanIMT + epoch. No Groth16.
  src/WarrantVerifier.sol     # snarkjs-generated. DO NOT EDIT.
  src/WarrantGate.sol         # composes registry + verifier. Optional on-chain demo.
  src/ens/                    # WP8 only. Wrapper, not a second mandate model.
packages/core                 # domain + prove/verify. No HTTP, no React, no Hedera SDK.
packages/x402                 # ResourceServerExtension + hooks. Depends on core + @x402/*.
packages/agent                # CLI + warrant.fetch. Depends on core + @x402/fetch.
apps/dashboard                # Next.js. UI only. Talks to translate via HTTP + viem for revoke.
services/translate            # Hono composition root. Wires x402 + Hedera + HCS.
deployments/                  # JSON addresses. No logic.
scripts/                      # compile-circuit, setup-groth16, download-zkey, check-boundaries.
spikes/                       # research only. Not a workspace package. Not imported.
```

One pnpm workspace. **Do not** add a second component library, a second Poseidon, or a `packages/shared` dumping ground.

### 2.2 `@warrant/core` files (WP4)

Split by responsibility, not by “utils”:

| File | Responsibility |
|---|---|
| `src/domain/scope.ts` | uint64 bitmask: `isSubset(parent, child)`, named bits (`TRANSLATE = 1n`, …) |
| `src/domain/mandate.ts` | Immutable mandate fields; `hashMandate` via Poseidon(5) as pinned in 05 |
| `src/domain/public-inputs.ts` | Exactly 8 slots. `toArray()` / `fromArray()`. Adding a field is a type error |
| `src/domain/challenge.ts` | `hashChallenge` — keccak-mod-r formula from spike 16. Single implementation |
| `src/crypto/poseidon.ts` | Re-export poseidon-lite `poseidon2/4/5` only |
| `src/crypto/identity.ts` | Wrap Semaphore `Identity` (keygen, sign, verify) |
| `src/crypto/tree.ts` | Wrap Semaphore `Group` (add, update, merkle proof + sibling pad) |
| `src/prove/witness.ts` | Private input assembly for D=4, dummy hops with **on-curve** points |
| `src/prove/snarkjs-prover.ts` | `IProver` — snarkjs groth16.prove |
| `src/prove/snarkjs-verifier.ts` | `IVerifier` — snarkjs groth16.verify |
| `src/index.ts` | Public barrel: `keygen`, `createMandate`, `prove`, `verify`, `hashChallenge`, types |

`index.ts` is the only supported import path from other packages.

### 2.3 `@warrant/x402` files (WP5)

| File | Responsibility |
|---|---|
| `src/policy.ts` | `{ requireScope, minTier, freeCallsPerHuman }` — data, not I/O |
| `src/challenge.ts` | Build `extensions.warrant.info` (nonce, merkleRoot, requireScope, minTier) |
| `src/pipeline.ts` | Ordered decisions: missing → hash → root → verify → quota → grant / pay / abort |
| `src/extension.ts` | `registerExtension({ key: "warrant" })` + `enrichPaymentRequiredResponse` |
| `src/hooks.ts` | `onProtectedRequest` adapter around `pipeline` (AgentKit slot, not `onBeforeVerify`) |
| `src/index.ts` | `createWarrantExtension`, `createWarrantHooks` |

### 2.4 `services/translate` (composition root)

This package is allowed to know Hono, Blocky402, Hedera, and HCS. **Nothing else is.**

```
src/main.ts              # read env, construct adapters, listen
src/app.ts               # Hono routes. Calls use-cases, not snarkjs
src/wiring.ts            # SnarkjsVerifier, CurrentRootChecker, MemoryNullifiers, HcsSink
src/translate.ts         # string reverse / tiny dictionary — the actual resource
src/hcs.ts               # submit {nullifier, scope, tier, txId} after success
```

### 2.5 Dependency direction (acyclic)

```
apps/dashboard ─────────────► services/translate (HTTP only)
        │
        └── viem ──► MandateRegistry (revoke tx)

packages/agent ──► packages/core
       │
       └── @x402/fetch (payment). Warrant header from core.prove

packages/x402 ──► packages/core
       │
       └── @x402/core, @x402/hono

services/translate ──► packages/x402, packages/core
       │
       └── @x402/hedera, @hiero-ledger/sdk, viem

circuits  x  contracts  x  packages   (no imports across these three)
spikes    x  everything product
```

**Forbidden imports** (WP0 gate — `scripts/check-boundaries.mjs` greps these):

| From | Must not import |
|---|---|
| `packages/core` | `@x402/*`, `hono`, `next`, `@hiero-ledger/*`, `viem`, `spikes/` |
| `packages/x402` | `next`, `packages/agent`, `services/*`, `spikes/` |
| `packages/agent` | `hono`, `next`, `services/*`, `spikes/` |
| `apps/dashboard` | `snarkjs`, `circomlib*`, `spikes/`, `circuits/` |
| `contracts/` | any TS |
| any product file | `spikes/` |

If you need a type in two packages, it lives in `packages/core`. Do not create `packages/types`.

---

## 3. Design patterns we will use (and why)

Only patterns that prevent a failure we have already seen or a swap we have already promised.

### 3.1 Ports and adapters (hexagonal)

Core defines ports. Adapters live at the edges.

```ts
export interface IVerifier {
  verify(proof: WarrantProof, publics: PublicInputs): Promise<boolean>;
}

export interface IRootChecker {
  isAcceptable(merkleRoot: bigint): Promise<boolean>;
}

export interface INullifierStore {
  /** Replay seal: same proof against the same challenge. */
  takeRequest(nullifier: bigint, requestHash: bigint): Promise<"fresh" | "seen">;
  /** Free-tier quota: counts by human-context, not by request. */
  freeCount(nullifier: bigint): Promise<number>;
  bumpFree(nullifier: bigint): Promise<number>;
}

export interface IPersonhood {
  lookupHuman(agentWallet: `0x${string}`): Promise<bigint | null>;
}
```

| Port | Production adapter | Test adapter |
|---|---|---|
| `IVerifier` | `SnarkjsVerifier` | `AcceptingVerifier` / `RejectingVerifier` |
| `IRootChecker` | `CurrentRootChecker` (eth_call `currentRoot`) | `MapRootChecker` |
| `INullifierStore` | in-memory Map for the demo; not Redis | the same Map, preloaded |
| `IPersonhood` | AgentBook via viem; `TierZeroPersonhood` fallback | fixture map |

The x402 pipeline depends on the **interfaces**, not on snarkjs or viem. That is the Honk escape hatch (`ICircuitVerifier` in 05) without a fake Noir folder.

**Demo revoke uses `CurrentRootChecker`**, not the 1-hour `isKnownRoot` window (spike 12+13). A `KnownRootChecker` may exist for tests; the translate service must not use it.

### 3.2 Pipeline / chain of responsibility (x402 hook)

One function, one decision, in this **fixed** order (spike 16):

1. No `warrant` header → `void` (402, client learns the challenge)
2. Malformed header → `abort: malformed_warrant` (403)
3. `publicSignals[0] !== liveRoot` → `abort: root_revoked` (403)
4. `publicSignals[7] !== hashChallenge(live)` → `abort: request_hash_mismatch` (403)
5. `IVerifier.verify` false → `abort: invalid_proof` (403)
6. Scope / tier fail policy → `abort: policy` (403)
7. `takeRequest(nullifier, requestHash)` already seen → `abort: replay` (403)
8. Nullifier under free quota → `bumpFree`, `grantAccess: true`
9. Else → `void` (402, Blocky402 pay)

Quota is **not** the replay seal. Three free calls need three distinct challenges and one nullifier.

Do **not** collapse 3 and 4. Checking hash first reports a revoke as a challenge mismatch (measured, then fixed, in spike 16).

Do **not** put this logic in `onBeforeVerify`. That is a payment-layer hook.

### 3.3 Strategy

- Personhood: AgentBook vs Selfie Check vs documented `tier=0`. Same `IPersonhood`. Never a fake World ID.
- Dual mode (privacy vs ENS): same `Scope` bits. ENS is a **read model / transparency adapter**, not a second mandate type.

### 3.4 Value objects

`PublicInputs`, `Mandate`, `Challenge`, `Scope` are constructed through factories that enforce invariants (8 slots; child scope ⊆ parent at *createMandate* time as well as in-circuit). No raw `string[]` of public signals leaking past `packages/core`.

### 3.5 Facade

`@warrant/core` public API is four verbs: `keygen`, `createMandate`, `prove`, `verify`. CLI and `warrant.fetch` call those. They do not open zkeys themselves.

### 3.6 Generated-code quarantine

| Artifact | Rule |
|---|---|
| `circuits/warrant.circom` | Hand-written, tests in `circuits/test/` |
| `*.wasm`, `*.zkey`, `vkey.json` | Build output. zkey downloaded, never git |
| `contracts/src/WarrantVerifier.sol` | `snarkjs zkey export solidityverifier`. Header comment: DO NOT EDIT |

If the circuit changes, regenerate. Never “just add a mapping” in the verifier.

### 3.7 Composition root

`services/translate/src/wiring.ts` and `packages/agent/src/cli.ts` are the only places that `new` adapters. Dashboard does not construct a prover.

### 3.8 Patterns we will **not** use

| Pattern | Why not |
|---|---|
| Abstract factory over hash functions | One Poseidon (poseidon-lite). A second is a smell |
| Event bus / CQRS / Graph | Non-goals until the video is done |
| DI container | Two `wiring.ts` files. `new` is fine |
| Plugin system for x402 keys | One key: `"warrant"` |
| Inherit MandateRegistry from the verifier | See SOLID / SRP below |

---

## 4. SOLID, applied to this repo

### Single responsibility

| Unit | Does | Does not |
|---|---|---|
| `MandateRegistry` | Leaves, epochs, roots, history timestamps | Groth16, x402, HCS, AgentBook RPC |
| `WarrantGate` | `verifyProof` + `isAcceptable(root)` + optional nullifier | Tree inserts |
| `pipeline.ts` | Authorize this HTTP request | Reverse strings, submit HCS, sign Hedera txs |
| `translate.ts` | Reverse / dictionary | Proofs |
| `hcs.ts` | Append audit line | Authorization |
| Dashboard revoke button | Send `revoke()` tx | Recompute witnesses |

`docs/02` sketched `verifyWarrant` *inside* MandateRegistry. **Do not do that.** It couples a 235k-gas pairing check to every bind and makes the registry untestable without a proof.

### Open / closed

Add Honk by adding `HonkVerifier implements IVerifier`. Do not edit `pipeline.ts`.

Add a second paid rail (Amoy) by registering another `@x402` scheme in `wiring.ts`. Do not fork the warrant hook.

### Liskov

Every `IRootChecker` must treat `0` as invalid (spike registry: `root == 0` is never a member). A checker that returns true for `0n` is not a subtype.

Every `IPersonhood.lookupHuman` returns `null` for unregistered (AgentBook SDK behavior). Do not throw vs return `0` inconsistently.

### Interface segregation

`IProver` is **not** required by the resource server. The server only has `IVerifier`. The CLI has both. Do not make `IVerifier` extend `IProver`.

x402 hooks must not require a Hedera `PrivateKey`. Payment is a separate scheme object.

### Dependency inversion

```
pipeline(policy, verifier, roots, nullifiers, hashChallenge)
```

`hashChallenge` is injected as the function from `packages/core` so tests can freeze keccak without copying the formula.

Hono adapters depend on core. Core does not depend on Hono.

---

## 5. Code smells — detect and refuse

### 5.1 Smells already paid for in spikes (never again)

| Smell | What it looked like | Rule |
|---|---|---|
| Wrong layer | `onBeforeVerify { skip: true }` for free tier | Free tier is `onProtectedRequest` + `grantAccess` |
| Stringly protocol | header `"valid-free"` in the grantAccess spike | Header is JSON `{ proof, publicSignals }` |
| Duplicate hash | ad-hoc keccak in the hook *and* in prove | Only `domain/challenge.ts` |
| Duplicate Poseidon | circomlibjs in one package, poseidon-lite in another | poseidon-lite only in product TS |
| Instanceof across copies | `PrivateKey` from `@hiero-ledger/sdk` vs `@x402/hedera` | Hedera keys from `@x402/hedera` in payment code |
| Quadratic mux | `a <== (1-i)*x + i*y` | Split signals or `Mux1` |
| Dummy zeros | `enabled=0` with Ax=0 | Dummy hops reuse a real Identity |
| ESM witness | `"type":"module"` + circom `generate_witness.js` | `snarkjs wtns calculate` |
| Under-constrained Merkle | binary-merkle-root v1 | Pin `>= 2.0.0`, single `index` |
| Ninth public | “just add expiry-grace” | Forbidden. Regenerates the verifier |
| Mixed revoke semantics | `isKnownRoot` in the demo hook | Demo: `currentRoot` only |

### 5.2 Classic smells, in this codebase’s dialect

| Smell | Example to reject | Do this |
|---|---|---|
| God module | `translate.ts` proves, pays, and writes HCS | Pipeline / translate / hcs / wiring |
| Feature envy | Dashboard imports `witness.ts` | Dashboard sends revoke tx; agents prove |
| Shotgun surgery | Adding a public input touches circuit, zkey, Solidity, TS tuple, dashboard | Frozen 8-tuple in one type |
| Primitive obsession | `scopes: string[]` across packages | `Scope` branded bigint |
| Magic numbers | `publicSignals[7]` in three files | `PublicInputs.requestHash` / `PUBLIC.requestHash = 7` once |
| Comments-as-design | `// don't skip verify` with skip still in code | No skip path exists |
| Speculative generality | `packages/noir`, `IPlugin` | Delete. Non-goal until video |
| Dead spike import | `from "../../spikes/zk/cascade.mjs"` | Rewrite; copy constants into `deployments/` or core |
| Divergent mandate hash | Poseidon(4) vs Poseidon(5) for M_i | Pin Poseidon(5) as in 05 |
| Test-only production branch | `if (process.env.FAKE_WORLD_ID)` | `tier=0` adapter is explicit and logged |
| Copy-paste pipeline | CLI reimplements hook checks | CLI calls `verify()`; server calls the same `IVerifier` |

### 5.3 Smell gate (every WP)

Before the WP commit:

```bash
# from repo root after WP0 exists
rg "from ['\\\"]spikes/" --glob '!spikes/**' --glob '!docs/**' && exit 1
rg "onBeforeVerify" packages/x402 && exit 1
rg "skip:\\s*true" packages/x402 && exit 1
rg "generate_witness" packages circuits && exit 1
```

`pnpm test` must include `scripts/check-boundaries.mjs` once WP0 lands.

---

## 6. Testing shape (prevents the architecture rotting)

| Layer | What | Must not |
|---|---|---|
| `circuits/test` | Witness pass/fail: scope, budget, expiry, epoch, tampered sig, dummy hops | Network |
| `contracts/test` | bind, revoke, current vs known root, `verifyProof` gas, tampered publics | Hono |
| `packages/core` | mandate hash, challenge hash, public-inputs length=8, pad siblings | RPC |
| `packages/x402` | pipeline table: 402 / grant / 403 reasons, with fake `IVerifier` | Live Blocky402 |
| `services/translate` | One integration test with recorded 402 header + fixture proof | World App |

TDD for product code: failing test on the invariant, then the module. Do not “port the spike script” into `src/` and wrap tests afterwards.

---

## 7. Mapping onto work packages

| WP | Architecture obligation |
|---|---|
| **0** | Workspace + `check-boundaries.mjs` + empty packages with the file list in §2. Gate **adds**: grep forbids `spikes/` imports |
| **1–2** | Circuit in `circuits/` only. Verifier generated into `contracts/src/WarrantVerifier.sol` |
| **3** | Registry ≠ Gate ≠ Verifier. Forge tests from spike 13 become product tests (rewritten, not copied) |
| **4** | Core ports + snarkjs adapters. Public API is the four verbs |
| **5** | Extension + hooks + pipeline. Register `ExactHederaScheme` **before** `initialize()` |
| **6** | CLI is a facade over core. HCS is a sink after success, not part of verify |
| **7** | Dashboard: local tree + revoke tx. No snarkjs in the browser |
| **8** | ENS adapter. Same `Scope` bits. Droppable without touching core |
| **9–10** | No new packages |

Solo schedule in 05 still applies: skip WP8, shrink the dashboard, do not skip this file.

---

## 8. Composition sketch (the only “big picture” code)

```ts
// services/translate/src/wiring.ts — allowed to be ugly. Everywhere else is not.
const verifier = new SnarkjsVerifier({ vkeyPath, wasmCache: true });
const roots = new CurrentRootChecker({ rpc: BASE_SEPOLIA_RPC, address: REGISTRY });
const nullifiers = new MemoryNullifierStore();
const pipeline = createWarrantPipeline({
  verifier,
  roots,
  nullifiers,
  hashChallenge,          // from @warrant/core
  policy: { requireScope: TRANSLATE, minTier: 1, freeCallsPerHuman: 3 },
});
http.onProtectedRequest((ctx) => pipeline.handle(ctx));
server.register("hedera:*", new ExactHederaScheme(/* from @x402/hedera */));
```

If this sketch grows `if (chain === "ens")` inside `pipeline.handle`, the architecture has failed — that belongs in an ENS adapter or not at all (WP8).

---

## 9. What “robust” does **not** mean

- Not a 40-class enterprise framework.
- Not 100% unit-test coverage of snarkjs.
- Not on-chain Groth16 on Hedera (05 non-goal).
- Not hiding the hackathon trusted setup (disclose in `CEREMONY.md`).

Robust means: a new contributor can add a paid rail or a Honk verifier without editing the circuit public-input tuple, the x402 pipeline order, or the dashboard.

---

## 10. Definition of done for architecture (WP0 gate, extended)

WP0 is not done at `forge build` alone. Also:

1. Workspace packages exist with the files in §2 (can be stubs).
2. `scripts/check-boundaries.mjs` fails if `packages/core` imports `hono` or any file imports `spikes/`.
3. This file is linked from `README.md` and `docs/05` §4.
4. `packages/core/src/domain/public-inputs.ts` exists with **length 8** encoded in the type.
