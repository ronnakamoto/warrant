export type DocsDlItem = { dt: string; dd: string };

export type DocsBlock =
  | { kind: "p"; text: string }
  | { kind: "h3"; text: string }
  | { kind: "ul"; items: string[] }
  | { kind: "ol"; items: string[] }
  | { kind: "dl"; items: DocsDlItem[] }
  | { kind: "table"; caption?: string; headers: string[]; rows: string[][] }
  | { kind: "pre"; text: string }
  | { kind: "note"; text: string }
  | { kind: "internal"; href: string; label: string; after: string };

export type DocsSection = {
  id: string;
  title: string;
  blocks: DocsBlock[];
};

export const DOCS_COPY = {
  title: "How Warrant works",
  lead: "You already have a bot. This is the key it carries when it leaves the chat and acts.",
  youHaveABot:
    "Grok, Hermes, OpenClaw — anything that can make an HTTP request. Meeting another bot is not acting. Acting is calling a shop, hiring a helper, spending. That is where a human has to stay in authority without staying in the message.",
} as const;

export const DOCS_EXCALIDRAW = {
  title: "How a warrant acts",
  src: "/protocol/how-warrant-works.png",
  alt: "You authorize, copy a skill into your bot, and the bot calls a shop. Hops stay private and only get narrower. Groth16 carries eight public signals. The shop never sees your name. Fire helper deletes hop 3. Fire this deletes hop 2. Fire every bumps the identity epoch and every hop dies.",
} as const;

export const DOCS_DIAGRAMS = [
  { id: "loop", title: "The loop" },
  { id: "chain", title: "The chain" },
  { id: "sees", title: "Who sees what" },
  { id: "fire", title: "Fire" },
] as const;

