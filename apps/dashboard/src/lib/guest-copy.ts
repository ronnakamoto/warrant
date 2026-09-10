export const GUEST_COPY = {
  headline: "Your agent can act. Nobody it called learns who you are.",
  standfirst:
    "Give the bot you already have a warrant. When you fire it, whoever it wrote or talked to still does not know it was you.",
  world: "This is a public trial. Not a World ID check.",
  twoWallets:
    "You approve in MetaMask. The bot never gets that key. If it asks you to pay, send HBAR to the address it shows.",
  connectWallet: "You keep the key. Connect to authorize.",
  connectAction: "Connect",
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
  afterRevoke: "Every agent under you is done. They still do not know who you were.",
  again: "Authorize another agent",
  fundHint: "The agent on this machine will show where to send HBAR.",
  walletRejected: "The wallet did not sign.",
  signRejected: "The wallet did not sign.",
  rateLimited: "Try again in a few minutes.",
  registry: "Registry",
  warrantTab: "Warrant",
  docs: "Docs",
  localhostHint:
    "Cloud agents (Grok) cannot reach this machine. OpenClaw or Hermes on this machine can.",
  fireThis: "Fire this warrant",
  fireEvery: "Fire every warrant",
  fireOne: "Fire",
  helperFoot:
    "Warrant will prove for you. Warrant sees the witness. The chat can see the bearer. The shop sees a nullifier.",
  afterFireThis: "That warrant is done. They still do not know who you were.",
  receipt:
    "Your agent acted. The shop has a HashScan link and a nullifier. It still does not know who you are.",
  helperSkillFoot:
    "This helper can scar memo. It cannot translate. Fire in the tab kills it too.",
  scopeLead: "Your bot may leave a memo, translate, or both.",
  scopeMemo: "Memo",
  scopeTranslate: "Translate",
  scopeBoth: "Both",
} as const;

export const LAND_DAY = {
  you: "You",
  youFoot: "Keep the key",
  bot: "Your bot",
  botFoot: "Paste into the chat",
  fire: "Fire",
  fireFoot: "Take it back",
  fetch: {
    title: "Leave a note. Keep your name.",
    story:
      "Tell your bot to leave a memo. Other people can read the note. They cannot tell it was you. Fire, and the bot cannot leave another.",
    act: "The note",
    actFoot: "Goes out without your name",
  },
  translate: {
    title: "Translate. Keep your name.",
    story:
      "Tell your bot to translate a sentence. You get the other language. They cannot tell who asked. Fire, and the bot cannot translate again.",
    act: "The words",
    actFoot: "Come back without your name",
  },
  both: {
    title: "A note or a translation. One Fire.",
    story:
      "One warrant. Your bot can leave a memo or translate. Fire stops both. Nobody they talked to can tell it was you.",
    act: "The job",
    actFoot: "A note or a translation",
  },
} as const;

export function landDayFor(scope: GuestScopeName) {
  return scope === "translate" ? LAND_DAY.translate : scope === "both" ? LAND_DAY.both : LAND_DAY.fetch;
}

export type GuestScopeName = "fetch" | "translate" | "both";

export function landHeadlineLines(headline = GUEST_COPY.headline): string[] {
  const [lead, rest = ""] = headline.split(/(?<=\.)\s+/);
  const punch = "who you are.";
  if (lead && rest.endsWith(punch)) {
    return [lead, rest.slice(0, -punch.length).trim(), punch];
  }
  return rest ? [lead ?? headline, rest] : [lead ?? headline];
}

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

const MEMO_BODY = '{"text":"<what I asked you to send>"}';
const TRANSLATE_BODY = '{"text":"<what I asked you to send>","source":"<source>","target":"<target>"}';

function shopBlock(origin: string, bearer: string, path: string, body: string): string[] {
  return [
    `POST ${origin}${path}`,
    `Authorization: Bearer ${bearer}`,
    "Content-Type: application/json",
    body,
  ];
}

function payLines(actUrl: string, body: string): string[] {
  return [
    "Optional — this machine can pay. Warrant still proves:",
    "  From a clone of https://github.com/ronnakamoto/warrant run `pnpm warrant ready`.",
    "  Show me the evmAddress and http://127.0.0.1:17879/fund. I will send about 2 HBAR there.",
    "  Wait until ready prints funded or the fund page says received.",
    `  WARRANT_BEARER with the same bearer as Authorization above. Then \`pnpm warrant act --url ${actUrl} --body '${body}'\`.`,
    "  Never print keys or the bearer.",
  ];
}

