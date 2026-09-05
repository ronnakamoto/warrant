# 05 — Implementation plan (spike-backed)

This plan replaces the day-by-day guesswork in `docs/03-execution.md`. Every number and API shape below was measured on **2026-09-02** against live networks and real packages. Raw JSON lives in `spikes/*/results.json`. How to re-run: `spikes/README.md`.

**ETHOnline 2026: hacking starts Sep 4. Submission Sun Sep 13, 12:00 EDT. From-Scratch: no project-specific code before kickoff. These spikes and this plan are research, not the submission.**

---

## 0. Verdict from the spikes

Warrant is **buildable in 12 days**. The three things that could have killed it are not blockers:

| Fear | Measurement | Decision |
|---|---|---|
| Circuit too big / too slow to prove | **Full circuit measured:** LeanIMT-20 + 4 padded mandate EdDSAs + request EdDSA = **56,794** constraints (estimate was ~53k). Groth16 prove **2,247 ms**, JS verify **319 ms**, compile 2.2 s, setup 13 s. Still 8 public inputs. zkey **27.9 MB** — do not commit; host on a release. Fits `pot16` (headroom ~8.7k). 2-hop signed chain witness passes; widened scope and tampered request sig fail. | Ship Groth16. `warrant_full.circom` is the WP1+WP2 reference. Drop hops before touching Noir. |
| x402 won't let us add a custom auth extension | `@x402/core@2.24.0` `ResourceServer.registerExtension({ key: "warrant" })` produced a live `PaymentRequired` whose `extensions.warrant.info` contained our nonce, merkleRoot, requireScope, minTier. Blocky402 testnet `GET /supported` returns `hedera:testnet` / `exact` / feePayer `0.0.7162784`, plus Polygon Amoy `eip155:80002`. Facilitator `extensions: []` — same as AgentKit: **the extension is on the resource server, not the facilitator.** | Copy AgentKit's pattern. Key = `"warrant"`. Header on retry = `warrant` (mirroring `agentkit`). Payment still uses v2 `PAYMENT-SIGNATURE`. |
| AgentBook / ENSv2 / Hedera not actually callable | AgentBook `0xA23aB2712eA7BBa896930544C7d6636a96b944dA` on World Chain **480**, bytecode 3,569 bytes, `lookupHuman(address)→uint256`, `getNextNonce(address)→uint256`, `groupId()=1`. SDK `createAgentBookVerifier({ rpcUrl }).lookupHuman(0x1)` returns `null` for unregistered. ENSv2 Sepolia addresses from ensjs (2026-07-30) all have bytecode; ETHRegistry is ERC-1155; `getParent()` → RootRegistry `0x8115186E…` labeled `"eth"`; RootRegistry.getSubregistry("eth") round-trips. Hedera testnet mirror node 200s; latest tx was `CONSENSUSSUBMITMESSAGE` SUCCESS — HCS is live. Topic create is **not** a REST POST (404); needs `@hiero-ledger/sdk` + a testnet account. | Bind roots against **World Chain mainnet** AgentBook even if `MandateRegistry` lives on Base Sepolia. Pin ENSv2 addresses and re-cast them on day 9. Get a Hedera testnet account on day 7, not day 8. |

Poseidon-lite `poseidon2` / `poseidon4` / `poseidon5` **byte-match** circomlibjs Poseidon. Semaphore `Identity` + `Group` (LeanIMT) construct. Use those JS libs; do not roll a hash. Mandate messages use `poseidon5`.

---

## 1. Constraint budget (the only crypto math that matters)

```
WarrantCore full-binary Merkle-16                      10,917
BinaryMerkleRoot(20) membership only                   10,485
WarrantLean = LeanIMT-20 + attenuation + nullifier     13,018   prove 857 ms
WarrantFull = LeanIMT-20 + 5× EdDSA (measured)         56,794   prove 2,247 ms
EdDSAPoseidonVerifier × 1 (standalone)                  8,086
─────────────────────────────────────────────
ptau                                                   pot16 (2^16 = 65,536; headroom ~8.7k)
zkey (full circuit)                                    27.9 MB — GitHub release, not git
Groth16 Solidity verifier (8 publics)                  2,003 bytes deployed (2,031 runtime in gas report)
JS verify (full)                                       319 ms
On-chain verifyProof gas                               **235,451** (forge gas report; gasleft log 242,450)
MandateRegistry bindRoot (3rd insert)                  ~345k; revoke ~244k avg
PoseidonT5.hash (leaf)                                 116,477
```

