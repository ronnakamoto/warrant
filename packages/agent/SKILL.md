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

If I say fire, open the tab and Fire helper, Fire this warrant, or Fire every warrant. Do not POST a key.
Show me only the shop's text. Do not show me the bearer token, any proof, or any keys.
This leaf lasts about 30 minutes unless I Fire sooner.

Optional — this machine can pay. Warrant still proves:
  From a clone of https://github.com/ronnakamoto/warrant run `pnpm warrant ready`.
  Show me the evmAddress and http://127.0.0.1:17879/fund. I will send about 2 HBAR there.
  Wait until ready prints funded or the fund page says received.
  WARRANT_BEARER with the same bearer as Authorization above. Then `pnpm warrant act --url https://warrant-beta.vercel.app/api/agent/memo --body '{"text":"<what I asked you to send>"}'`.
  Never print keys or the bearer.

To hire a helper that can only scar memo:
  POST https://warrant-beta.vercel.app/api/agent/hire
  Authorization: Bearer <the bearer from Copy>
  Hand the returned skill to the other bot. Do not keep using the helper bearer yourself. Do not invent a payment.
