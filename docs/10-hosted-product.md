# 10 — Hosted Warrant (production-grade testnet)

Warrant as an **Apple-simple hosted product on public testnets**: one site, no clone, no `.env`, no zkey ritual. This file locks the **security model**, the **first-run UX**, what we will not do, and a **phased build** that does not break the protocol pitch.

CLI, circuits, and `@warrant/x402` stay. Hosting is a new composition root, not a second mandate model. **Testnet is the product environment** (Base Sepolia + Hedera testnet). Mainnet is out of scope.

The quality bar: a stranger finishes hire → call → revoke in **90 seconds**, on **real** Groth16 / registry / Graph / Hedera rails, without talking to us.

Build **backwards from § Experience**. If a screen, log, or env var does not serve that feeling, it does not ship on the first path.

---

## Experience (the product)

The person we are designing for already has a bot — Grok, Hermes, OpenClaw, anything that can make an HTTP request. They are not here to configure a protocol. They have one human problem:

*My bot is about to act in the world. I want that. I want to take it back. I do not want the shop — or the other bot — to know it was me.*

That is the whole product. Everything else is plumbing.

Bots already meet bots. You stop being the Slack middle. Warrant is the next sentence: meeting is not acting. Acting is calling an API, hiring a sub-agent, spending, touching someone’s calendar tool. That is where a human has to remain in the authority — without remaining in the *message*.

We do not build another inbox, directory, or messenger. We build the **warrant** those bots carry when they act.

### The feeling

It should feel like handing your existing bot a key, watching it work — even hire a helper — then turning the key off and discovering every shop it visited never wrote your name down. Power, then privacy, in that order.

They should leave thinking: *My bot acted. I fired every agent under me. Nobody learned who I was.* Not: *I completed a Groth16 demo.* Not: *I became my bot’s lawyer.*

They already stopped being their bot’s messenger. Ours is *stop being your bot’s compliance department.*

### Two doors, one feeling

**Door 1 — they feel it (browser, 90 seconds).**  
They open a URL. The page is finished. Quiet. One sentence, one button. No wallet. They press **Try it.** A lock turns. They type *Good morning.* A real translation comes back. Small line: *The translator never learned your name.* Then **Stop every agent.** The next sentence is refused. *They’re done. You are still unknown.*

This door exists so a human *believes*. It is not how they live.

**Door 2 — they live it (their bot, every day).**  
Authorize issues a bearer for that leaf. They paste a skill that calls `{APP}/api/agent/translate` with `Authorization: Bearer …`. The BFF proves; the bot never sees a zkey. Fire everyone is `POST {APP}/api/agent/revoke`. Cloud bots need a public https origin — `127.0.0.1` only works for agents on that machine.

Same rails as Door 1. The product is Door 2. Door 1 is how Door 2 becomes obvious.

### What they never see

Wallet seed. Private key paste. zkey. wasm. merkle. epoch. LeanIMT. Baby Jubjub. Groth16. `humanTag`. Your Alice. A JSON mirror. A terminal. A faucet essay on the first screen.

Those things may exist behind **Registry** or in the CLI. They are not the product. Showing them first is a failure of taste. Their bot may hold a store. They should not have to.

### What must still be true (or the feeling is a lie)

The translation is real. The bind hit a public registry. The proof was checked. The revoke hit the chain. The next call died because of that revoke. The server log is a nullifier. Testnet is a public network, not a mock. Their Grok/Hermes bot used the same verify path as the browser Try.

If any of that is fake, they were entertained. They were not given Warrant.

### Work backwards