**Circuit lesson from the spike:** a mux written as `a <== (1-i)*x + i*y` is **two products in one assignment** and circom 2.2.3 rejects it (`error[T3001] Non quadratic constraints`). Split into two signals, or use circomlib `Mux1`.

**LeanIMT (closed, 2026-09-02 follow-up):** production membership is `@zk-kit/binary-merkle-root.circom@2.0.0` `BinaryMerkleRoot(MAX_DEPTH)`. API is `(leaf, depth, index, siblings[MAX_DEPTH])` — a **single** index; the circuit runs `Num2Bits` internally. Do not pass `pathIndices[]`. Pin **≥ 2.0.0** (v1.x was under-constrained, PSE Jul 2025). JS: `@semaphore-protocol/group` `generateMerkleProof`, pad siblings with `0` to MAX_DEPTH, `depth = proof.siblings.length`. A 3-member group (depth 2) witness **matches** the circuit; a wrong root is rejected; a widened scope bit is rejected. WP1's `< 15k` gate is already green on the reference circuit (`spikes/zk/circuits/warrant_lean.circom`). Still rewrite it in the product repo on Sep 4 — do not import spike JS.

---

## 2. Confirmed external surface (copy these, don't rediscover)

### 2.1 Blocky402 testnet (`https://api.testnet.blocky402.com`)

```
GET /health → { status: "ok", version: "1.0.0" }
GET /supported →
  kinds:
    exact / eip155:80002
    exact / solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1  extra.feePayer=7B6Q2Mvc…
    exact / hedera:testnet                     extra.feePayer=0.0.7162784
  signers.hedera:* = ["0.0.7162784"]
  extensions = []
```

Payment requirements for the demo service:

```json
{
  "scheme": "exact",
  "network": "hedera:testnet",
  "asset": "0.0.0",
  "amount": "100000",
  "payTo": "0.0.10311260",
  "maxTimeoutSeconds": 300,
  "extra": { "feePayer": "0.0.7162784" }
}
```

x402 v2 headers: `PAYMENT-REQUIRED`, `PAYMENT-SIGNATURE`, `PAYMENT-RESPONSE`. Packages: `@x402/core@2.24.0`, `@x402/hono`, `@x402/fetch`, `@x402/hedera`, `@x402/evm`.

`ResourceServerExtension` + HTTP hooks we will implement (measured against `@x402/core@2.24.0` `processHTTPRequest`):

- `enrichPaymentRequiredResponse` — put merkleRoot + nonce + requireScope + minTier in `info`; mark `nonce`/`issuedAt`/`merkleRoot` as `dynamicInfoFields`.
- **`transportHooks.http.onProtectedRequest`** (or `httpServer.onProtectedRequest`, same slot AgentKit uses) — this is the free-tier gate, **not** `onBeforeVerify { skip: true }`.
  - no `warrant` header → `void` → **402** with `extensions.warrant`
  - valid proof, under free quota → `{ grantAccess: true }` → `{ type: "no-payment-required" }`
  - valid proof, quota exhausted → `void` → 402 / Blocky402 payment
  - revoked / invalid proof → `{ abort: true, reason: "root_revoked" }` → **403**
- AgentKit's `createAgentkitHooks().requestHook` returns `{ grantAccess: true }` in `mode: { type: "free" }`. Copy that. `onBeforeVerify { skip: true }` only skips facilitator `/verify` after a payment payload exists — the wrong layer for "first three calls free".

### 2.2 World AgentBook (canonical, World Chain 480)

| Item | Value |
|---|---|
| Address | `0xA23aB2712eA7BBa896930544C7d6636a96b944dA` |
| RPC | `https://worldchain-mainnet.g.alchemy.com/public` (JSON-RPC POST; GET returns 400) |
| `lookupHuman(address) → uint256` | `0` means unregistered; SDK returns `null` |
| `getNextNonce(address) → uint256` | `0` for unused wallets |
| `groupId()` | `1` |
| SDK | `@worldcoin/agentkit@0.2.1` — `createAgentBookVerifier`, `declareAgentkitExtension`, `createAgentkitClient`, `createAgentkitHooks` |
| Extension key | `"agentkit"` (our key is `"warrant"`, parallel, not a fork) |
| Register | `register(agent, root, nonce, nullifierHash, proof[8])` — needs World App. For the demo, Alice registers via `npx @worldcoin/agentkit-cli register` **or** we accept a Selfie-Check proof as tier-1 and skip AgentBook for that path. |

