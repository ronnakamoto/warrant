export const DOCS_COPY = {
  title: "How Warrant works",
  lead: "You already have a bot. This is the key it carries when it leaves the chat and acts.",
  youHaveABot:
    "Grok, Hermes, OpenClaw — anything that can make an HTTP request. Meeting another bot is not acting. Acting is calling a shop, hiring a helper, spending. That is where a human has to stay in authority without staying in the message.",
  whatYouDo:
    "Open Warrant. Authorize with MetaMask. Copy one paragraph into the bot you already have. The bot calls a shop we operate, or a shop someone wrapped with the kit. When you are done, Fire. The next call dies. The shop still does not know it was you.",
  whatYouSaw:
    "You signed. You kept the EVM key. You can Fire from a new browser with the same MetaMask. The bot never got that key.",
  whatWarrantSaw:
    "Warrant sees the witness. The hosted helper builds the Groth16 proof for a cloud bot so that bot never downloads a zkey. That is the honesty of this host. A local CLI prove does not show us the witness.",
  whatChatSaw: "The chat can see the bearer. Treat that paragraph like a key. Anyone who has it can act until you Fire.",
  whatShopSaw:
    "The shop sees a nullifier, a live root, a scope, a budget ceiling, an expiry, a tier, and a hash of this exact request. Eight public signals. Not your name. Not your address. Not the hops.",
  theMachine:
    "A warrant is a leaf under a root. Your MetaMask binds that root on Base Sepolia in a LeanIMT. Off-chain hops can only get narrower — scope is a subset, budget and expiry can only shrink. The leaf proves membership, the chain, and that this request was the one the shop challenged. Revoke bumps the epoch on that leaf. Every hop under you dies. The next prove is 403 because the merkle root moved, not because a session cookie expired.",
  pay:
    "The first shop call is a 402. Hosted chat cannot invent payment. A machine agent with a funded Hedera purse can pay ExactHedera on testnet. We do not sponsor the 402. We do not put a Hedera key on this site.",
  whatThisIsNot:
    "Not a World ID proof. The host binds tier=0. Groth16 is a solo ceremony — fine on testnet, said plainly. Memo text you post is public on HashScan testnet. We do not host a reverse proxy and we do not protect a URL you paste. Wrap your own shop.",
  wrapShop:
    "An integrator wraps their own Hono POST with createWarrantShop and warrantHono from @ronnakamoto/warrant-x402. The request body stays in their process. Do not call prove from a bot; this site’s agent API proves for the Copy bearer.",
  registryFoot: "The operator graph of bound roots lives on Registry. It is not the product.",
} as const;

export const DOCS_DIAGRAMS = [
  { id: "loop", title: "The loop" },
  { id: "chain", title: "The chain" },
  { id: "sees", title: "Who sees what" },
  { id: "fire", title: "Fire" },
] as const;

export const DOCS_NAV = [
  { href: "#you", label: "You already have a bot" },
  { href: "#do", label: "What you do" },
  { href: "#saw", label: "What each party saw" },
  { href: "#machine", label: "The machine" },
  { href: "#diagrams", label: "Diagrams" },
  { href: "#not", label: "What this is not" },
  { href: "#shop", label: "If you run a shop" },
] as const;