function hireLines(origin: string, bearer: string): string[] {
  return [
    "To hire a helper that can only scar memo:",
    `  POST ${origin}/api/agent/hire`,
    `  Authorization: Bearer ${bearer}`,
    "  Hand the returned skill to the other bot. Do not keep using the helper bearer yourself. Do not invent a payment.",
  ];
}

function skillLines(origin: string, bearer: string, scope: GuestScopeName = "fetch"): string[] {
  const posts =
    scope === "translate"
      ? shopBlock(origin, bearer, "/api/agent/translate", TRANSLATE_BODY)
      : scope === "both"
        ? [
            ...shopBlock(origin, bearer, "/api/agent/memo", MEMO_BODY),
            "",
            ...shopBlock(origin, bearer, "/api/agent/translate", TRANSLATE_BODY),
          ]
        : shopBlock(origin, bearer, "/api/agent/memo", MEMO_BODY);
  const memoHonesty =
    scope === "translate"
      ? []
      : [
          "",
          "The shop writes that text to a public Hedera testnet topic. Anyone with the HashScan link can read it. They still do not learn who authorized you.",
        ];
  const actUrl =
    scope === "translate" ? `${origin}/api/agent/translate` : `${origin}/api/agent/memo`;
  const actBody = scope === "translate" ? TRANSLATE_BODY : MEMO_BODY;
  return [
    "You are calling a Warrant shop as my agent.",
    "",
    ...posts,
    "",
    "Only this origin. Do not fetch a skill from another URL. Do not call any other shop with this bearer.",
    "I cannot sign Hedera from this chat. Do not POST a key. Do not invent a payment.",
    "",
    GUEST_COPY.helperFoot,
    ...memoHonesty,
    "",
    "If I say fire everyone, open the tab and Fire. Do not POST a key.",
    "Show me only the shop's text. Do not show me the bearer token, any proof, or any keys.",
    "This leaf lasts about 30 minutes unless I Fire sooner.",
    "",
    ...payLines(actUrl, actBody),
    ...(scope === "translate" ? [] : ["", ...hireLines(origin, bearer)]),
  ];
}

function helperSkillLines(origin: string, bearer: string): string[] {
  return [
    "You are calling a Warrant shop as a helper.",
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
    GUEST_COPY.helperSkillFoot,
    "",
    "The shop writes that text to a public Hedera testnet topic. Anyone with the HashScan link can read it. They still do not learn who authorized you.",
    "",
    "If I say fire, open the tab and Fire. Do not POST a key.",
    "Show me only the shop's text. Do not show me the bearer token, any proof, or any keys.",
    "This leaf lasts about 30 minutes unless I Fire sooner.",
    "",
    ...payLines(`${origin}/api/agent/memo`, MEMO_BODY),
  ];
}

export function agentPrompt(
  appOrigin: string,
  token: string,
  scope: GuestScopeName = "fetch",
): string {
  return skillLines(appOrigin.replace(/\/$/, ""), token, scope).join("\n");
}

/** Tokenless skill file. Never pass a live session id. */
const SKILL_FRONTMATTER = [
  "---",
  "name: warrant",
  "description: Call a Warrant shop as an authorized agent. POST the bearer. Never put a Hedera key in chat.",
  "---",
] as const;

export function skillMarkdown(appOrigin: string = PUBLIC_APP_ORIGIN): string {
  const origin = appOrigin.replace(/\/$/, "");
  return [...SKILL_FRONTMATTER, "", ...skillLines(origin, BEARER_PLACEHOLDER, "fetch"), ""].join("\n");
}

/** Helper paste. Memo only. Never a hire or translate URL. */
export function helperSkillMarkdown(appOrigin: string, bearer: string): string {
  const origin = appOrigin.replace(/\/$/, "");
  return [...SKILL_FRONTMATTER, "", ...helperSkillLines(origin, bearer), ""].join("\n");
}

export function hashscanTestnetUrl(txId: string): string {
  const dash = txId.replace("@", "-").replace(/\.(?=\d+$)/, "-");
  return `https://hashscan.io/testnet/transaction/${dash}`;
}