`bindRoot` on `MandateRegistry` (Base Sepolia) will `eth_call` AgentBook on World Chain (or take a signed lookup from our indexer). Do **not** deploy a fake AgentBook.

### 2.3 ENSv2 Sepolia (ensjs 2026-07-30, verified on-chain this spike)

| Contract | Address | Bytecode |
|---|---|---|
| UniversalResolver proxy | `0xeEeEEEeE14D718C2B47D9923Deab1335E144EeEe` | 2,491 |
| ETHRegistry (`ensRegistry`) | `0xBDC85dD5b15D7ecb354cd7cb6f2c50b4f2c4F0E2` | 14,730 |
| RootRegistry (from `getParent()`) | `0x8115186E8f2E0B0281e86ab91f0f48Ba90364354` | 14,730 |
| VerifiableFactory | `0x10dC6333CDFe1FCEf624c6e0a8221b91804Cd7ef` | 1,411 |
| PermissionedResolver impl | `0x9EAe5C2730a7dD16BDD1DeE6421a1B91e3B0365e` | 17,597 |
| UserRegistry impl | `0x624a25d67B59D587752EbEc8DdeD8827dAe52050` | 17,159 |
| ETHRegistrar | `0xa88553F454b77203B0D036A05c894d555EAAa2Cc` | 7,497 |

ETHRegistry `supportsInterface(0xd9b67a26) = true` (ERC-1155). `hasRootRoles(1, 0x1) = false` — EAC is live. **Pin these in `deployments/sepolia.json`. Re-run `ens/ensv2.mjs` on day 9 before the ENS demo; they have redeployed before.**

We deploy **our own** `PermissionedRegistry` clone via VerifiableFactory as `agents.<demo>.eth`'s subregistry. We do not need to own `eth`. Register a throwaway `.eth` on Sepolia (ETHRegistrar) **or** use a name we already control. Day 9 is the ENS day; the product works without it.

### 2.4 Hedera testnet

- Mirror: `https://testnet.mirrornode.hedera.com/api/v1` — supply, nodes, transactions all 200.
- Operator (ECDSA, measured 2026-09-02): **`0.0.10311260`** / EVM `0x830106c650d995f079f29848d90d4e96b1fcbdb8`. Key type `ECDSA_SECP256K1`. Balance **~998 HBAR**. HashScan: https://hashscan.io/testnet/account/0.0.10311260
- Private key: gitignored `.env` as `HEDERA_PRIVATE_KEY`. Never commit it. `derivedEvm` from the key **matches** the mirror `evm_address`.
- HCS: `@hiero-ledger/sdk` `TopicCreateTransaction` + `TopicMessageSubmitTransaction` **SUCCESS**. Research topic **`0.0.10336558`** (memo `warrant-research HCS audit`), message `{"nullifier":"spike","scope":1,"tier":2,...}`. HashScan: https://hashscan.io/testnet/topic/0.0.10336558
- `POST /topics` on the mirror → 404 (unchanged). SDK is the only create path.
- Blocky402 `payTo` = `0.0.10311260`. Facilitator feePayer remains `0.0.7162784`. Live settle spike (2026-09-04): 1000 tinybars to `0.0.98`, tx `0.0.7162784@1788502420.541125170`, mirror `CRYPTOTRANSFER SUCCESS`. HashScan: https://hashscan.io/testnet/transaction/0.0.7162784-1788502420-541125170

---

## 3. Target architecture (narrowed)

