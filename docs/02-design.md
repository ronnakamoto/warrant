# 02 — Warrant: design

## 0. The claim in one sentence

Warrant is a **delegatable anonymous credential** for agents. A verifier learns exactly four things about a request: *(1)* it was authorized by a chain that starts at a **World-ID-backed human** (or a Selfie-Check-tier human — the proof carries the assurance tier), *(2)* the **effective scope and budget ceiling** at the leaf, *(3)* the chain is **not revoked and not expired**, and *(4)* a **context-scoped nullifier** that lets the verifier rate-limit or de-duplicate per human without linking across verifiers. It learns nothing else: not the human, not the root agent, not the intermediate agents, not the depth of the chain.

The Groth16 circuit is a **flattened PCD** (max depth 4, padded). What we **take** from adjacent research vs **leave** is §9.

## 1. Actors and vocabulary

| Term | Meaning |
|---|---|
| **Principal** | A human with a World ID (Orb = tier 2, Selfie Check = tier 1). |
| **Root agent** | The principal's first agent; its EVM wallet is registered in **AgentBook** via AgentKit. It holds a Baby-Jubjub **root key** bound on-chain to that wallet. |
| **Mandate** | A signed capability block: `{ childPk, scope, budgetCap, expiry, tier, epoch, parentHash }`. Mandates chain: root → agent → sub-agent → … |
| **Warrant** | The ZK proof a leaf agent presents for one request: proves a valid mandate chain from a registered root to the leaf, plus freshness and non-revocation. |
| **Context** | `H(verifierId, scopeTag, period)`; the nullifier is unique per (human, context). |
| **Verifier** | An x402 resource server, a smart contract gate, or another agent. |

## 2. Data structures

### 2.1 Root binding (public, on-chain, once)

```
MandateRegistry.bindRoot(bjjRootPk, tier, worldProofOrAgentBookRef)
```

- Caller must be an AgentBook-registered agent wallet (checked against the canonical World Chain AgentBook, or via the AgentKit verifier for cross-chain reads), *or* present a Selfie-Check World ID proof for tier 1.
- Stores leaf `L = Poseidon(bjjRootPk, tier, epoch=0)` in a **LeanIMT** (same tree as Semaphore v4). The **set of all leaves is the anonymity set**.
- `revoke()` from the same wallet increments `epoch` and replaces the leaf → every proof built on the old leaf fails. This is **cascade revocation** of the entire tree in one transaction.

### 2.2 Mandate block (off-chain, signed)

```
Mandate {
  childPk:    BabyJubjub point          // the delegatee's key
  scope:      uint64 bitmask            // capability bits (translate, fetch, trade…) — attenuation = subset
  budgetCap:  uint64 (micro-USD)        // ceiling; attenuation = ≤ parent
  expiry:     uint64 unix seconds       // attenuation = ≤ parent
  tier:       uint8                     // inherited from root leaf, cannot increase
  epoch:      uint32                    // copied from root leaf at issuance
  parentHash: Field                     // Poseidon hash of the parent mandate (0 for the root block)
  humanTag:   Field (secret, transmitted to child over an encrypted channel, not in the hash tree's public part)
}
sig = EdDSA_Poseidon(parentSk, Poseidon(all fields except humanTag) )
```

- The root block is signed by the **root key**; each following block by the **previous child**.
- `humanTag = Poseidon(rootSecret, "warrant/tag")` is generated once by the root and handed down with every mandate. It never touches a chain or a verifier. It lets *any* leaf derive `nullifier = Poseidon(humanTag, context)` — the same value across all of a human's agents — so a verifier can enforce "3 free calls per human" even when it's talking to 30 different sub-agents, without learning who the human is.
- Poseidon uses **disjoint domain tags** (BIP-340-style, Poseidon not SHA): `warrant/tag`, `warrant/mandate`, `warrant/nullifier`, `warrant/leaf`. Do not hash mixed-length tuples without a tag.

### 2.3 Warrant (the proof)

Public inputs: `merkleRoot, contextHash, nullifier, effectiveScope, effectiveBudgetCap, minExpiry (= now), tier, requestHash`.
Private inputs: `rootPk, epoch, merkleDepth, merkleIndex, siblings[MAX_DEPTH], mandates[0..D-1], sigs[0..D-1], enabled[D], humanTag, leafSk`. Membership is Semaphore v4 `BinaryMerkleRoot` (single `index`, not `pathIndices[]`). See `docs/05-implementation-plan.md` for measured constraint counts.

## 3. The circuit (Noir or circom; fixed max depth D = 4, padded)