| They should feel | Therefore we build |
|---|---|
| “I already have a bot” | Hosted `TRANSLATE_URL` + a one-prompt skill (Grok / Hermes / OpenClaw / any HTTP) |
| “I didn’t set anything up” | Guest mint + prove worker for Door 1; bot path uses the same hosted prove or a local store the skill creates |
| “I’m not the messenger” | Bot ↔ API directly. Human only for Try-it belief and for *fire everyone* |
| “It actually translated” | MyMemory (or better). Never reverse-string |
| “The shop doesn’t know me” | Eight public signals only; footnote after the result |
| “I can take it all back” | On-chain revoke; every hop dies; next bot call 403 |
| “I wasn’t in someone else’s account” | New leaf, new wallet, not Alice |
| “Meeting ≠ acting” | Do not build an inbox or a bot directory. Carry authority to any HTTP resource |

---

## 0. One-sentence product

A stranger opens a URL, types a sentence, sees a real translation, and can kill **their** agent tree — while **translate still learns only the 8 public signals**, and **root keys never sit in the resource server**.

Watching your Alice binding is not “using the product.”

**Easy and secure do not license theater.** If the first-run is pretty but the rails are fake, it is not Warrant.

---

## 0.1 Real, not theater (non-negotiable)

Testnet is a **public chain**, not a mock. A stranger’s 200 and 403 must be explainable on a block explorer.

| ID | Real means | Theater (defect) |
|---|---|---|
| R1 | Groth16 prove + verify with the hosted vkey | `ALLOW_DEMO_VERIFY`, fake proof bytes, skipped verify |
| R2 | Leaf bound on live `MandateRegistry` (Base Sepolia) | `--local` tree, `FIXED_MERKLE_ROOT`, in-memory-only root |
| R3 | Revoke is `revoke(siblings)` on that contract; next prove gets `root_revoked` | UI-only “session ended,” TTL without an on-chain tx |
| R4 | `/v1/translate` returns a real translation (MyMemory or better) | String reverse, canned “hola,” echo |
| R5 | Dashboard list from Studio Graph + RPC hydrate | Fixture JSON as the public default |
| R6 | Paid path is Hedera testnet Blocky402; HCS is nullifier / scope / tier / txId | Printed “paid” with no facilitator, no topic |
| R7 | Guest is a **new** leaf and throwaway wallet | Shared Alice key, shared `humanTag`, shared nullifier |
| R8 | World is `tier=0`, said plainly | Claiming AgentBook / Selfie Check that is not live |

Easy = they never download a zkey or paste a key. Secure = translate still only sees eight public signals. Real = R1–R8 all hold on the public host.

`ALLOW_DEMO_*` stays for **local package tests only**. It is boot-fatal when `WARRANT_STRICT_PROD=1` or `NODE_ENV=production`.

---

## 1. Production-grade on testnet (locked)

Testnet is not a toy mode. It is the environment. The host must behave like production:

| Rule | Meaning |
|---|---|
| Real verify | `WARRANT_VKEY_PATH` + live `MandateRegistry`. No `ALLOW_DEMO_VERIFY`, no `FIXED_MERKLE_ROOT` |
| Real index | Studio Graph + Agent0. Query key server-only |
| Real pay / audit | Hedera testnet Blocky402 + HCS. Merchant ≠ payer |
| Fail closed | Translate **refuses to boot** if demo flags are set or vkey/registry/RPC are missing |
| HTTPS only | Dashboard + translate + prove. No mixed content |
| Durable quota | Nullifiers survive process restart (file or Redis) |
| Health | `GET /health` is public and secret-free; ready ≠ “flags on” |
| Abuse | Rate-limit guest mint, prove, bind, revoke. Captcha on mint |
| Secrets | Host env only. Never `NEXT_PUBLIC_*` keys. Never log keys, mandates, `humanTag`, or proofs |

We sponsor **testnet** bind gas and guest revoke gas. We do not make the registry permissionless (PK squat — `contracts/README.md`).

---

## 2. Why others cannot use it today

| Friction | Why a stranger bounces |
|---|---|
| Clone + `pnpm install` + `.env` | They want to try, not integrate |
| Operator-gated `bindRoot` | No leaf without our key |
| 28MB zkey + wasm | No hosted prove, no call |
| Hedera account + Blocky402 | Paid path after 3 free calls |
| Dashboard revoke is *your* Alice | They can confirm; they cannot act as themselves |
| `ALLOW_DEMO_*` local smoke | Easy, and forbidden on the public host |