export const DOCS_SECTIONS: DocsSection[] = [
  {
    id: "you",
    title: "You already have a bot",
    blocks: [{ kind: "p", text: DOCS_COPY.youHaveABot }],
  },
  {
    id: "do",
    title: "What you do",
    blocks: [
      {
        kind: "p",
        text: "Open Warrant. Authorize with MetaMask. Copy one paragraph into the bot you already have. The bot calls a shop we operate, or a shop someone wrapped with the kit. When you are done, Fire. The next call dies. The shop still does not know it was you.",
      },
    ],
  },
  {
    id: "saw",
    title: "What each party saw",
    blocks: [
      {
        kind: "p",
        text: "You signed. You kept the EVM key. You can Fire from a new browser with the same MetaMask. The bot never got that key.",
      },
      {
        kind: "p",
        text: "Warrant sees the witness. The hosted helper builds the Groth16 proof for a cloud bot so that bot never downloads a zkey. That is the honesty of this host. A local CLI prove does not show us the witness.",
      },
      {
        kind: "p",
        text: "The chat can see the bearer. Treat that paragraph like a key. Anyone who has it can act until you Fire.",
      },
      {
        kind: "p",
        text: "The shop sees a nullifier, a live root, a scope, a budget ceiling, an expiry, a tier, and a hash of this exact request. Eight public signals. Not your name. Not your address. Not the hops.",
      },
    ],
  },
  {
    id: "words",
    title: "Words",
    blocks: [
      {
        kind: "p",
        text: "These are the objects. Land stays quiet. This book names them.",
      },
      {
        kind: "dl",
        items: [
          {
            dt: "Warrant",
            dd: "A Groth16 proof that this request is authorized by a live leaf and its immediate parent, through hops that only got narrower, bound to this shop challenge. It is not a session cookie and not your MetaMask key.",
          },
          {
            dt: "Root",
            dd: "MandateRegistry `currentRoot`: one LeanIMT over the identity leaf and every enabled mandate hash. Your MetaMask binds one Baby Jubjub public key. Authorize again recovers the same hop tree under that identity leaf. It fails if those hops are dead.",
          },
          {
            dt: "Leaf",
            dd: "Poseidon5(`warrant/leaf`, pkX, pkY, tier, epoch). That identity field sits in the forest next to each enabled mandate hash (`warrant/mandate`). `Fire every` bumps epoch so the old identity leaf is gone. `Fire this` / `Fire helper` tombstone a mandate hash (value 0) and leave the identity leaf in place.",
          },
          {
            dt: "Hop",
            dd: "One signed handoff of a mandate: A signs permission over to B. B can only receive a subset of scope, and a budget and expiry that do not grow. The live circuit is two always-on hops. The leaf sees the immediate parent, not the chain.",
          },
          {
            dt: "Mandate",
            dd: "The signed message for one hop. Poseidon10 over domain `warrant/mandate`, child key, scope, budget, expiry, tier, epoch, parentHash, and a tag commitment. Hop 0 uses parentHash = 0 and is signed by the root key.",
          },
          {
            dt: "Shop",
            dd: "An HTTP resource that verifies the warrant, then does the job (leave a memo, translate, or a route you wrap yourself). We do not host a reverse proxy and we do not protect a URL you paste.",
          },
          {
            dt: "Memo",
            dd: "A public note written to a Hedera testnet HCS topic. Anyone with the HashScan link can read the text. They still do not learn who authorized the bot. Scope bit `FETCH = 2`.",
          },
          {
            dt: "Helper",
            dd: "A third hop your bot can hire. It only gets memo (`FETCH`). It cannot translate. It cannot hire. `Fire helper` deletes that hop. `Fire this` deletes the parent bot and the helper. Translate-only warrants cannot hire.",
          },
          {
            dt: "Fire",
            dd: "Only the MetaMask that bound the root. `Fire helper` is `revokeMandate` on hop 3 — helper 403, parent live. `Fire this` is `revokeMandate` on hop 2 — that warrant and its helper 403; other warrants under the same wallet stay live. `Fire every` bumps the identity epoch and replaces the identity leaf — every hop dies. Any of those moves `currentRoot`, so a copied bearer dies as `root_revoked` (the shop pins `currentRoot` before Groth16). `invalid_proof` is a Groth16 fail against a still-accepted root — a later prove that names today's root but still claims a deleted hop cannot be built honestly.",
          },
        ],
      },
    ],
  },
  {
    id: "crypto",
    title: "Cryptography",
    blocks: [
      {
        kind: "p",
        text: "Warrant is a Groth16 membership-and-delegation proof. The shop verifies eight public signals. The hops stay in the witness.",
      },
      {
        kind: "h3",
        text: "Curves and proof system",
      },
      {
        kind: "table",
        headers: ["Piece", "Choice", "Why it is here"],
        rows: [
          [
            "Agent keys",
            "Baby Jubjub",
            "Semaphore Identity. Same curve as EdDSA-Poseidon inside the circuit.",
          ],
          [
            "Signatures",
            "EdDSA-Poseidon",
            "Each always-on hop, plus the request, is verified in-circuit. Three EdDSAPoseidon verifiers on the product circuit (two mandate slots + one request).",
          ],
          [
            "Hashes in-circuit",
            "Poseidon (t=2,3,5,10)",
            "Domain-tagged. Must match circomlib Poseidon and poseidon-solidity on the registry leaf.",
          ],
          [
            "Request binding",
            "keccak256, then mod r",
            "Outside the SNARK. Binds the proof to one HTTP challenge. r is the BN254 scalar field.",
          ],
          [
            "SNARK",
            "Groth16 over BN254",
            "Product circuit `WarrantHop(20)` in `circuits/warrant.circom`. 39,424 non-linear / 61,111 snarkjs constraints (pot16). zkey never committed. Solo ceremony tag `artifacts-groth16-v3`.",
          ],
          [
            "Merkle tree",
            "LeanIMT / Semaphore Group",
            "`BinaryMerkleRoot` with `MAX_MERKLE_DEPTH = 20`. One forest: identity leaf plus each enabled mandate hash. Depth is tree height, not agents per warrant. `size` counts every insert, so it is larger than the number of bound wallets.",
          ],
        ],
      },
      {
        kind: "p",
        text: "BN254 scalar field r = 21888242871839275222246405745257275088548364400416034343698204186575808495617. Every public signal and every Poseidon output is in this field. keccak256 digests are reduced mod r before they become `requestHash`.",
      },
      {
        kind: "h3",
        text: "Domain-separated Poseidon",
      },
      {
        kind: "p",
        text: "Each domain string is UTF-8 interpreted as a big-endian field element (BIP-340-style tagging, Poseidon not SHA). Circom (`circuits/lib/domains.circom`) and TypeScript (`@ronnakamoto/warrant-core`) must stay in lockstep with the registry’s `DOMAIN_LEAF`.",
      },
      {
        kind: "table",
        caption: "Poseidon domain tags",
        headers: ["ASCII", "Arity", "Formula"],
        rows: [
          ["`warrant/tag`", "2", "`tagC = Poseidon(DST_tag, humanTag)`"],
          ["`warrant/leaf`", "5", "`leaf = Poseidon(DST_leaf, pkX, pkY, tier, epoch)`"],
          [
            "`warrant/mandate`",
            "10",
            "`Poseidon(DST_mandate, childPkX, childPkY, scope, budget, expiry, tier, epoch, parentHash, tagC)`",
          ],
          [
            "`warrant/nullifier`",
            "3",
            "`nullifier = Poseidon(DST_nullifier, humanTag, contextHash)`",
          ],
        ],
      },
      {
        kind: "p",
        text: "`humanTag` is a private field sampled at bind. It never appears in the public signals. Binding `tagC` into every mandate closes quota-rotation: you cannot keep the same chain and swap the tag to mint a fresh nullifier. A leaked `humanTag` lets someone link your nullifiers inside one `contextHash`. It does not let them forge a mandate.",
      },
      {
        kind: "p",
        text: "`contextHash` is also sampled at bind. Nullifiers are scoped to that context. Two shops that do not share a context cannot link the same human by nullifier. On this host each mint gets its own pair.",
      },
      {
        kind: "h3",
        text: "Ceremony",
      },
      {
        kind: "p",
        text: "Groth16 needs a circuit-specific proving key. The live circuit `WarrantHop(20)` is 39,424 non-linear / 61,111 snarkjs constraints, so testnet artifacts come from a solo phase-2 on a pot16 Powers-of-Tau (2^16 = 65536). That is not a multi-party ceremony. It is said plainly: fine on testnet, not production-grade MPC. If operator entropy from the contribution leaks, proofs for this circuit can be forged. Beacon finalize does not heal a leaked prior contribution.",
      },
      {
        kind: "table",
        caption: "Released testnet artifacts (tag artifacts-groth16-v3)",
        headers: ["File", "SHA-256"],
        rows: [
          [
            "`warrant_final.zkey`",
            "b97ca5dec3b187b59b513b8aaf70b7447c0ec35e584a7065c175ec2f3b50abd2",
          ],
          [
            "`warrant_vkey.json`",
            "6bbd75496678755487820a83f7184da784ccfb1bad1db1ad577535a25cdb2652",
          ],
          [
            "`warrant.wasm`",
            "8709811b852c70ca56c094953d60d6ad54e0538b9c3aa685ac2dabb6a493b30a",
          ],
        ],
      },
      {
        kind: "p",
        text: "The Solidity verifier is generated (`contracts/src/WarrantVerifier.sol`) and committed. Hand-editing it is a defect. The zkey is not in git. Shops verify with the vkey only. Provers (this host’s prove worker, or a local CLI) need wasm + zkey.",
      },
      {
        kind: "note",
        text: "This stack (Groth16 + Baby Jubjub EdDSA) is not post-quantum. A later `IVerifier` swap to a transparent setup (for example Honk) is the intended path when pairing-based trust is unacceptable.",
      },
    ],
  },
  {
    id: "circuit",
    title: "The circuit",
    blocks: [
      {
        kind: "p",
        text: "Live Groth16 is `WarrantHop(20)` in `circuits/warrant.circom` (`MAX_MERKLE_DEPTH = 20`). The leaf sees the immediate parent, not the chain. This is not pairing recursion. `warrant_lean.circom` is the membership-and-attenuation subset with no EdDSA; it is not what shops verify. Public inputs stay the same eight-tuple on both, so the verifier ABI does not move.",
      },
      {
        kind: "h3",
        text: "Eight public signals",
      },
      {
        kind: "p",
        text: "Slot indices are frozen in `@ronnakamoto/warrant-core`. Adding a ninth is a type error and a new ceremony.",
      },
      {
        kind: "table",
        caption: "publicSignals[0..7]",
        headers: ["i", "Name", "What the shop learns"],
        rows: [
          ["0", "`merkleRoot`", "Must equal MandateRegistry `currentRoot`. After any Fire the copied bearer's root is stale → `root_revoked`. Groth16 fail against a still-accepted root → `invalid_proof`."],
          ["1", "`contextHash`", "Scopes the nullifier. Not your name."],
          ["2", "`nullifier`", "Per-human-per-context id for quota and the replay seal. Not a wallet."],
          ["3", "`effectiveScope`", "Leaf hop’s uint64 capability bits."],
          ["4", "`effectiveBudgetCap`", "Leaf hop’s budget ceiling. Not a conserved coin."],
          ["5", "`minExpiry`", "Shop’s `now`. Circuit checks `minExpiry ≤` leaf expiry."],
          ["6", "`tier`", "Personhood floor. This host binds `tier=0`. Not a World ID proof."],
          ["7", "`requestHash`", "This exact challenge. A copied proof on a different request fails."],
        ],
      },
      {
        kind: "h3",
        text: "What the circuit checks",
      },
      {
        kind: "ol",
        items: [
          "`tagC = Poseidon(DST_tag, humanTag)`. `leaf = Poseidon(DST_leaf, rootPk, tier, epoch)`. `BinaryMerkleRoot` of that leaf against `merkleRoot` (single index, siblings padded to 20).",
          "Live forest: each always-on hop’s mandate hash is also a LeanIMT leaf in the same `currentRoot`. Fire a hop by `_remove` (tombstone 0). That moves `currentRoot`, so a copied bearer is `root_revoked`. A new witness that still names a tombstoned hop cannot satisfy the R1CS.",
          "Two always-on hops. The leaf sees the immediate parent, not the chain. `parentParentHash = 0` when the parent is the root; otherwise it is the parent’s parent hash. This is not pairing recursion.",
          "Attenuation: child scope bits ⊆ parent (64-bit `ScopeSubset`). The leaf’s budget and expiry are ≤ the immediate parent.",
          "Each hop: mandate hash as above, EdDSA-Poseidon by the previous public key (parent slot by the root when `parentParentHash = 0`).",
          "Leaf child key EdDSA-signs `requestHash`.",
          "`minExpiry ≤` leaf expiry. `effectiveScope` and `effectiveBudgetCap` are the leaf hop.",
          "`nullifier = Poseidon(DST_nullifier, humanTag, contextHash)`.",
        ],
      },
      {
        kind: "h3",
        text: "Scope bits",
      },
      {
        kind: "table",
        headers: ["Name", "Bit", "On this host"],
        rows: [
          ["`TRANSLATE`", "`1`", "Translate shop. Memo-only mint does not set it."],
          ["`FETCH`", "`2`", "Memo shop, echo, integrator fetch routes. Required to hire a helper."],
          ["`TRADE`", "`4`", "Exists on the bitmask. This host does not mint it."],
        ],
      },
      {
        kind: "p",
        text: "A shop’s policy is `requireScope ⊆ effectiveScope` and `tier ≥ minTier`. Widening a hop fails the witness. Siblings may each inherit the full parent budget ceiling — that is not UTXO conservation.",
      },
      {
        kind: "h3",
        text: "WarrantHop(20)",
      },
      {
        kind: "p",
        text: "The live circuit is two always-on hops at `MAX_MERKLE_DEPTH = 20`. The leaf sees the immediate parent, not the chain. A longer handoff is a later two-slot proof, not a padded gadget. This is not pairing recursion.",
      },
    ],
  },
  {
    id: "request",
    title: "Request binding",
    blocks: [
      {
        kind: "p",
        text: "The proof is not a bearer that works on any URL. The leaf key signs `requestHash`. The shop rebuilds that hash from the live x402 challenge and aborts on mismatch (`request_hash_mismatch`).",
      },
      {
        kind: "pre",
        text: "requestHash = keccak256(method|path|nonce|merkleRoot|amount|payTo|bodyHash)  mod  r",
      },
      {
        kind: "p",
        text: "The HTTP header is `warrant`. Value is JSON `{ proof, publicSignals }` with exactly eight signals. Malformed JSON or the wrong length is `malformed_warrant`.",
      },
      {
        kind: "p",
        text: "`path` and `nonce` are required. Empty defaults were a review finding: they would let a proof replay across requests. Default method is `POST`. Missing merkleRoot, amount, payTo, or bodyHash become empty strings in the preimage, then still hash.",
      },
      {
        kind: "p",
        text: "After a successful verify, the shop consumes the pair `(nullifier, requestHash)` — a single-use seal around this challenge. A copied proof cannot replay against the same 402 nonce. Free-tier quota, when a shop offers it, still counts by `nullifier` alone (three calls need three distinct challenges). Do not consume `nullifier` by itself or the free tier dies after one call. This host sets `freeCallsPerHuman = 0`, so the first shop call is a 402.",
      },
    ],
  },
  {
    id: "chain",
    title: "On-chain",
    blocks: [
      {
        kind: "p",
        text: "A warrant is an identity leaf plus its mandate hashes under one forest `currentRoot`. Your MetaMask binds the identity leaf on Base Sepolia (chain id 84532). Authorize and hire insert hop hashes. Off-chain hops can only get narrower. The proof shows identity membership, the leaf hop and its immediate parent in the same root, and that this request was the one the shop challenged.",
      },
      {
        kind: "table",
        caption: "Base Sepolia deployments",
        headers: ["Contract", "Address"],
        rows: [
          [
            "MandateRegistry",
            "`0x8704606Bde5E257dC009cCe55214Df70975f89c5`",
          ],
          [
            "WarrantVerifier",
            "`0x040b660Ac81cDd775660EDA2f535AF437782cA20`",
          ],
          [
            "WarrantGate",
            "`0x27B47a65F0E4BF3b45Bb38e020351FE6C18F2dE6`",
          ],
        ],
      },
      {
        kind: "h3",
        text: "MandateRegistry",
      },
      {
        kind: "p",
        text: "LeanIMT of Poseidon5 identity leaves and Poseidon mandate hashes. No Groth16 in this contract. Personhood is never checked on-chain. Bind inserts the identity leaf at epoch 0. The prove operator then `insertMandates` for hops 1 and 2 (hire inserts hop 3). `revokeMandate` tombstones one hop (`_remove` → 0). Identity `revoke` bumps epoch and `_update`s that wallet’s leaf. Resource servers on this host require `merkleRoot == currentRoot`. They do not accept historical roots (`isKnownRoot` exists on the design, not in the v1 x402 hook).",
      },
      {
        kind: "ul",
        items: [
          "If `operator != address(0)`: only the operator may `bindRoot` (this deployment). Closes permissionless public-key squatting on a public mempool. The hosted prove worker holds the bind key; you still hold Fire on the wallet.",
          "If `operator == address(0)`: permissionless self-bind, `tier` must be 0. Test/demo only.",
          "One wallet, one binding. The same leaf cannot be claimed under a second wallet (`LeafClaimed`).",
          "`ROOT_HISTORY_WINDOW` is 1 hour on the contract. Shops still pin `currentRoot` only.",
        ],
      },
      {
        kind: "p",
        text: "WarrantVerifier is the snarkjs-generated Groth16 verifier. WarrantGate composes registry + verifier for optional on-chain `onlyWarrant` checks. The product path is the x402 hook, not a gate transaction on every shop call. A Studio subgraph indexes `Bound` / `Revoked` / `MandateInserted` / `MandateRevoked` from block 46661760. That graph is a data plane, not a second mandate model.",
      },
    ],
  },
  {
    id: "hops",
    title: "Hops on this host",
    blocks: [
      {
        kind: "p",
        text: "Hosted mint is a 2-hop delegate. Names in the prove worker are implementation labels, not identities the shop sees.",
      },
      {
        kind: "table",
        headers: ["Hop", "From → to", "Role"],
        rows: [
          ["1", "alice → orchestrator", "Root signs the first mandate. Scope is the bits you picked (memo, translate, or both). Budget ceiling 2_000_000."],
          ["2", "orchestrator → translator", "Your bot’s leaf key. Budget ceiling 200_000. Last hop of a mint. Expiry is now + 30 minutes. The leaf sees this immediate parent, not the chain."],
          ["3", "translator → helper", "Only if the bot hires, and only if hop 2 includes `FETCH`. Budget ceiling 20_000. Same expiry. Re-hire deletes the previous helper session. A new two-slot proof: the helper leaf sees hop 2 as the immediate parent."],
        ],
      },
      {
        kind: "p",
        text: "A helper cannot hire (`parentId` → 403 scope). A helper cannot translate. `Fire helper` deletes hop 3. `Fire this` deletes hop 2 (the bot and its helper die; other warrants under the same MetaMask stay live). `Fire every` bumps the identity epoch and every hop dies. Only the MetaMask that bound the root can Fire. This host already proves `WarrantHop(20)` (pot16, `artifacts-groth16-v3`).",
      },
      {
        kind: "p",
        text: "The desk session may last up to seven days (`GUEST_TTL_MS`) so you can Fire from another browser. The mandate expiry in the circuit is thirty minutes. After that the next prove fails `minExpiry` even if you have not Fired.",
      },
    ],
  },
  {
    id: "shops",
    title: "Shops and payment",
    blocks: [
      {
        kind: "p",
        text: "The first shop call is a 402. Hosted chat cannot invent payment. A machine agent with a funded Hedera testnet purse can pay ExactHedera. We do not sponsor the 402. We do not put a Hedera key on this site.",
      },
      {
        kind: "h3",
        text: "Authorize order in the shop",
      },
      {
        kind: "p",
        text: "Fixed pipeline in `@ronnakamoto/warrant-x402`. Missing header continues to 402. Abort reasons are 403. Grant is the free path when a shop still has quota.",
      },
      {
        kind: "ol",
        items: [
          "No `warrant` header → continue (402).",
          "Malformed header or public-signal count ≠ 8 → `malformed_warrant`.",
          "`merkleRoot` not `currentRoot` → `root_revoked` (checked before requestHash).",
          "Rebuilt challenge ≠ `requestHash` → `request_hash_mismatch`.",
          "Groth16 verify fails → `invalid_proof`.",
          "Policy: `requireScope` not ⊆ `effectiveScope`, or tier below floor → `policy`.",
          "Free quota by nullifier, if any remain → take `(nullifier, requestHash)` seal; already seen → `replay`; else grant.",
          "Quota exhausted → pay (402). Pay fallthrough must not seal: the client retries the same warrant after attaching ExactHedera.",
        ],
      },
      {
        kind: "h3",
        text: "What we operate",
      },
      {
        kind: "table",
        headers: ["Shop", "Job", "Notes"],
        rows: [
          [
            "Translate",
            "`POST /v1/translate`",
            "MyMemory + HCS audit of `{nullifier, scope, tier, txId}` — not your prose. Needs `TRANSLATE`.",
          ],
          [
            "Memo",
            "`POST /v1/memo`",
            "Public HCS note. Body text is public on HashScan testnet. Needs `FETCH`. Second topic (`HEDERA_MEMO_TOPIC_ID`), not the translate audit topic.",
          ],
          [
            "Echo",
            "`POST /v1/echo`",
            "In-repo factory proof, not a hosted proxy. Needs `FETCH`.",
          ],
        ],
      },
      {
        kind: "p",
        text: "Hedera testnet treasury used in the published deployment notes: account `0.0.10311260`. Translate HCS topic `0.0.10336558`. Memo uses a separate topic. Payment is Blocky402 ExactHedera, not an ETH transfer on Base.",
      },
    ],
  },
  {
    id: "host",
    title: "This host",
    blocks: [
      {
        kind: "p",
        text: "Testnet is the product. Console: https://warrant-beta.vercel.app — Authorize, Copy, Fire. The skill is the paragraph (`/skill.md`). Clone is optional local prove.",
      },
      {
        kind: "table",
        headers: ["Process", "Role", "Must not"],
        rows: [
          [
            "Dashboard (Next.js)",
            "UI. MetaMask bind/Fire. Guest BFF to prove + shops.",
            "Import `@ronnakamoto/warrant-core`. Hold a zkey. Hold a Hedera key. Sponsor 402.",
          ],
          [
            "Prove worker",
            "Mint 2-hop tree, bind leaf as operator, Groth16 for the Copy bearer, hire helper.",
            "Import x402 or Hedera. That split is load-bearing: a bot must not call prove; this site’s agent API proves for the Copy bearer.",
          ],
          [
            "Translate / memo shops",
            "Verify + resource. Persist nullifiers on disk.",
            "See hops, names, or wallets. Demo flags (`ALLOW_DEMO_*`, `FIXED_MERKLE_ROOT`) are boot-fatal in production.",
          ],
        ],
      },
      {
        kind: "p",
        text: "The guest BFF may see one warrant header in flight. It must not log it, persist it, or forward it anywhere except the translate shop or the memo shop we operate.",
      },
      {
        kind: "p",
        text: "Packages: `@ronnakamoto/warrant-core` (domain, hashes, prove/verify — no HTTP), `@ronnakamoto/warrant-x402` (shop factory + `warrantHono`), `@ronnakamoto/warrant` (ready / act via a JS runner already on PATH). Do not call prove from a bot.",
      },
    ],
  },
  {
    id: "diagrams",
    title: "Diagrams",
    blocks: [
      {
        kind: "p",
        text: "The picture is the protocol. Hops stay on the left. Eight public signals cross Groth16 (`WarrantHop`). The shop only ever sees the right. A proof opens the leaf and its immediate parent — not the chain above. Fire helper or Fire this deletes a hop. Fire every kills the identity leaf. The four sketches below are the same loop, smaller.",
      },
    ],
  },
  {
    id: "threats",
    title: "Threats and limits",
    blocks: [
      {
        kind: "p",
        text: "Warrant is a working construction for five predicates — `rooted`, `chained`, `attenuated`, `fresh`, `unrevoked` — not a complete ACTA stack, not a policy language, and not personhood. Capability claims (audit score, jurisdiction) stay outside this circuit.",
      },
      {
        kind: "ul",
        items: [
          "Compromised bot bearer: can act within its mandate until expiry or Fire. Cannot widen scope. Cannot forge a longer chain (needs parent signatures). Cannot Fire — that needs the MetaMask that bound the leaf.",
          "Live-mandate forest: one LeanIMT. Identity leaf plus each enabled mandate hash. Delete a hop with `revokeMandate`. Insert and delete move `currentRoot` — in-flight proofs already die on any bind. `WarrantHop(20)` is 39,424 non-linear / 61,111 snarkjs constraints. Solo ceremony is pot16. Said plainly.",
          "The leaf sees the immediate parent, not the chain. The Groth16 witness includes the parent mandate, not the hops above it. The verifier sees neither. This is not pairing recursion.",
          "Leaked `humanTag`: linking, never forging. Rotate by re-binding (this registry is one bind per wallet; Fire and a new wallet, or a later registry that allows re-bind after full exit).",
          "Anonymity set equals the number of bound roots. On day one that is test users. State this plainly.",
          "Trusted setup: solo ceremony, disclosed. Groth16 + Baby Jubjub is not post-quantum.",
          "Verifier collusion: two shops cannot link a human unless they share a context.",
          "Memo text is public. Privacy is who authorized, not what was written.",
          "Budgets are ceilings in the proof, not conserved coins. Hard money, when it exists, is a Hedera purse the agent already holds.",
        ],
      },
    ],
  },
  {
    id: "not",
    title: "What this is not",
    blocks: [
      {
        kind: "p",
        text: "Not a World ID proof. The host binds `tier=0`. Groth16 is a solo ceremony — fine on testnet, said plainly. Memo text you post is public on HashScan testnet. We do not host a reverse proxy and we do not protect a URL you paste. Wrap your own shop.",
      },
    ],
  },
  {
    id: "shop",
    title: "If you run a shop",
    blocks: [
      {
        kind: "p",
        text: "An integrator wraps their own Hono POST with `createWarrantShop` and `warrantHono` from `@ronnakamoto/warrant-x402`. The request body stays in their process. Do not call prove from a bot; this site’s agent API proves for the Copy bearer.",
      },
      {
        kind: "pre",
        text: `import { Hono } from "hono";
import { FETCH, SnarkjsVerifier } from "@ronnakamoto/warrant-core";
import {
  createWarrantShop,
  initializeWarrantShop,
  CurrentRootChecker,
  FileNullifierStore,
  FileChallengeStore,
  warrantHono,
} from "@ronnakamoto/warrant-x402";

const roots = new CurrentRootChecker({
  rpcUrl: process.env.BASE_SEPOLIA_RPC,
  registry: process.env.REGISTRY_ADDRESS,
});
const shop = createWarrantShop({
  route: "POST /v1/orders",
  description: "orders",
  policy: { requireScope: FETCH, minTier: 0, freeCallsPerHuman: 0 },
  amount: process.env.X402_AMOUNT ?? "100000",
  payTo: process.env.HEDERA_PAY_TO,
  verifier: SnarkjsVerifier.fromPath(process.env.WARRANT_VKEY_PATH),
  roots,
  getMerkleRoot: async () => (await roots.currentRoot()).toString(),
  nullifiers: new FileNullifierStore(process.env.WARRANT_NULLIFIER_PATH),
  challenges: new FileChallengeStore(process.env.WARRANT_CHALLENGE_PATH),
  defaultPath: "/v1/orders",
});
await initializeWarrantShop(shop);

const app = new Hono();
app.use("/v1/*", warrantHono(shop));
app.post("/v1/orders", handler);`,
      },
      {
        kind: "p",
        text: "Node 20+. Put the Groth16 vkey on disk from GitHub release `artifacts-groth16-v3` (`scripts/download-zkey.sh`). This package does not include a zkey. `initializeWarrantShop` after construct. Registering ExactHedera happens inside the factory before initialize.",
      },
      {
        kind: "internal",
        href: "/registry",
        label: "Registry",
        after: "The operator graph of bound roots lives on Registry. It is not the product.",
      },
    ],
  },
];

export const DOCS_NAV = DOCS_SECTIONS.map((section) => ({
  href: `#${section.id}`,
  label: section.title,
}));

function blockText(block: DocsBlock): string {
  switch (block.kind) {
    case "p":
    case "h3":
    case "pre":
    case "note":
      return block.text;
    case "ul":
    case "ol":
      return block.items.join("\n");
    case "dl":
      return block.items.map((item) => `${item.dt} ${item.dd}`).join("\n");
    case "table":
      return [
        block.caption ?? "",
        block.headers.join(" "),
        ...block.rows.map((row) => row.join(" ")),
      ].join("\n");
    case "internal":
      return `${block.label} ${block.after}`;
  }
}

export function docsBookText(): string {
  const parts: string[] = [DOCS_COPY.title, DOCS_COPY.lead, DOCS_COPY.youHaveABot];
  for (const section of DOCS_SECTIONS) {
    parts.push(section.title);
    for (const block of section.blocks) parts.push(blockText(block));
  }
  return parts.join("\n");
}