```
1. tagC = Poseidon(DST_tag, humanTag)
   leaf = Poseidon(DST_leaf, rootPk, tier, epoch) ; assert MerkleVerify(leaf, path) == merkleRoot
2. for i in 0..D:
     parentHash_0 = 0 ; parentHash_i = H(mandate_{i-1})
     M_i = Poseidon(DST_mandate, childPk, scope, budget, expiry, tier, epoch, parentHash_i, tagC)
     if enabled[i]:
        assert EdDSAVerify(pk_{i-1} (pk_{-1} = rootPk), M_i, sig_i)
        assert scope ⊆ parent.scope ; budget ≤ parent.budget ; expiry ≤ parent.expiry
     else: padding (on-curve dummy keys)
3. leafPk = last-enabled childPk
4. assert EdDSAVerify(leafPk, requestHash)          ; binds this proof to this exact HTTP request / tx
5. assert minExpiry ≤ last-enabled expiry
6. effectiveScope / effectiveBudgetCap = last-enabled hop
7. nullifier = Poseidon(DST_nullifier, humanTag, contextHash)
```

Cost (measured on WP2 product circuit): **59,837** constraints; Groth16 prove ~**1.8 s** in CI-local runs. Public inputs stay 8. zkey ~**28 MB** (do not commit). Domain tags and `tagC` inside every mandate close quota-rotation. If time allows, Noir + UltraHonk avoids the trusted setup (still not PQ by itself).

Why `requestHash` matters: the proof is not a bearer token. Replaying it against a different request fails. Pinned formula (spike 16): `requestHash = keccak256(method|path|nonce|merkleRoot|amount|payTo|bodyHash) mod r` (`r` = bn254 scalar field). The leaf EdDSA-signs that field. The x402 hook requires `publicSignals[7]` to equal the live challenge.

**Seal-close (take this):** after a successful verify, consume `(nullifier, requestHash)` — a single-use seal around this challenge (no extra public). A copied proof cannot be replayed against the same 402 nonce. Free-tier **quota** still counts by `nullifier` alone (three calls, three distinct challenges). Do not consume `nullifier` by itself or the free tier dies after one call.

## 4. On-chain components (Base Sepolia or World Chain Sepolia; mirrored on Hedera testnet EVM for the Hedera track)

- **`MandateRegistry.sol`** — LeanIMT group of root leaves; `bindRoot`, `revoke` (epoch bump), root history with expiry window (Semaphore pattern so in-flight proofs survive a tree update); `verifyWarrant(proof, publics)` calling the Groth16/Honk verifier; `NullifierRegistry` per `(verifier, context)` for on-chain gates.
- **`WarrantGate.sol`** — a reusable modifier/contract: `onlyWarrant(scopeBits, minTier)`. Demo uses: (a) an ERC-8004 **Validation Registry** validator that records "human-backed, scope X" as a validation response (tag `warrant`), (b) an optional Uniswap v4 Permissioned-Pool-style `IAllowlistChecker` or CCA `IValidationHook` so a *sub-agent* can trade only with a warrant (stretch goal).
- **ENSv2 (Sepolia):** the principal's root agent is a name under a **custom `PermissionedRegistry`** we deploy (e.g., `agents.<name>.eth`), sub-agents are subnames. We map Warrant scope bits onto **Enhanced Access Control roles** of that registry, so the public, human-readable version of the tree lives in ENSv2 with EAC's built-in attenuation (you can only grant roles you hold the admin role for). ENSIP-25 records bind each agent name to its ERC-8004 id; ENSIP-26 records advertise the sub-agent's endpoint. Revocation on `MandateRegistry` also fires `unregister` on the subname via the registrar role. This is the **transparency mode**; Warrant proofs are the **privacy mode** — same capability format, two backends. (Only the principal decides which agents are visible.)

## 5. Off-chain components