---

## 3. Who arrives

| Persona | Success in one sitting |
|---|---|
| **Guest (Door 1 — belief)** | Open URL → type a sentence → 200 → revoke → next call 403. No wallet. Session TTL. |
| **Bot owner (Door 2 — life)** | Already has Grok / Hermes / OpenClaw. One prompt. Their bot calls hosted translate with a real warrant. *Fire everyone* and the bot is done. |
| **Wallet user** | Connect Base Sepolia → we bind *their* pubkey → same feeling, keys stay in the tab. |
| **Integrator** | `TRANSLATE_URL` + CLI / `warrant.fetch` / SKILL.md. Same rails. |

Founder tree (`0xa16d…`) stays the operator demo. Guests and wallet users never share that EVM key and cannot revoke it.

---

## 4. First-run UX (locked)

Stay **Astryx + Carbon**. Do not add a second design system. First screen is a product, not an operator console.

### 4.1 90-second path

1. Land. One sentence: *Your agent can act. The API never learns who you are.*
2. Primary button: **Authorize my agent.** The instruction they paste into Grok / Hermes / OpenClaw is the product, not a fold.
3. After mint: the paste block, remaining life, **Copy for my agent**. If one live warrant: **Fire**. If two or more: **Fire this warrant** on the selected paste, **Fire every warrant** once beneath.
4. In-page **Call the shop** stays below the paste (Door 1 belief). Success: translated text, then the nullifier foot. Do not persist shop translations.
5. Fire this (others still live): *That warrant is done. The shop still does not know who you were.* Fire every / last live: *Every agent under you is done. The API still does not know who you were.* Next agent call is **403**.
6. Registry is a quiet supporting word — not a peer tab next to the key. Graph, epoch, and explorer links stay behind it. Not the first viewport.

### 4.2 Copy bans (first viewport)

Do not lead with: merkle, LeanIMT, epoch, mirror JSON, zkey, Groth16, `humanTag`, Baby Jubjub, sibling path.

Those words may appear in the fold or CLI docs. They may not be the headline.

### 4.3 States

| State | UI |
|---|---|
| First land | Headline + Authorize my agent |
| Minting | Honest wait — “Issuing the warrant…” (bind can take ~15s) |
| Ready | Paste + remaining life + Copy. Fire, or Fire this + Fire every. Shop stays below. |
| Proving | “Your agent is calling the shop…” (~1–2s). Do not say merkle / epoch / zkey / Groth16 |
| Success | Result + nullifier-only receipt |
| Quota / 402 | “Free calls used. Testnet paywall.” Do not demand they open HashPack on first try. Guest stops here or we sponsor **one** settle (see §6) |
| Revoked | Tombstone + **Authorize another agent** |
| Rate-limited | “Try again in a few minutes.” |
| Host error | Fail closed, no stack traces |

### 4.4 Guest vs founder dashboard

Today’s Graph → Confirm → paste-key Revoke stays as an **operator / founder** surface. Guests reach it through a supporting **Registry** control that does not compete with **Authorize my agent** — a quiet word, not a peer tab. Guests never see Alice’s key field and never paste an EVM key.

---

## 5. Testnet rails we sponsor

| Rail | Guest | Wallet user | Integrator |
|---|---|---|---|
| Bind gas | We pay (operator) | We pay (operator); they hold the bound wallet | Request bind against our registry |
| Prove | Isolated worker, guest store only | Same worker for that session, or later WASM | Local CLI |
| Free quota | 3 / guest nullifier | 3 / their `humanTag` | Same policy |
| 402 after quota | Clear paywall. Optional **one** sponsored settle / session | Faucet + optional sponsor | Their Hedera payer |
| Revoke | **End session** — worker signs with the throwaway wallet; we sponsor gas | Their wallet signs | CLI |

