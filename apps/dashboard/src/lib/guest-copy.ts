export const GUEST_COPY = {
  headline: "Your agent can act. The API never learns who you are.",
  standfirst:
    "Give the bot you already have a warrant. When you fire everyone, every shop it called still does not know it was you.",
  world: "Testnet. Not a World ID proof.",
  twoWallets: "MetaMask stops the bot. HashPack lets it pay. The bot never gets your key.",
  connectWallet: "You keep the key. Connect to authorize.",
  hostError: "Something went wrong. Try again in a moment.",
  revokeFailed: "Revoke did not take. The agent can still act.",
  authorize: "Authorize my agent",
  minting: "Issuing the warrant…",
  authorized: "Your agent is authorized.",
  promptLead: "Paste this into Grok, Hermes, or OpenClaw. This is the warrant — not a wish.",
  botLead: "For the bot you already have.",
  copyPrompt: "Copy for my agent",
  copied: "Copied.",
  revoke: "Fire everyone",
  afterRevoke: "Every agent under you is done. The API still does not know who you were.",
  again: "Authorize another agent",
  letSpend: "Let it spend",
  cutSpend: "Cut spend",
  spending: "Waiting for HashPack…",
  spendGranted: "The bot can pay up to 2 HBAR. Cut spend to stop it.",
  spendCut: "The bot can still prove. It cannot pay.",
  readyNeeded: "On this machine, run warrant ready, then Let it spend.",
  pairFallback: "HashPack created the spender. Pair it on the bot with warrant purse bind.",
  walletRejected: "The wallet did not sign.",
  signRejected: "The wallet did not sign.",
  rateLimited: "Try again in a few minutes.",
  registry: "Registry",
  warrantTab: "Warrant",
  localhostHint:
    "Cloud agents (Grok) cannot reach this machine. OpenClaw or Hermes on this machine can.",
  fireThis: "Fire this warrant",
  fireEvery: "Fire every warrant",
  fireOne: "Fire",
  helperFoot: "Warrant will prove for you. Warrant sees the witness. The shop sees a nullifier.",
  afterFireThis: "That warrant is done. The shop still does not know who you were.",
} as const;

export const HEDERA_FAUCET = "https://portal.hedera.com/faucet";
export const WARRANT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const PAIR_ORIGIN = "http://127.0.0.1:17879";

/** Revoke took only when the shop returns 403. A 402 is still a live warrant. */
export function shopIsDead(status: number): boolean {
  return status === 403;
}

export function remainingMsUntil(expiresAt: number, now = Date.now()): number {
  return Math.max(0, expiresAt - now);
}

export function remainingLife(ms: number): string {
  if (ms <= 0) return "This warrant has expired";
  const days = Math.floor(ms / 86_400_000);
  if (days >= 2) return `${days} days left`;
  if (days === 1) return "1 day left";
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return "Less than a minute left";
  if (minutes === 1) return "1 minute left";
  return `${minutes} minutes left`;
}

export function agentPrompt(appOrigin: string, token: string): string {
  const origin = appOrigin.replace(/\/$/, "");
  return [
    "You are calling a Warrant shop as my agent.",
    "",
    "If you are on this machine:",
    "  From a clone of https://github.com/ronnakamoto/warrant run `pnpm warrant ready`, then `pnpm warrant act --url https://translate-production-ed28.up.railway.app/v1/translate --body '{\"text\":\"<what I asked you to send>\",\"source\":\"en\",\"target\":\"es\"}'`.",
    "  Never print keys. I will click Let it spend in the tab.",
    "",
    "If you are in a hosted chat:",
    `  POST ${origin}/api/agent/translate`,
    `  Authorization: Bearer ${token}`,
    "  Content-Type: application/json",
    '  {"text":"<what I asked you to send>","source":"en","target":"es"}',
    "  I cannot sign Hedera from this chat. Do not POST a key.",
    "",
    GUEST_COPY.helperFoot,
    "",
    "If I say fire everyone, open the tab and Fire. Do not POST a key.",
    "Show me only the shop's text. Do not show me the bearer token, any proof, or any keys.",
  ].join("\n");
}

export function hashscanTestnetUrl(txId: string): string {
  const dash = txId.replace("@", "-").replace(/\.(?=\d+$)/, "-");
  return `https://hashscan.io/testnet/transaction/${dash}`;
}
