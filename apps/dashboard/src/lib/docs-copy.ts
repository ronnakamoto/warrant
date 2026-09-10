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
  alt: "You authorize, copy a skill into your bot, and the bot calls a shop. Hops stay private and only get narrower. Groth16 carries eight public signals. The shop never sees your name. Fire bumps the epoch and every hop dies.",
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
            dd: "A Groth16 proof that this request is authorized by a live leaf, through a chain of hops that only got narrower, bound to this shop challenge. It is not a session cookie and not your MetaMask key.",
          },
          {
            dt: "Root",
            dd: "The Baby Jubjub public key bound to your MetaMask wallet on MandateRegistry. One wallet, one root. Authorize again mints another off-chain chain under that same leaf.",
          },
          {
            dt: "Leaf",
            dd: "Poseidon5(`warrant/leaf`, pkX, pkY, tier, epoch). That field sits in a LeanIMT. Fire bumps epoch, so the old leaf is gone from the live root.",
          },
          {
            dt: "Hop",
            dd: "One signed handoff of a mandate: A signs permission over to B. B can only receive a subset of scope, and a budget and expiry that do not grow. One proof attests at most four hops (`D=4`). Unused slots are dummy hops.",
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
            dd: "A third hop your bot can hire. It only gets memo (`FETCH`). It cannot translate. It cannot hire. Fire kills it too. Translate-only warrants cannot hire.",
          },
          {
            dt: "Fire",
            dd: "On-chain revoke: epoch += 1, leaf replaced, `currentRoot` moves. Every hop under you dies. The next prove is 403 because the merkle root moved, not because a cookie expired.",
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
            "Each enabled hop, plus the request, is verified in-circuit. About five EdDSAPoseidon verifiers on the product circuit (four mandate slots + one request).",
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
            "Product circuit `WarrantFull(4, 20)` in `circuits/warrant.circom`. ~59,837 constraints. Prove ~2s. zkey ~28 MB, never committed.",
          ],
          [
            "Merkle tree",
            "LeanIMT / Semaphore Group",
            "`BinaryMerkleRoot` with `MAX_MERKLE_DEPTH = 20`. That depth is the anonymity set, not agents per warrant.",
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
        text: "Groth16 needs a circuit-specific proving key. Testnet artifacts come from a solo phase-2 on Hermez `powersOfTau28_hez_final_16.ptau` (pot16, enough for < 2^16 constraints), then a public beacon finalize. That is not a multi-party ceremony. It is said plainly: fine on testnet, not production-grade MPC. If operator entropy from the contribution leaks, proofs for this circuit can be forged. Beacon finalize does not heal a leaked prior contribution.",
      },
      {
        kind: "table",
        caption: "Released testnet artifacts (tag artifacts-groth16-v1)",
        headers: ["File", "SHA-256"],
        rows: [
          [
            "`warrant_final.zkey`",
            "7f283d2b461512f444dc339dc40318277820d968bcffe3e562878e34839e16fa",
          ],
          [
            "`warrant_vkey.json`",
            "cf95bb6c8717503fdca3651fd867653f52121ebcfcc390313ed8c943bed883e4",
          ],
        ],
      },
      {
        kind: "p",
        text: "The Solidity verifier is generated (`contracts/src/WarrantVerifier.sol`) and committed. Hand-editing it is a defect. The zkey is not in git. Shops verify with the vkey only. Provers (this host’s prove worker, or a local CLI) need wasm + zkey.",
      },
      {
        kind: "note",
        text: "This stack (Groth16 + Baby Jubjub EdDSA) is not post-quantum. A later `IVerifier` swap to a transparent setup (for example Honk) is the intended path when pairing-based trust is unacceptable. Dummy zeros as public keys are also forbidden: disabled EdDSA slots still need on-curve Baby Jubjub points, so dummy hops reuse a real Identity.",
      },
    ],
  },
  {
    id: "circuit",
    title: "The circuit",
    blocks: [
      {
        kind: "p",
        text: "Live Groth16 is `WarrantFull(D=4, MAX_DEPTH=20)` in `circuits/warrant.circom`. `warrant_lean.circom` is the membership-and-attenuation subset with no EdDSA; it is not what shops verify. Public inputs stay the same eight-tuple on both, so the verifier ABI does not move.",
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
          ["0", "`merkleRoot`", "Must equal MandateRegistry `currentRoot`. Stale or fired roots abort."],
          ["1", "`contextHash`", "Scopes the nullifier. Not your name."],
          ["2", "`nullifier`", "Per-human-per-context id for quota and the replay seal. Not a wallet."],
          ["3", "`effectiveScope`", "Last-enabled hop’s uint64 capability bits."],
          ["4", "`effectiveBudgetCap`", "Last-enabled hop’s budget ceiling. Not a conserved coin."],
          ["5", "`minExpiry`", "Shop’s `now`. Circuit checks `minExpiry ≤` last-enabled expiry."],
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
          "Hops are an enabled prefix: `enabled[i] ∈ {0,1}`, hop 0 is on, and once a hop is off the rest stay off. Typical hosted mint is `[1,1,0,0]`. A helper is `[1,1,1,0]`.",
          "Attenuation: child scope bits ⊆ parent (64-bit `ScopeSubset`). When a hop is enabled, budget and expiry are ≤ parent. Scope subset is checked along the pad even for dummy hops.",
          "Each enabled hop: mandate hash as above, `parentHash_0 = 0`, `parentHash_i = hash(mandate_{i-1})`, EdDSA-Poseidon by the previous public key (hop 0 by the root).",
          "Last-enabled child key EdDSA-signs `requestHash`.",
          "`minExpiry ≤` last-enabled expiry. `effectiveScope` and `effectiveBudgetCap` mux from the last enabled hop.",
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
        text: "D=4 and dummy hops",
      },
      {
        kind: "p",
        text: "The circuit is a fixed-size gadget. One proof is one path, at most four hops. A fifth handoff in that same chain cannot satisfy the R1CS. Shorter chains pad with `enabled=0`. Dummy keys must be on-curve; Ax=0 fails because curve operations are not fully gated. The prover reuses a real Identity for padding.",
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
        text: "A warrant is a leaf under a root. Your MetaMask binds that root on Base Sepolia (chain id 84532) in a LeanIMT. Off-chain hops can only get narrower. The leaf proves membership, the chain, and that this request was the one the shop challenged.",
      },
      {
        kind: "table",
        caption: "Base Sepolia deployments",
        headers: ["Contract", "Address"],
        rows: [
          [
            "MandateRegistry",
            "`0x103749E5529C3Ce31A1EB8e0657280AaE7e9dA89`",
          ],
          [
            "WarrantVerifier",
            "`0xf63f8055FA522bb5Ae243FF713cB889f02c4f742`",
          ],
          [
            "WarrantGate",
            "`0xb0a73736C5A1eFa09589aB3E30C3201D267A24A1`",
          ],
        ],
      },
      {
        kind: "h3",
        text: "MandateRegistry",
      },
      {
        kind: "p",
        text: "LeanIMT of Poseidon5 leaves. No Groth16 in this contract. Personhood is never checked on-chain. Bind inserts epoch 0. Revoke bumps epoch and `_update`s the leaf so `currentRoot` changes. Resource servers on this host require `merkleRoot == currentRoot`. They do not accept historical roots (`isKnownRoot` exists on the design, not in the v1 x402 hook), so an in-flight proof dies as soon as you Fire.",
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
        text: "WarrantVerifier is the snarkjs-generated Groth16 verifier. WarrantGate composes registry + verifier for optional on-chain `onlyWarrant` checks. The product path is the x402 hook, not a gate transaction on every shop call. A Studio subgraph indexes `Bound` / `Revoked` from block 46413332 for the Registry page. That graph is a data plane, not a second mandate model.",
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
          ["2", "orchestrator → translator", "Your bot’s leaf key. Budget ceiling 200_000. Last hop of a mint. Expiry is now + 30 minutes."],
          ["3", "translator → helper", "Only if the bot hires, and only if hop 2 includes `FETCH`. Budget ceiling 20_000. Same expiry. Re-hire deletes the previous helper session."],
          ["4", "(dummy)", "Padding. Enabled bit off. On-curve dummy key."],
        ],
      },
      {
        kind: "p",
        text: "A helper cannot hire (`parentId` → 403 scope). A helper cannot translate. Fire on the parent kills the helper. Multiple live warrants per MetaMask are separate mints under the same bound root (`Fire this` / `Fire every`). That is not extra hops on one proof.",
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
        text: "Packages: `@ronnakamoto/warrant-core` (domain, hashes, prove/verify — no HTTP), `@ronnakamoto/warrant-x402` (shop factory + `warrantHono`), `@warrant/agent` in this clone (CLI + `warrant.fetch`). Do not call prove from a bot.",
      },
    ],
  },
  {
    id: "diagrams",
    title: "Diagrams",
    blocks: [
      {
        kind: "p",
        text: "The picture is the protocol. Hops stay on the left. Eight public signals cross Groth16. The shop only ever sees the right. Fire kills the leaf. The four sketches below are the same loop, smaller.",
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
          "Mid-tree revoke without touching the root is a known gap. Mitigation on this host is a 30-minute mandate TTL. v2 would be a live-mandate forest, not Lightning-style punishment secrets.",
          "The leaf sees the chain: the Groth16 witness includes every parent mandate. The verifier does not. Recursive / PCD proving is how descendants would stop seeing intermediates. Not this circuit.",
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
        text: "Node 20+. Put the Groth16 vkey on disk. This package does not include a zkey. `initializeWarrantShop` after construct. Registering ExactHedera happens inside the factory before initialize.",
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
  const parts = [DOCS_COPY.title, DOCS_COPY.lead, DOCS_COPY.youHaveABot];
  for (const section of DOCS_SECTIONS) {
    parts.push(section.title);
    for (const block of section.blocks) parts.push(blockText(block));
  }
  return parts.join("\n");
}