Sponsor keys are server-only and **distinct** from Alice `ETH_PRIVATE_KEY` and from merchant `HEDERA_PAY_TO`.

Guest revoke must be on-chain (`msg.sender == bound wallet`). The guest EVM key lives only in the prove worker for the TTL. We fund that wallet from a **gas sponsor** just enough to send `revoke`, then wipe.

---

## 6. Security invariants (non-negotiable)

Defects if violated, even if the demo is prettier.

| ID | Invariant |
|---|---|
| S1 | Translate **never** receives parent mandates, Baby Jubjub secrets, or `humanTag`. Warrant header + 402 only. |
| S2 | Operator / bind / gas-sponsor / merchant keys never ship to the browser, never `NEXT_PUBLIC_*`, never log. |
| S3 | Public host uses `WARRANT_VKEY_PATH`. `ALLOW_DEMO_VERIFY` and `FIXED_MERKLE_ROOT` are boot-fatal. |
| S4 | Guest is isolated from the founder tree: different store, `humanTag`, nullifier, EVM key. Cannot revoke `0xa16d…`. Shared LeanIMT is OK as a **new leaf**. |
| S5 | Prove workers get **one session’s** witness, isolated process, wipe after, **not** the x402 process. |
| S6 | Graph query key is server-only (`/api/graph`). |
| S7 | HCS and verifier logs: nullifier / scope / tier / txId only. |
| S8 | `httpOnly` + `Secure` + `SameSite=Lax` session. CSRF on state-changing routes. Rate-limit + captcha on mint. |
| S9 | Pasted founder keys exist only in memory for one signature. Guests never paste keys. |
| S10 | Default is **non-custodial**. Guest is a labeled throwaway: we hold those keys for minutes. Long-lived custodial backup is opt-in. |
| S11 | Prove worker is reachable only from the dashboard origin / shared internal secret — not a public anonymous prove API. |
| S12 | Guest BFF may see one warrant header in flight. It must not log it, persist it, or forward it anywhere except translate. |

Threats we accept (`docs/02-design.md`): leaf sees parents; budget is a ceiling; anonymity set = bound roots; Groth16 ceremony; mid-tree revoke is v2.

Threats we reject: shared demo key as “Try”; prove inside translate; operator key in the Next bundle; guest that can revoke the founder tree; public `ALLOW_DEMO_*`.

---

## 7. Custody (locked)

**Hybrid, non-custodial default. Guest is a short custodial sandbox on testnet.**

```text
Their bot (Grok / Hermes / OpenClaw)
        │  HTTP + warrant
        ▼
Browser Try it               Warrant cloud                    Public testnets
───────                      ─────────────                    ──────────────
Door 1 (belief)              dashboard UI + BFF               MandateRegistry
Door 2 = their bot           /api/graph                       Base Sepolia
                             translate + x402 + HCS           Hedera testnet
                             guest prove worker               Blocky402 / HCS
                             operator bind + gas sponsor
```

| Approach | Use |
|---|---|
| A. We hold every Alice | No as default |
| B. CLI only | Integrators, not first-run |
| C. Hybrid (**this**) | Cloud = door + UI + index + testnet sponsor |

Do not build plaintext key backup. Passkey-wrapped ciphertext is Phase 2.

---

## 8. What we will not build

- Mainnet registry, mainnet HBAR, or a new ceremony
- Mid-tree revoke, Noir, ENS, recursive PCD
- Multi-tenant “protect any URL” (Phase 3)
- World Selfie Check until sandbox exists (keep `IPersonhood`, stay `tier=0` and say so)
- Prove inside `services/translate`
- A second dashboard stack
- Permissionless `MandateRegistry` (`operator=0`) on the public mempool
- A bot inbox, directory, or naming scheme. Meeting is their problem; acting is ours.

---

## 9. Phases

### Phase 0 — Fail-closed public hosts

