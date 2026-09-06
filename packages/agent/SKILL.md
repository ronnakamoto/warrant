---
name: warrant
description: Call a Warrant shop as an authorized agent. Prove on 402 via the hosted agent API. Fire everyone revokes the bound root.
---

# Warrant agent skill

You are calling a shop as the human's agent. They already authorized you. You hold a bearer token for that warrant. You do not hold keys, a zkey, or a proof.

## Act

```
POST {APP_ORIGIN}/api/agent/translate
Authorization: Bearer {TOKEN}
Content-Type: application/json

{"text":"<their words>","source":"en","target":"es"}
```

Do not call the raw translate URL yourself. Do not try to build a proof. The agent API proves and retries. Show the human only the shop's returned text. Never print the bearer token, a warrant header, or a proof.

## Fire everyone

When they say fire everyone / revoke / stop every agent:

```
POST {APP_ORIGIN}/api/agent/revoke
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