- **`@warrant/core`** (TypeScript): key generation (BJJ), `createMandate`, `delegate` (attenuation checked client-side too), `prove`, `verify`.
- **`@warrant/x402`**: middleware for Hono/Express that extends the x402 v2 `402` challenge with a `warrant` extension (mirroring AgentKit's `agentkit` header). Policy DSL: `{ requireTier: 1, requireScope: ['translate'], freeCallsPerHuman: 3, priceAfter: '$0.002', budgetEnforce: 'soft' }`. Verifies the proof (snarkjs, ~10 ms), checks `merkleRoot` against the registry via RPC (cached), records the nullifier, and only then falls through to normal x402 payment (Blocky402 on Hedera or Circle Gateway Nanopayments on Arc/Base).
- **`@warrant/agent`**: a `fetch` wrapper (`warrant.fetch`) plus a **skill file** (SKILL.md) so Claude/Cursor/OpenClaw agents can adopt it without code changes; a CLI: `warrant keygen`, `warrant bind-root`, `warrant delegate --to <pk> --scope translate,fetch --budget 2.00 --ttl 1h`, `warrant revoke`.
- **Dashboard** (Next.js): **Astryx** for components ([getting started](https://astryx.atmeta.com/docs/getting-started)); **IBM Carbon** for design language ([carbondesignsystem.com](https://carbondesignsystem.com/)). Private mandate tree, per-context spend, destructive **Revoke**, and a nameless verifier log. Theme tokens follow Carbon g10 (optional g100); do not import `@carbon/react`.
- **Hedera service**: `POST /translate` gated by Warrant + x402 (`exact` HBAR via Blocky402 testnet facilitator). Every accepted warrant is mirrored to an **HCS topic** as `{nullifier, scope, tier, txId}` → a public, privacy-preserving audit trail (bonus criterion on the Hedera track). Agent identity for the service itself: ERC-8004 on Hedera testnet or **HCS-14** UAID.
- **The Graph** (optional, not one of the 3 partner picks): subgraph over `MandateRegistry` + ERC-8004 for the dashboard's "ecosystem" tab.

## 6. Budget: what's enforced where (be honest on stage)

Anonymity and exact per-human budget accounting are in tension (exact accounting needs a linkable counter). Warrant does three layered things:

1. **Ceiling in the proof** — `effectiveBudgetCap` is a cryptographically enforced *maximum price per call* the leaf may accept. A sub-agent with a $2 cap can never authorize a $5 call. Siblings can each inherit the full parent cap. That is **not** UTXO conservation; say so on stage.
2. **Per-context spend** — the verifier accumulates spend per `nullifier` within `context` (e.g., per day). Linkable *only within that verifier's context*, by design; unlinkable across verifiers. The three free calls at one origin are linkable to each other (a counter, not Privacy Pass ARC).
3. **Hard wallet limits** — funds live in a per-sub-agent wallet funded by the parent with exactly its budget (Circle Agent Wallet policy, Privy policy, or an HTS allowance). The chain-of-custody is private; the money is public. This is the same trade-off ACTA accepts.

## 7. Threat model and limitations

- **Compromised sub-agent key:** can spend within its mandate until expiry or root revocation; cannot widen scope; cannot forge a longer chain (needs parent signatures). Mid-tree revocation without touching the root is a known gap — mitigated by short TTLs on sub-mandates (minutes to hours). v2 is a **live-mandate forest** (delete the node; every hop proves inclusion), not Lightning-style punishment secrets.
- **Leaf sees the chain:** the Groth16 witness includes every parent mandate. The *verifier* does not. Recursive / PCD proving is how descendants stop seeing intermediates (ePrint 2026/1855). Not this week's circuit.
- **Leaked `humanTag`:** allows *linking* a human's nullifiers, never forging authority. Rotate by re-binding the root.
- **Anonymity set:** equals the number of bound roots. On day one that is our test users; the real set is every AgentBook agent that binds a key. State this plainly; it is the same bootstrapping every Semaphore app faces.
- **Trusted setup:** Groth16 needs one; use a Semaphore-style ceremony or switch to Honk. For a hackathon, a local powers-of-tau is acceptable if disclosed.
- **Verifier collusion:** two verifiers cannot link a human unless they share a context (they shouldn't) — nullifiers are context-scoped.
- **World ID beta status:** AgentKit is a limited beta and Selfie Check is beta; the World track requires a *feedback document* — we will produce one as a by-product.

## 8. Why it maps to the newest research

- It is a concrete answer to ACTA's open questions on **recursive OBO delegation** and **private trust graphs**, using ACTA's own vocabulary (policy registry, `ICircuitVerifier`, context nullifiers, personhood credentials).
- It reuses the "Obf(P) signs, contract verifies" interface from Vitalik's obfuscation post at the *authorization* layer: verifiers never see the program (the tree), only signed/proven outputs.
- It anticipates the roadmap: the Semaphore-style circuit is proof-system agnostic; swapping in a hash-based, post-quantum backend is the same `ICircuitVerifier` swap ACTA envisions.

## 9. What we take (and what we do not)

From DAC papers and PPP: **only what upgrades this mechanism without a second protocol.**

| Take | Where | Circuit? |
|---|---|---|
| Call it a DAC; 2026/1855 is EUDI wallets, we are agent OBO | Pitch, Q&A | No |
| Flattened PCD, D=4 | Pitch, this section | Already |
| Seal-close `(nullifier, requestHash)` | x402 hook / `INullifierStore` | No |
| Poseidon domain tags | `@warrant/core` hashes | No |
| Budgets are ceilings, not coins | Stage talk, §6 | No |
| Live-set forest + key tweaks + budget coins | Stage 2 | Yes — later |
| Recursive proving so the leaf does not hold the chain | Stage 2 | Yes — later |
| Privacy Pass ARC as unlinkable free-tier sidecar | Stage 2 | No |

**Do not take:** PPP streams/lattices, pairing DAC rewrite, proxy signatures (one hop, non-transferable).
