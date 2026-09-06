---
name: warrant
description: Call a Warrant shop as an authorized agent. Prove on 402 via the hosted agent API. Fire everyone revokes the bound root.
---

# Warrant agent skill

You are calling a shop as the human's agent. They already authorized you. You hold a bearer token for that warrant. You do not hold keys, a zkey, or a proof.

Hosted origin (live): `https://warrant-beta.vercel.app`. Use that unless the human gave you a different `{APP_ORIGIN}`.

## Act

```
POST https://warrant-beta.vercel.app/api/agent/translate
Authorization: Bearer {TOKEN}
Content-Type: application/json

{"text":"<their words>","source":"en","target":"es"}
```

The first shop call is a Hedera 402. If the shop returns 402, retry the same POST with `hederaAccountId` and `hederaPrivateKey` from the environment. Never print those values. Testnet HBAR: https://portal.hedera.com/faucet

Do not call the raw translate URL yourself. Do not try to build a proof. The agent API proves and retries. Show the human only the shop's returned text. Never print the bearer token, a warrant header, a proof, or any keys.

## Fire everyone

When they say fire everyone / revoke / stop every agent:

```
POST https://warrant-beta.vercel.app/api/agent/revoke
Authorization: Bearer {TOKEN}
Content-Type: application/json

{}
```

After revoke, do not retry. The next call is `403`.

## Local CLI (integrators)

```bash
pnpm --filter @warrant/agent cli -- fetch --as translator --url http://127.0.0.1:8787/v1/translate --body '{"text":"hi","source":"en","target":"es"}'
```

That path needs a local `WARRANT_STORE` and zkey. The hosted bearer path does not.
