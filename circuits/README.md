# circuits

Circom sources and witness tests. No TypeScript runtime package.

| Path | Role |
|---|---|
| `lib/` | Shared templates: domain tags, hashes, attenuation, enabled prefix |
| `warrant_lean.circom` | WP1 — LeanIMT + attenuation (no EdDSA) |
| `warrant.circom` | WP2 — full circuit (5× EdDSAPoseidon) |
| `test/lib/` | Domain hashes, fixtures, [circom_tester](https://github.com/iden3/circom_tester) loader |
| `test/*.test.mjs` | Mocha suites: unit templates, lean, full (`checkConstraints`) |
| `test/warrant_full_prove.test.mjs` | Groth16 prove/verify (opt-in) |

```bash
pnpm test:circuit            # unit + lean + full (circom_tester)
pnpm test:circuit:full       # + Groth16 prove/verify
./scripts/compile-circuit warrant
```

Ceremony / verifier: see `CEREMONY.md`.
