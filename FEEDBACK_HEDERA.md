# Feedback — Hedera (Agentic Payments / Blocky402 / HCS)

Built against Hedera **testnet** with Blocky402 as the x402 facilitator and an HCS topic for privacy-preserving audit.

## What worked

- Registering `ExactHederaScheme` from `@x402/hedera/exact/server` **before** `x402HTTPResourceServer.initialize()` — required; registering after silently breaks paid accepts.
- Free tier via `onProtectedRequest` + `grantAccess: true` (not `onBeforeVerify { skip: true }`), then fallthrough to Hedera `exact` payment.
- HCS sink that submits **nullifier-only** JSON (no wallet, name, or Merkle path). Mirror: HashScan topic viewer.

## Friction

1. **Peer dependency skew** — `@hiero-ledger/proto` wants `protobufjs@8.0.1` and a pinned `debug`; pnpm warns while the app still runs. A clean resolution story in `@x402/hedera` / Hiero SDK docs would help.
2. **Facilitator vs resource server docs** — wiring `HTTPFacilitatorClient` + route `accepts` (`network: hedera:testnet`, `asset: 0.0.0`, `feePayer`) took reading both `@x402/core` and `@x402/hedera` examples; a single “minimal Hono resource server” snippet would cut an hour.
3. **Testnet faucet / fee payer** — demos need a funded fee payer (`BLOCKY402_FEE_PAYER` / account). Document the expected tinybar amounts next to the facilitator base URL.
4. **ECDSA account format** — mixing `0.0.N` account IDs with EVM `0x` addresses in the same `.env` is easy to swap; clearer naming in examples would help (`HEDERA_ACCOUNT_ID` vs `HEDERA_EVM_ADDRESS`).
5. **Hono `getBody` is async** — `resolveChallenge` awaits `getBody()` and hashes with `bodyHashFromCanonical` (parse + `JSON.stringify`, same as `warrant.fetch`) so pretty and compact JSON match.
6. **Payer ≠ payTo** — if the agent payer account equals `accepts[0].payTo`, ExactHedera settlement fails with `invalid_exact_hedera_payload_amount_mismatch` (self-transfer nets to zero). Document a separate merchant `HEDERA_PAY_TO` in client examples.
7. **Client spendControls** — `@x402/core` defaults reject Hedera HBAR `asset: 0.0.0` unless `spendControls: false` or an `allowedAssets` entry; demo clients must opt in explicitly.

## Wishlist

- Official `@x402/hono` + Hedera example that shows warrant-style extensions alongside `exact`.
- Mirror-node query examples for “latest message on topic” for README verification without opening HashScan.

## Demo env (non-secrets)

```text
HEDERA_NETWORK=testnet
HEDERA_MIRROR_NODE=https://testnet.mirrornode.hedera.com
BLOCKY402_URL=https://api.testnet.blocky402.com
```
