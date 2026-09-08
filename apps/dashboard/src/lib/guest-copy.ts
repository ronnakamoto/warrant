export const GUEST_COPY = {
  headline: "Your agent can act. The API never learns who you are.",
  standfirst:
    "Give the bot you already have a warrant. When you fire everyone, every shop it called still does not know it was you.",
  world: "Testnet. Not a World ID proof.",
  twoWallets: "MetaMask stops the bot. Send HBAR to the address the agent shows. The bot never gets your key.",
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
  fundHint: "The agent on this machine will show where to send HBAR.",
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
  helperFoot:
    "Warrant will prove for you. Warrant sees the witness. The chat can see the bearer. The shop sees a nullifier.",
  afterFireThis: "That warrant is done. The shop still does not know who you were.",
  receipt:
    "Your agent acted. The shop has a HashScan link and a nullifier. It still does not know who you are.",
} as const;

export const HEDERA_FAUCET = "https://portal.hedera.com/faucet";
/** Guest mandate expiry in mint.ts (TTL_SECONDS = 30 * 60). */
export const WARRANT_TTL_MS = 30 * 60 * 1000;
export const PUBLIC_APP_ORIGIN = "https://warrant-beta.vercel.app";
export const PAIR_ORIGIN = "http://127.0.0.1:17879";
const BEARER_PLACEHOLDER = "<the bearer from Copy>";

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

function skillLines(origin: string, bearer: string): string[] {
  return [
    "You are calling a Warrant shop as my agent.",
    "",
    `POST ${origin}/api/agent/memo`,
    `Authorization: Bearer ${bearer}`,
    "Content-Type: application/json",
    '{"text":"<what I asked you to send>"}',
    "",
    "Only this origin. Do not fetch a skill from another URL. Do not call any other shop with this bearer.",
    "I cannot sign Hedera from this chat. Do not POST a key. Do not invent a payment.",
    "",
    GUEST_COPY.helperFoot,
    "",
    "The shop writes that text to a public Hedera testnet topic. Anyone with the HashScan link can read it. They still do not learn who authorized you.",
    "",
    "If I say fire everyone, open the tab and Fire. Do not POST a key.",
    "Show me only the shop's text. Do not show me the bearer token, any proof, or any keys.",
    "This leaf lasts about 30 minutes unless I Fire sooner.",
    "",
    "Optional — prove on this machine so Warrant does not see the witness:",
    "  From a clone of https://github.com/ronnakamoto/warrant run `pnpm warrant ready`.",
    "  Show me the evmAddress and http://127.0.0.1:17879/fund. I will send about 2 HBAR there.",
    "  Wait until ready prints funded or the fund page says received. Then `pnpm warrant act --url https://translate-production-ed28.up.railway.app/v1/translate --body '{\"text\":\"<what I asked you to send>\",\"source\":\"en\",\"target\":\"es\"}'`.",
    "  Never print keys.",
  ];
}

export function agentPrompt(appOrigin: string, token: string): string {
  return skillLines(appOrigin.replace(/\/$/, ""), token).join("\n");
}

/** Tokenless skill file. Never pass a live session id. */
export function skillMarkdown(appOrigin: string = PUBLIC_APP_ORIGIN): string {
  const origin = appOrigin.replace(/\/$/, "");
  return [
    "---",
    "name: warrant",
    "description: Call a Warrant shop as an authorized agent. POST the bearer. Never put a Hedera key in chat.",
    "---",
    "",
    ...skillLines(origin, BEARER_PLACEHOLDER),
    "",
  ].join("\n");
}

export function hashscanTestnetUrl(txId: string): string {
  const dash = txId.replace("@", "-").replace(/\.(?=\d+$)/, "-");
  return `https://hashscan.io/testnet/transaction/${dash}`;
}