Deploy what exists. Translate boot-fatal on demo flags / missing vkey / missing registry. README live URLs. Visitor can load Graph and confirm on-chain (read-only).

Necessary. Not the product bar.

### Phase 1 — Strangers can use it (**locked winning slice**)

Guest Try + isolated prove worker + on-chain guest revoke + 90-second first-run.

- `POST /api/guest` after captcha + rate limit → prove worker mints leaf + 2-hop delegate
- Browser sends **text only** → BFF → worker proves → hosted translate
- **Revoke this session** → worker sends `revoke` from the throwaway wallet
- TTL wipe (keys + store + funded dust)
- One-prompt skill on the same page (Grok / Hermes / OpenClaw): hosted `TRANSLATE_URL`, “do not show me the proof,” “fire everyone” maps to revoke
- Wallet connect is **stretch** (same security model, later)

**Exit:** A person without this repo gets a real 200 and can 403 themselves. A bot owner can paste one prompt and get the same 200. Founder Alice remains unrevoked.

### Phase 2 — Accounts

Passkey vault (ciphertext only). Redis nullifiers. Tighter abuse budget. Wallet-user self-revoke.

### Phase 3 — Beyond the demo leaf

Protect an upstream URL. Operator queue if we stop auto-bind. World when sandbox exists. Hard spend limits.

---

## 10. Architecture (Phase 0–1)

Keep `docs/07-architecture.md` boundaries. Add:

```text
apps/dashboard          UI + /api/graph + /api/guest + /api/session
services/translate      x402 verify + MyMemory + HCS     [no keys, no prove]
services/prove          NEW  IProver + one WarrantState  [no Hono x402, no Hedera]
packages/core           unchanged
packages/x402           unchanged
packages/agent          CLI + proveForChallenge (prove service may import)
```

```text
Browser --text--> dashboard BFF --session--> prove worker --warrant header--> translate
                                                                      |
                                                                      +--> HCS (nullifier only)
```

Translate **never** calls prove. Dashboard **never** imports `snarkjs`. Prove worker **never** imports `@x402/*` or `@hiero-ledger/*`.

Operator bind: `BIND_PRIVATE_KEY` in host secrets, used only for founder ops and rate-limited guest/wallet binds.

`scripts/check-boundaries.mjs` must treat `services/prove` as a service: no `circuits/`, no `contracts/`, no Hedera, no Next.

---

## 11. File map

| Work | Where |
|---|---|
| Translate fail-closed boot | `services/translate/src/prod-guard.ts`, `main.ts` |
| Health stays secret-free | `services/translate/src/app.ts` `GET /health` |
| Dashboard first-run | `apps/dashboard/src/components/` — guest surface + keep founder registry tab |
| Guest BFF | `apps/dashboard/src/app/api/guest/` |
| Prove worker | `services/prove/` (new workspace package) |
| Boundaries | `scripts/check-boundaries.mjs` |
| Host config | Vercel / Railway env — no secrets in git |
| README try-it | `README.md` top = live URL |

---

## 12. Security checklist

- [ ] `pnpm check-boundaries`
- [ ] Translate boot fails if `ALLOW_DEMO_*`, missing vkey, missing registry/RPC
- [ ] `NODE_ENV=production` cannot be overridden by demo flags
- [ ] `grep -R NEXT_PUBLIC apps/dashboard` has no keys
- [ ] Guest store ≠ founder `WARRANT_STORE`
- [ ] Guest EVM ≠ `ETH_ADDRESS`
- [ ] Gas sponsor ≠ guest EVM (sponsor only funds; guest signs revoke)
- [ ] Merchant `HEDERA_PAY_TO` ≠ any user/sponsor payer
- [ ] Prove worker auth: internal secret + dashboard origin
- [ ] Prove timeout + body size cap; guest TTL wipe
- [ ] Nullifier store durable and fail-closed
- [ ] CORS: cookie routes = dashboard origin; translate public POST
- [ ] No warrant / proof / key in logs

