# @warrant/core

Domain + Groth16 for Warrant. No HTTP, no Hedera, no React.

Node 20+. ESM. The consumer supplies the verification key path:

```ts
import { SnarkjsVerifier } from "@warrant/core";
const verifier = SnarkjsVerifier.fromPath(process.env.WARRANT_VKEY_PATH);
```

Do not ship a zkey in this package.

See [LICENSE](../../LICENSE) (Apache-2.0).
