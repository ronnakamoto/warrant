export const GUEST_COPY = {
  headline: "Your agent can act. The API never learns who you are.",
  standfirst:
    "Give the bot you already have a warrant. When you fire everyone, every shop it called still does not know it was you.",
  world: "Testnet. Not a World ID proof.",
  hostError: "Something went wrong. Try again in a moment.",
  revokeFailed: "Revoke did not take. The agent can still act.",
  authorize: "Authorize my agent",
  minting: "Issuing the warrant…",
  authorized: "Your agent is authorized.",
  promptLead: "Paste this into Grok, Hermes, or OpenClaw. This is the warrant — not a wish.",
  botLead: "For the bot you already have.",
  copyPrompt: "Copy for my agent",
  copied: "Copied.",
  shopLead: "Send this. The shop will not know it was you.",
  shopLabel: "What your agent sends",
  shopCall: "Call the shop",
  payCall: "Pay and call",
  proving: "Your agent is calling the shop…",
  successFoot: "The shop saw a nullifier, not you.",
  paidFoot: "Testnet settle. The shop still saw a nullifier, not you.",
  paidLink: "Open the settle",
  sendAnother: "Send another",
  revoke: "Fire everyone",
  afterRevoke: "Every agent under you is done. The API still does not know who you were.",
  again: "Authorize another agent",
  quota: "The shop wants testnet HBAR. Pay, then the call goes through.",
  faucetLead: "Get testnet HBAR from the Hedera faucet.",
  faucetLink: "Hedera faucet",
  payAccount: "Hedera account",
  payKey: "Hedera private key",
  payHint: "Warrant does not keep the key.",
  rateLimited: "Try again in a few minutes.",
  registry: "Registry",
  warrantTab: "Warrant",
  localhostHint:
    "Cloud agents (Grok) cannot reach 127.0.0.1. OpenClaw or Hermes on this machine can. A public https host is required for agents on the internet.",
  fireThis: "Fire this warrant",
  fireEvery: "Fire every warrant",
  fireOne: "Fire",
  helperFoot: "Warrant will prove for you. Warrant sees the witness. The shop sees a nullifier.",
  afterFireThis: "That warrant is done. The shop still does not know who you were.",
} as const;

export const HEDERA_FAUCET = "https://portal.hedera.com/faucet";

/** Revoke took only when the shop returns 403. A 402 is still a live warrant. */
export function shopIsDead(status: number): boolean {
  return status === 403;
}

export function remainingMsUntil(expiresAt: number, now = Date.now()): number {
  return Math.max(0, expiresAt - now);
}

export function remainingLife(ms: number): string {
  if (ms <= 0) return "This warrant has expired";
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return "Less than a minute left";
  if (minutes === 1) return "1 minute left";
  return `${minutes} minutes left`;
}

export function agentPrompt(appOrigin: string, token: string): string {
  const origin = appOrigin.replace(/\/$/, "");
  return [
    `POST ${origin}/api/agent/translate`,
    `Authorization: Bearer ${token}`,
    "Content-Type: application/json",
    "",
    '{"text":"<what I asked you to send>","source":"en","target":"es"}',
    "",
    GUEST_COPY.helperFoot,
    "",
    "If the shop returns 402, retry the same POST with hederaAccountId and hederaPrivateKey from your environment. Never print those values.",
    `Testnet HBAR: ${HEDERA_FAUCET}`,
    "",
    `If I say fire everyone, POST ${origin}/api/agent/revoke with the same Authorization header and {}.`,
    "Show me only the shop's text. Do not show me the bearer token, any proof, or any keys.",
  ].join("\n");
}

export function hashscanTestnetUrl(txId: string): string {
  const dash = txId.replace("@", "-").replace(/\.(?=\d+$)/, "-");
  return `https://hashscan.io/testnet/transaction/${dash}`;
}
