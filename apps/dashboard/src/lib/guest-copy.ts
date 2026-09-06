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
  copyPrompt: "Copy for my agent",
  copied: "Copied.",
  shopLead: "Same warrant, this page acting as the agent.",
  shopLabel: "What your agent sends",
  shopCall: "Call the shop",
  proving: "Your agent is calling the shop…",
  successFoot: "The shop saw a nullifier, not you.",
  revoke: "Fire everyone",
  afterRevoke: "Every agent under you is done. The API still does not know who you were.",
  again: "Authorize another agent",
  quota: "Free calls used. Testnet paywall.",
  rateLimited: "Try again in a few minutes.",
  registry: "Registry",
  warrantTab: "Warrant",
  localhostHint:
    "Cloud agents (Grok) cannot reach 127.0.0.1. OpenClaw or Hermes on this machine can. A public https host is required for agents on the internet.",
} as const;

export function agentPrompt(appOrigin: string, token: string): string {
  const origin = appOrigin.replace(/\/$/, "");
  return [
    `POST ${origin}/api/agent/translate`,
    `Authorization: Bearer ${token}`,
    "Content-Type: application/json",
    "",
    '{"text":"<what I asked you to send>","source":"en","target":"es"}',
    "",
    `If I say fire everyone, POST ${origin}/api/agent/revoke with the same Authorization header and {}.`,
    "Show me only the shop's text. Do not show me the bearer token, any proof, or any keys.",
  ].join("\n");
}