```
Alice (World ID)
  └─ AgentBook.register(rootAgentWallet)          World Chain 480
       └─ MandateRegistry.bindRoot(bjjPk, tier)   Base Sepolia (cheap, Foundry, Aqua-adjacent)
            LeanIMT of Poseidon4(pkX, pkY, tier, epoch)
            revoke() bumps epoch, replaces leaf

Off-chain mandates (EdDSA-Poseidon, never on chain unless Alice opts into ENS mode)
  rootSk  --scope 7, $20, 24h-->  research-agent
  research-agent --scope 1, $2, 1h--> translator

translator --warrant proof--> x402 resource server (Hono)
  extensions.warrant  → Groth16 verify (snarkjs, ~10–50 ms after warmup)
                      → merkleRoot ∈ MandateRegistry.rootHistory
                      → nullifier spend / free-tier counter
                      → else PAYMENT-SIGNATURE via Blocky402 hedera:testnet

Hedera /translate  → real string reverse or tiny dictionary
HCS topic          → {nullifier, scope, tier, paymentTxId}

Optional transparency: ENSv2 subnames + EAC role bitmap = scope bits
```

**Chains of record for the demo**

| Concern | Chain | Why |
|---|---|---|
| Personhood | World Chain 480 (read-only) | Canonical AgentBook |
| MandateRegistry + verifier | Base Sepolia | Cheap, familiar, Aqua lives here if we ever stretch |
| Paid service + HCS | Hedera testnet | Hedera prize requires Blocky402 settlement |
| Agent namespaces | Ethereum Sepolia | ENSv2 beta only |

Do **not** deploy MandateRegistry on Hedera for v1. Cross-chain root check is an `eth_call` to Base from the Hono server. On-chain `onlyWarrant` modifier is a Base Sepolia demo contract, not required for the paid Hedera call.

---

## 4. Repo layout to scaffold on Sep 4 (hour 0)

pnpm workspaces. Foundry in `/contracts`. Circom in `/circuits`. **Exact file list, import graph, and SOLID rules: `docs/07-architecture.md`.** The tree below is the skeleton; 07 is the law.

```
package.json                 # pnpm workspaces
circuits/
  warrant.circom             # D=4, LeanIMT depth 20, 5× EdDSAPoseidonVerifier
  test/                      # circom tests via mocha + witness
contracts/                   # foundry
  src/MandateRegistry.sol    # LeanIMT + epoch only — no Groth16
  src/WarrantVerifier.sol    # snarkjs-generated, DO NOT EDIT
  src/WarrantGate.sol        # composes registry + verifier
  src/ens/AgentRegistry.sol  # WP8 thin wrapper
  test/
packages/core                # domain + IProver/IVerifier. No HTTP.
packages/x402                # extension + pipeline hooks. Depends on core.
packages/agent               # warrant.fetch, CLI. Depends on core.
apps/dashboard               # Next.js 15 — UI + revoke tx. No snarkjs.
services/translate           # composition root: Hono + Blocky402 + HCS
deployments/                 # pinned addresses JSON
scripts/                     # compile-circuit, download-zkey, check-boundaries
spikes/                      # research. Not a workspace package. Never imported.
```

Public inputs (fixed, 8 — already the verifier signature):

```
merkleRoot, contextHash, nullifier, effectiveScope,
effectiveBudgetCap, minExpiry, tier, requestHash
```

Keep this tuple stable. Adding a 9th public forces a new verifier and wasted day.

`requestHash` (spike 16) is `keccak256(method|path|nonce|merkleRoot|amount|payTo|bodyHash) mod r`. Not a 9th public — it is slot 8 of this tuple.

---

## 5. Work packages (in order, with gates)

Each package has a **gate**. Do not start the next package until the gate is green. Commit after every gate.

### WP0 — Scaffold (Sep 4, morning, 2 h)

- pnpm workspace, Foundry `forge init`, circom path, `.env.example` with RPC URLs below.
- Create the package files listed in `docs/07-architecture.md` §2 (stubs OK). Add `scripts/check-boundaries.mjs`.
- CI-less: `pnpm test` runs circuit unit tests + forge test + boundary grep.
- Copy spike circuits as a reference; do not import spike JS into the product.

**Gate:** `forge build` and `circom --version` succeed in a clean shell. `check-boundaries` fails if any product file imports `spikes/` or if `packages/core` imports `hono` / `@x402/*`.

RPCs to put in `.env.example`:

