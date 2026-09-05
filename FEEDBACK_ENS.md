# Feedback — ENS (ENSv2)

## Scope decision

**ENSv2 / PermissionedRegistry was skipped** on the solo delivery path (`docs/05` §11). Warrant demos bind → delegate → prove/pay → revoke without agent subnames.

## Why skip

- Solo bandwidth after circuit, registry, x402, agent, and dashboard.
- ENSv2 Sepolia **redeploys** (noted in research/kickoff) make pinned addresses a moving target mid-hackathon.
- Core revoke story is already on-chain via `MandateRegistry.revoke` → `currentRoot` / `root_revoked`; ENS unregister would be a parallel UX, not the authorization root of trust.

## If revisited

- Custom PermissionedRegistry for `agents.<demo>.eth`, EAC roles ↔ scope bits, Permissioned Resolver ENSIP-25/26 → ERC-8004 id.
- Revoke should `unregister` the subname in the same user action as epoch bump (or document two-step clearly).
- Pin addresses under `deployments/` and re-run a phase script whenever Sepolia ENSv2 moves.

## Feedback for ENS docs

- Publish a **redeploy changelog** or immutable “hackathon pin” tag so integrations do not wake up to new registry addresses mid-event.
- A minimal PermissionedRegistry + EAC “hello subname” Foundry template would lower time-to-first-demo for agent-namespace apps.
