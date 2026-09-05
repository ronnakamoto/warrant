# AI tool usage

ETHOnline requires documenting where AI tools were used.

## Tools

- **Cursor** (Composer / agent) — primary coding assistant for monorepo scaffold, circuits wiring, contracts, `@warrant/*` packages, translate service, dashboard, tests, README, and partner feedback docs.
- **Claude / other LLMs** (via Cursor) — design iteration against `docs/02-design.md` / `docs/05-implementation-plan.md`, debugging (x402 pay fallthrough, requestHash / Hono bodyHash, Hedera payer≠payTo), and prose polish on feedback docs.

## What humans owned

- Product scope (skip WP8 ENS solo path), partner prize selection, wallet funding, live Base Sepolia deploy, demo recording / voiceover, and final submission choices.
- Review of all AI-proposed diffs before merge; security-sensitive paths (pipeline order, revoke semantics, no `onBeforeVerify` skip) checked against `docs/07-architecture.md`.

## What AI did not do

- No AI voiceover or sped-up demo video.
- No substitution of mocked Blocky402 settlement for the recorded paid call (live testnet settle when shown).
- Secrets (`.env` keys) were never committed; AI sessions used local gitignored env only.