```
WORLDCHAIN_RPC=https://worldchain-mainnet.g.alchemy.com/public
SEPOLIA_RPC=https://ethereum-sepolia-rpc.publicnode.com
BASE_SEPOLIA_RPC=https://sepolia.base.org
BLOCKY402=https://api.testnet.blocky402.com
HEDERA_MIRROR=https://testnet.mirrornode.hedera.com/api/v1
HEDERA_ACCOUNT_ID=0.0.10311260
HEDERA_EVM_ADDRESS=0x830106c650d995f079f29848d90d4e96b1fcbdb8
HEDERA_PRIVATE_KEY=
HEDERA_TOPIC_ID=0.0.10336558
AGENT_BOOK=0xA23aB2712eA7BBa896930544C7d6636a96b944dA
```

### WP1 — Circuit v1: LeanIMT + attenuation, no EdDSA (Sep 4 afternoon)

Start from `spikes/zk/circuits/warrant_lean.circom` (reference only). Include path: `-l node_modules/@zk-kit/binary-merkle-root.circom/src -l node_modules/circomlib/circuits`. Keep D=4 padding + `enabled[]`. Constraint target: **< 15k** (reference is **13,018**). Public inputs stay the same 8.

Negative tests in JS (witness must fail) — now all measured on `warrant_lean`:
- widened scope bit *(spike: rejected)*
- wrong merkle root *(spike: rejected)*
- budget > parent *(spike 12: rejected)*
- expiry > parent *(spike 12: rejected)*
- padded `enabled=0` hop may exceed parent budget *(spike 12: accepted — only live hops attenuate)*
- stale epoch / old leaf against post-revoke root *(spike 12: rejected)*
- wrong nullifier *(Poseidon(2) equality; same shape as the other asserts)*

**Gate:** `snarkjs r1cs info` printed; all negative cases throw in witness generation. Spike 12 already ran budget, expiry, and stale-epoch negatives on the reference circuit.

### WP2 — Circuit v2: add 5× EdDSAPoseidon (Sep 5)

Start from `spikes/zk/circuits/warrant_full.circom` (reference only). **Already measured as a spike:** 2-hop chain (root → agent → translator) + 2 padded hops + request signature proves in **2,247 ms** at **56,794** constraints. Widened scope rejected. Tampered request `S` rejected.

Use `Identity.signMessage` / `@zk-kit/eddsa-poseidon`. Dummy hops: `enabled=0` **and** `EdDSAPoseidonVerifier.enabled=0`, but Ax/Ay/R8 **must be valid Baby Jubjub points** (reuse a real Identity). Curve ops are not gated by `enabled`; zeros will blow the witness.

Mandate hash (pin this):

```
M_i = Poseidon(5)([childPkX, childPkY, scope, budgetCap, expiry])
```

Hop 0 signed by the root key; hop i signed by hop i-1's `childPk`. Leaf signs `requestHash`.

Constraint target: **< 60k** (reference **56,794**). Prove target: **< 8 s** (reference **2.2 s**). Do not add a 6th EdDSA — pot16 headroom is ~8.7k.

**Gate:** valid 2-hop chain proves; a tampered sig fails; Groth16 verifier exported and `forge build` succeeds.

Trusted setup: local `zkey contribute` with disclosed entropy. Put `CEREMONY.md` in the repo. Q&A line: "hackathon ceremony; `ICircuitVerifier` lets us swap Honk later." Host the **27.9 MB** zkey via `scripts/download-zkey.sh`, do not commit it.

### WP3 — MandateRegistry (Sep 5–6)

Solidity:
- `LeanIMT` from `@semaphore-protocol/contracts` (npm 200).
- `bindRoot(uint256 pkX, uint256 pkY, uint8 tier)` — caller must pass AgentBook check. **Implementation:** the Hono/CLI does the `lookupHuman` off-chain and the contract takes `address agentWallet` plus we store `mapping(address => uint256 leafIndex)`. For the hackathon, `onlyAgentWallet` can be an off-chain gate in the CLI that still writes `agentWallet` on-chain; a keeper/relayer is out of scope. Document this honestly in the README.
- `revoke()` by `agentWallet` — increment `epoch[wallet]`, update leaf to `Poseidon4(pkX, pkY, tier, newEpoch)`.
- `rootHistory(root => timestamp)` with 1 hour window (Semaphore pattern) so in-flight proofs survive a revoke-of-*someone-else*. **x402 demo hook uses `currentRoot` only** (`docs/07-architecture.md`).
- `WarrantGate` is a **separate** contract that wraps Groth16 + root check. Do not put `verifyProof` inside `MandateRegistry`.

