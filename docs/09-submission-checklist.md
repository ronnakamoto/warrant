# 09 — Submission checklist (ETHOnline)

Self-check before the form. Video shot list: [`08-demo-runbook.md`](08-demo-runbook.md). Rubric: [`03-execution.md`](03-execution.md) §5.

## Repo

- [ ] `main` builds: `pnpm check-boundaries` + package tests / `pnpm dod`
- [ ] README states ACTA gap + comparison table
- [ ] Payment flow + architecture diagram in README
- [ ] `AI_USAGE.md` (VS Code, Copilot, Ollama, ChatGPT)
- [ ] Partner feedback: `FEEDBACK_HEDERA.md`, `FEEDBACK_WORLD.md`, `FEEDBACK_ENS.md` (skipped)
- [ ] Deploy pins: `deployments/base-sepolia.json`
- [ ] Groth16 download: `./scripts/download-zkey.sh` (release `artifacts-groth16-v1`)

## Live evidence (links for submission / video)

- [ ] Basescan MandateRegistry + a revoke tx
- [ ] HashScan / Blocky402 settle (paid call) — or HCS topic message
- [ ] Server log line is **nullifier-only** (no names/wallets)

## Video

- [ ] 2:00–3:30, ≥720p, **human** voice, no speed-up
- [ ] Beats: hook → bind → delegate (+ widen fail) → prove/pay → revoke 403 → close
- [ ] Skip ENS; disclose `tier=0` if World Sandbox unused
- [ ] Two takes; cut waiting, never accelerate

## Form

- [ ] Finalist + up to 3 partners (World Selfie Check, Hedera Agentic Payments; ENS only if shipped)
- [ ] Attribute AI (`AI_USAGE.md`)
- [ ] Submit before buffer (target **10:00 EDT** Sep 13)

## Still blocked on World

- Live Selfie Check → `tier≥1` bind
- AgentBook as anonymity set (multi-leaf production story)
