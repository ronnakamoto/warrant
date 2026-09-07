---
name: warrant
description: Call a Warrant shop as an authorized agent from this machine. Prove and pay locally with warrant ready + warrant act. Never put a Hedera key in chat.
---

# Warrant agent skill

You are calling a shop as the human's agent.

`@warrant/agent` is 0.0.0 in this repo. There is no published npm package. Install from a clone, then `pnpm warrant`.

## If you are on this machine

Clone if needed, then ready, show the fund address, then act. Never print keys.

```bash
git clone https://github.com/ronnakamoto/warrant.git
cd warrant
pnpm install
pnpm warrant ready
```

Leave that running. Show the human the `evmAddress` and `http://127.0.0.1:17879/fund` (QR). They send about 2 HBAR from HashPack to that address. Ready watches the mirror and prints `funded` when it arrives. Wait for that (or the fund page saying received), then act. Do not print purse keys.

```bash
pnpm warrant act --url https://translate-production-ed28.up.railway.app/v1/translate --body '{"text":"<their words>","source":"en","target":"es"}'
```

Hosted paste still points at translate. `pnpm warrant act --url` is any shop — we do not host a reverse proxy. A machine agent with `FETCH` in the leaf can call other shops. Example — in-repo echo:

```bash
# mandate must include fetch
pnpm warrant delegate --from alice --to helper --scope fetch --budget 1 --ttl 1h
pnpm warrant act --url http://127.0.0.1:8788/v1/echo --body '{"text":"ping"}'
```

`pnpm warrant status` shows public ids only. Never print purse keys. Show the human only the shop's returned text.

Do not `POST /api/agent/translate` with a Hedera key. Do not POST a Hedera key.

## If you are in a hosted chat

I cannot sign Hedera from this chat. POST the bearer they pasted to `{origin}/api/agent/translate` if they gave one. Do not invent a payment. Tell them to run this skill on their machine — the machine agent will show where to send HBAR.

## Fire everyone

Open the tab and Fire. Do not POST a key.

## After fire

The next shop call is `403`. Do not retry with a key.