Forge tests: bind, revoke invalidates old leaf, history window.

**Gate:** `forge test` green; deployed to Base Sepolia; `cast` can read the root. Anvil gate is already green (`spikes/zk/foundry` — 7 tests). Base Sepolia deploy still needs a funded key.

### WP4 — `@warrant/core` (Sep 6)

TypeScript, Node 22 (measured). Public API is the four verbs in `docs/07-architecture.md` (`keygen`, `createMandate`, `prove`, `verify`). snarkjs lives behind `IProver` / `IVerifier` — the x402 package never imports snarkjs.

```
keygen() → { sk, pk }
createMandate({ parentSk, childPk, scope, budget, expiry })
prove(tree, chain, requestHash, context)
verify(proof, publics)
```

Wrap snarkjs. Cache the zkey via `scripts/download-zkey.sh`. Full-circuit zkey is **27.9 MB** — **do not commit it**.

**Gate:** a unit test proves a 2-hop chain against a local MandateRegistry fork (`anvil`).

### WP5 — x402 extension + translate service (Sep 7)

`packages/x402`: copy AgentKit's **two-piece** wiring, not `onBeforeVerify`:

1. `warrantResourceServerExtension` — `enrichPaymentRequiredResponse` only (like `agentkitResourceServerExtension`).
2. `createWarrantHooks` — `onProtectedRequest` (like `createAgentkitHooks().requestHook`).

Hook behavior (measured with `x402HTTPResourceServer.processHTTPRequest`):

| `warrant` header | Return | Result |
|---|---|---|
| missing | `void` | **402** (client learns to attach a proof) |
| valid Groth16 + under free quota | `{ grantAccess: true }` | `{ type: "no-payment-required" }` |
| valid + quota exhausted | `void` | **402** then Blocky402 `exact` / `hedera:testnet` |
| revoked / invalid | `{ abort: true, reason: "root_revoked" }` | **403** |

Inside the hook: `IVerifier.verify`, `IRootChecker` on **currentRoot** (not the 1h window), scope bits, minTier, **seal-close** `takeRequest(nullifier, requestHash)`, then `freeCount(nullifier)`. Do **not** use `onBeforeVerify { skip: true }` for free tier — that only skips facilitator `/verify` after a payment payload already exists. Do **not** import snarkjs from this package.

`services/translate`: Hono, `@x402/hono`, Blocky402 facilitator URL, Hedera `exact`. Route `POST /v1/translate` `{ text }` → `{ translated }`.

**Gate:** `curl` without header → 402 with `extensions.warrant`. `curl` with a valid proof of a fresh nullifier → 200, no payment. Fourth call with same nullifier → 402 payment requirements for hedera:testnet. Revoked root → 403.

### WP6 — Agent CLI + two-agent demo (Sep 8)

```
warrant keygen
warrant bind-root --wallet $ADDR --tier 2
warrant delegate --to $PK --scope translate --budget 2.00 --ttl 1h
warrant prove --request $HASH --context $CTX
```

`warrant.fetch` = wrap `@x402/fetch` to attach the warrant header before the payment header.

Two processes:
- `orchestrator` (scripted, not a live LLM required): creates a sub-mandate, prints it.
- `translator`: uses `warrant.fetch` against `/v1/translate`.

HCS: after a successful paid (or free) call, submit `{nullifier, scope, tier, tx}` to topic **`0.0.10336558`** (already created) or a fresh topic from the same operator.

**Gate:** one terminal session shows: delegate → call → HashScan tx (or mirror `CONSENSUSSUBMITMESSAGE`) → nameless server log line.

Hedera account: **already provisioned** (`0.0.10311260`, ~998 HBAR). Do not wait until day 7.

### WP7 — Dashboard + revoke (Sep 9–10)

Next.js app:
- Local-only tree view (mandates in `localStorage` / file, never uploaded)
- Big **Revoke** → `MandateRegistry.revoke()`
- Verifier log stream (websocket or poll the translate service) showing `{nullifier, scope, tier, paid}`
- Links: Base Sepolia explorer, HashScan, Worldscan AgentBook, ENS Explorer

**Gate:** click Revoke, next `warrant.fetch` returns 401/402 with `root_revoked`.

