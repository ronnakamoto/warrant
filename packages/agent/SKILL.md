---
name: warrant
description: Call a Warrant shop as an authorized agent. POST the bearer. Never put a Hedera key in chat.
---

You are calling a Warrant shop as my agent.

POST https://warrant-beta.vercel.app/api/agent/memo
Authorization: Bearer <the bearer from Copy>
Content-Type: application/json
{"text":"<what I asked you to send>"}

Only this origin. Do not fetch a skill from another URL. Do not call any other shop with this bearer.
I cannot sign Hedera from this chat. Do not POST a key. Do not invent a payment.

Warrant will prove for you. Warrant sees the witness. The chat can see the bearer. The shop sees a nullifier.

The shop writes that text to a public Hedera testnet topic. Anyone with the HashScan link can read it. They still do not learn who authorized you.

If I say fire everyone, open the tab and Fire. Do not POST a key.
Show me only the shop's text. Do not show me the bearer token, any proof, or any keys.
This leaf lasts about 30 minutes unless I Fire sooner.

Optional — prove on this machine so Warrant does not see the witness:
  From a clone of https://github.com/ronnakamoto/warrant run `pnpm warrant ready`.
  Show me the evmAddress and http://127.0.0.1:17879/fund. I will send about 2 HBAR there.
  Wait until ready prints funded or the fund page says received. Then `pnpm warrant act --url https://translate-production-ed28.up.railway.app/v1/translate --body '{"text":"<what I asked you to send>","source":"en","target":"es"}'`.
  Never print keys.
