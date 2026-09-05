# 08 — Demo video runbook (solo path)

Recording checklist for ETHOnline. Full narrative script: [`03-execution.md`](03-execution.md) §4. **Skip the ENSv2 beat** (WP8); keep total **2:00–3:30**. Human voice, ≥720p, no AI voiceover, no speed-up.

## Prep (before camera)

- [ ] `main` pulled; `.env` has Base Sepolia + Hedera (`HEDERA_PAY_TO` ≠ `HEDERA_ACCOUNT_ID`)
- [ ] zkey present: `circuits/build/warrant_final.zkey` (+ wasm / vkey)
- [ ] Translate on `:8787` with `REGISTRY_ADDRESS`, `WARRANT_MIN_TIER=0`, real vkey (no `ALLOW_DEMO_VERIFY`)
- [ ] Dashboard on `:3000` with `NEXT_PUBLIC_REGISTRY_ADDRESS` + mirror JSON
- [ ] Terminal font large; Basescan + HashScan tabs open
- [ ] Fresh store: `export WARRANT_STORE=/tmp/warrant-demo-video/state.json`

Reset helper:

```bash
rm -rf /tmp/warrant-demo-video && mkdir -p /tmp/warrant-demo-video
export WARRANT_STORE=/tmp/warrant-demo-video/state.json
# keygen alice/orchestrator/translator, bind-root on-chain, two delegates — or reuse /tmp/warrant-live after epoch sync
```

Automated beat check (prove / free / pay — not revoke):

```bash
export WARRANT_STORE=/tmp/warrant-live/state.json
./scripts/demo-video-dry-run.sh
```

## Shot list (solo, no ENS)

| Time | Beat | Show | Say (short) |
|---|---|---|---|
| 0:00–0:20 | Hook | Title slide or empty terminal | Agents hire agents; every system publishes the org chart. Warrant proves a real human, scope, and budget — and reveals nothing else. |
| 0:20–0:50 | Root | Basescan `MandateRegistry` + CLI `bind-root` JSON (leaf/root) | Alice binds a BabyJubjub root at tier 0 (demo personhood). Tree of 1 today; production anonymity set is AgentBook. |
| 0:50–1:20 | Delegate | Two `warrant delegate` commands; failed widen attempt | Orchestrator gets translate+budget; translator is attenuated. Widening scope fails client-side. |
| 1:20–2:10 | Prove + pay | `WARRANT_REAL_PROVE=1` live-call ×3 → 200; 4th `WARRANT_PAY=1` → 200; split: server nullifier log | Translator proves (~1–2 s). Three free calls per nullifier; fourth settles HBAR via Blocky402. Log is nullifier only — no name, wallet, or chain. |
| 2:10–2:50 | Revoke | Dashboard **Revoke** (or `cast send revoke`) + failed live-call **403** `root_revoked` | Alice revokes once. Epoch bumps; every agent fails. Server never learned Alice; it still enforced her decision. |
| 2:50–3:20 | Close | README / ACTA one-liner + repo URL | Answers ACTA’s recursive private delegation gap. World + Hedera feedback docs in-repo. Links. |

After the revoke shot (optional recovery for a second take): `warrant sync-root` then re-delegate.

## Commands (copy pane)

```bash
export WARRANT_STORE=/tmp/warrant-demo-video/state.json
export TRANSLATE_URL=http://127.0.0.1:8787/v1/translate

# Free calls (real prove)
WARRANT_REAL_PROVE=1 pnpm --filter @warrant/agent exec tsx demo/live-call.ts

# Paid (after free quota exhausted)
WARRANT_REAL_PROVE=1 WARRANT_PAY=1 pnpm --filter @warrant/agent exec tsx demo/live-call.ts

# After revoke — expect 403
WARRANT_REAL_PROVE=1 pnpm --filter @warrant/agent exec tsx demo/live-call.ts
```

Widen fail (attenuation wow):

```bash
pnpm --filter @warrant/agent cli -- delegate --from translator --to evil --scope trade --budget 1 --ttl 1h
# must error — tip cannot widen
```

## Cut rules

- Cut waits (prove spinner, tx mining); never speed up footage.
- Keep server log readable: `{"audit":"warrant","nullifier":"…","scope":"1","tier":"0",…}`
- Do not show private keys or full `.env`.
- Two takes; pick the cleaner revoke reaction shot.

## Partner tracks in this cut

| Partner | Evidence in video |
|---|---|
| Hedera | Live 402 → Blocky402 settle + nullifier HCS line |
| World | Tier in proof / feedback doc callout (Selfie Check / AgentBook path; demo may be tier=0) |
| ENS | **Omit** — see `FEEDBACK_ENS.md` |