### WP8 — ENSv2 (Sep 9, after WP7 if time; otherwise Sep 10)

1. Register `warrant-demo.eth` on Sepolia ETHRegistrar (or a cheaper 3LD if that's live).
2. Deploy PermissionedRegistry clone via VerifiableFactory (`ensUserRegistryImpl`).
3. Set it as subregistry of `agents.warrant-demo.eth`.
4. Map scope bits → EAC roles (`ROLE_SET_RESOLVER` etc. are the wrong bits — define *our* role nybbles in the custom registry's documentation; EAC allows 32 roles, we use 8 capability bits in the low nybbles).
5. ENSIP-25 text record to a dummy ERC-8004 id if we mint one; ENSIP-26 `agent-endpoint[web]` = translate URL.
6. `revoke()` also `unregister`s the subname if we hold `ROLE_UNREGISTER`.

**Gate:** ENS Explorer shows the subname; after revoke it is gone. If ENS Sepolia is redeployed, the product still demos without this WP.

### WP9 — Video, README, partner feedback (Sep 11–12)

Follow `docs/03-execution.md` §4 script. Two takes. No AI voice. 720p+.

Feedback files:
- `FEEDBACK_WORLD.md` — AgentKit docs, Sandbox, lookupHuman returning 0 vs revert, Alchemy GET-vs-POST.
- `FEEDBACK_ENS.md` — address pin, getParent vs getSubregistry, EAC `hasRootRoles`.
- `FEEDBACK_HEDERA.md` — Blocky402 `/supported` shape, feePayer, HCS not REST-creatable.

**Gate:** a teammate who didn't write the code follows README and reproduces the paid call.

### WP10 — Submit (Sep 13, before 10:00 EDT)

Select Finalist + partners **World, ENS, Hedera**. Attribute AI. Daily commit history already exists (gate after every WP).

---

## 6. Partner-prize mapping (unchanged, now evidenced)

| Partner | Track | Evidence we can satisfy the letter of the rules |
|---|---|---|
| World | Selfie Check $3.5k (From-Scratch) | Tier-1 root path. AgentKit $3.5k is Continuity-only — **do not submit there**. Use Sandbox App, write the feedback doc. |
| ENS | Best Use of ENSv2 $4.5k | Custom PermissionedRegistry + EAC, addresses live today. Must not be cosmetic — scope bits *are* roles. |
| Hedera | Agentic Payments $6k | Live Blocky402 `exact` / `hedera:testnet`. HCS audit. ERC-8004 optional extra. |

Fallback if World Sandbox is unreachable on day 4: still bind roots with a documented `tier=0` (no personhood) **and** keep the AgentBook path in code; the Hedera + ENS story survives. Do not fake a World ID.

---

## 7. Explicit non-goals until the video is in the can

- Noir / UltraHonk port
- Uniswap CCA hook / Aqua opcode
- The Graph subgraph
- On-chain Groth16 verify on Hedera (server-side verify is enough for x402)
- Mid-tree revocation (short TTLs only)
- Exact global budget across verifiers
- Mainnet anything

After the video: those items become Stage 2–3 work, not ETHOnline scope.

---

## 8. Risk register (only remaining risks)

| Risk | Likelihood | Mitigation already chosen |
|---|---|---|
| Full circuit proves slower than 8 s | **Closed** | Measured **2,247 ms** at 56,794 constraints. |
| zkey too big for git | **Closed (confirmed)** | **27.9 MB**. `download-zkey.sh` / GitHub release. |
| World App / Sandbox unavailable | Med | tier=0 path + AgentBook still in code; Selfie Check feedback still written if we got *any* sandbox time |
| ENSv2 redeploy | Med | `ens/ensv2.mjs` is the canary; ENS is WP8, droppable |
| Hedera faucet empty | **Closed** | Account `0.0.10311260` holds ~998 HBAR. Amoy remains a fallback rail. |
| Trusted-setup Q&A | Low | `CEREMONY.md` + one-liner |
| Quadratic constraint footgun | Certain if careless | Never two muls in one `<==`; dummy EdDSA hops need on-curve points |
| Paid path without a registered Hedera scheme | **Closed at facilitator** | Spike 15: client `ExactHederaScheme` + Blocky402 `/verify`+`/settle` transferred 1000 tinybars, mirror `CRYPTOTRANSFER SUCCESS`. Hono still must `register("hedera:*", new ExactHederaScheme())` before `initialize()` (spike 10 warning). |

---

## 9. Team assignment against WPs

| Person | Owns | Backup |
|---|---|---|
| ZK | WP1, WP2, zkey, `packages/core` prove | Contracts |
| Contracts | WP3, WP8 ENS, Foundry tests | ZK |
| Agents/payments | WP5, WP6, Hedera account, HCS, CLI | Product |
| Product | WP0, WP7, WP9, WP10, feedback docs | Agents |

Solo: skip WP8, shrink dashboard to a single HTML page, still hit Hedera + revoke + nameless log.

---

## 10. Definition of done (the demo that is the product)

A judge can watch, in four minutes:

1. Alice binds a World-ID-backed root (or we show the AgentBook lookup of that wallet returning a non-zero `humanId`).
2. Orchestrator delegates `translate` / $2 / 1 h to translator; a `trade` bit is rejected.
3. Translator calls Hedera `/v1/translate`; first call free; a later call settles HBAR through Blocky402; **server log shows only a nullifier**.
4. Alice clicks Revoke; the next call fails.
5. (Bonus) ENS Explorer showed the sub-agent and then didn't.

If 1–4 work, submit. Everything else is decoration.

---

## 11. Spikes: done vs not worth doing vs cannot spike yet

The **mechanism** is validated end-to-end: membership, attenuation, cascade revoke, on-chain Groth16, MandateRegistry bind/revoke, requestHash bound to a real 402 challenge, and a live Blocky402 HBAR settle. Remaining gaps are human-gated (World App, Sepolia ETH) or product (Hono service, dashboard), not idea risk.

**Done (16):**

| # | What | Evidence |
|---|---|---|
| 1–11 | Prior spikes (circuit, x402 shape, AgentBook, ENSv2, Poseidon, Hedera mirror, LeanIMT, EdDSA, full circuit, grantAccess, HCS) | `spikes/README.md` |
| 12 | Cascade revoke + attenuation | `zk/artifacts/cascade-results.json` — old leaf vs new root **fails**; new epoch + same mandate signatures **pass**; budget/expiry widening **fail**; padded hop may exceed |
| 13 | MandateRegistry on anvil | `forge test` — PoseidonT3/T5 match poseidon-lite; bind 3 roots; revoke Alice; `isCurrentRoot` instant; `isKnownRoot` 1h window then expires |
| 14 | Groth16 `verifyProof` gas | **235,451** gas report / **242,450** gasleft. Tampered public input returns false |
| 15 | Live Blocky402 settle | 1000 tinybars `0.0.10311260` → `0.0.98`, feePayer `0.0.7162784`, tx `0.0.7162784@1788502420.541125170`, mirror **SUCCESS** |
| 16 | requestHash ↔ 402 | keccak-mod `r` of the challenge; `warrant_full` signs it; Groth16 `publicSignals[7]` matches; grantAccess; wrong nonce **403** `request_hash_mismatch`; stale root **403** `root_revoked` |

**Do not spike (no decision left):** Noir/Honk, on-chain verify on Hedera, Graph, Uniswap. LeanIMT.sol insert gas is now measured (spike 13).

**Cannot spike without a human/wallet (WP gates, not more research):**

| Item | Why a spike cannot close it | When |
|---|---|---|
| World ID Selfie Check / AgentBook `register` | Needs World App + sandbox | WP3 / World feedback doc |
| Hono `/v1/translate` paid path | Facilitator settle is live; resource server still must register `ExactHederaScheme` | WP5–WP6 |
| MandateRegistry on Base Sepolia | Anvil closed the mechanism; needs a funded Base Sepolia key | WP3 deploy |
| ENSv2 name + PermissionedRegistry clone | Needs Sepolia ETH; they redeploy | WP8 |
| Dashboard revoke UX | Product | WP7 |

**Verifier choice (spike 12+13):** demo revoke should check `merkleRoot == currentRoot` (instant cascade). `isKnownRoot` with a 1h window is the Semaphore in-flight pattern — it also lets a *revoked* identity prove against an old root until the window ends. Do not mix them in the x402 hook.

World sandbox app is the only remaining human-gated *idea* dependency. Hedera payment is unblocked.