---

## 13. Decision log

| Decision | Choice | Why |
|---|---|---|
| Product bar | Easy + secure + **real** (R1–R8) | Pretty fake is not the product |
| Environment | Public testnets | Real settlement and revoke without mainnet risk |
| Winning slice | Phase 0 + guest Phase 1 | Read-only Graph does not win; passkeys can wait |
| First-run | Text in, translation out | Protocol pitch after the result, not before |
| Custody | Non-custodial default; guest TTL sandbox | Makes try-it possible without breaking S1 for wallet users |
| Guest transport | Dashboard BFF | One button; S12 forbids logging the header |
| Bind | Operator auto-bind, rate-limited | Registry stays gated; strangers still get a leaf |
| Prove | Isolated worker | 28MB zkey cannot be the first step |
| Revoke | On-chain, throwaway wallet, sponsored gas | 403 is the wow; TTL-only is invisible |
| World | `tier=0`, said plainly | Sandbox not live; honesty is the pitch |

---

## 14. Approval gate

**Locked recommendation: Phase 0 + Phase 1 guest Try.**

Wallet connect and passkeys are stretch. Do not start the prove worker until this file is accepted.

---

## 15. Deploy runbook (testnet hosts)

Local three-process host (real rails, not theater):

```bash
./scripts/hosted-dev.sh
# translate :8787  prove :8788  dashboard :3001
```

**Images / start commands** (repo root):

| Host | Artifact | Start |
|---|---|---|
| Dashboard | Vercel / `apps/dashboard` (`vercel.json`) | `pnpm --filter @warrant/dashboard build && start` |
| Translate | `deploy/Dockerfile.translate` or `deploy/railway.translate.toml` | `pnpm --filter @warrant/translate start` |
| Prove | `deploy/Dockerfile.prove` or `deploy/railway.prove.toml` | `pnpm --filter @warrant/prove start` |

Prove image expects Groth16 **wasm + zkey** on disk (`scripts/download-zkey.sh` fetches zkey/vkey; wasm is gitignored — copy `circuits/build/warrant_js/warrant.wasm` or set `WARRANT_WASM_PATH`). Persist translate nullifiers with a volume + `WARRANT_NULLIFIER_PATH`.

**Translate env:** `WARRANT_STRICT_PROD=1`, `NODE_ENV=production`, `WARRANT_VKEY_PATH` (file exists), `REGISTRY_ADDRESS`, `BASE_SEPOLIA_RPC`, `WARRANT_MIN_TIER=0`, `WARRANT_FREE_CALLS=3`, Hedera + HCS, `HEDERA_PAY_TO` ≠ `HEDERA_ACCOUNT_ID`. No `ALLOW_DEMO_*`.

**Prove env:** `PROVE_SECRET`, `BIND_PRIVATE_KEY`, `GAS_SPONSOR_PRIVATE_KEY` (≠ bind, ≠ Alice), `REGISTRY_ADDRESS`, `BASE_SEPOLIA_RPC`, `GRAPH_WARRANT_QUERY_URL`, `GRAPH_API_KEY`, `WARRANT_WASM_PATH`, `WARRANT_ZKEY_PATH`, `GUEST_TTL_MS=1800000`, `PROVE_ALLOWED_ORIGINS=https://app.example`.

**Dashboard env:** `PROVE_URL`, `PROVE_SECRET`, `TRANSLATE_URL`, `DASHBOARD_ORIGIN`, `GRAPH_*`, `NEXT_PUBLIC_REGISTRY_ADDRESS`, `NEXT_PUBLIC_RPC_URL`. Optional `TURNSTILE_SECRET` + `NEXT_PUBLIC_TURNSTILE_SITE_KEY`. Never put keys in `NEXT_PUBLIC_*`.

Smoke after DNS: Try it → 200 translation → Revoke → next call 403. Registry tab still shows Alice. `GET` `/health` on translate and prove.
