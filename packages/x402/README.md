# @ronnakamoto/warrant-x402

Wrap a Hono `POST` with Warrant + Hedera Exact x402.

We do **not** host a reverse proxy and do **not** “protect any URL” you paste. Wrap your own Hono `POST` with `createWarrantShop` + `warrantHono`. The request body stays in your process.

```ts
import { Hono } from "hono";
import { FETCH, SnarkjsVerifier } from "@ronnakamoto/warrant-core";
import {
  createWarrantShop,
  initializeWarrantShop,
  CurrentRootChecker,
  FileNullifierStore,
  FileChallengeStore,
  warrantHono,
} from "@ronnakamoto/warrant-x402";

const roots = new CurrentRootChecker({
  rpcUrl: process.env.BASE_SEPOLIA_RPC!,
  registry: process.env.REGISTRY_ADDRESS as `0x${string}`,
});
const shop = createWarrantShop({
  route: "POST /v1/orders",
  description: "orders",
  policy: { requireScope: FETCH, minTier: 0, freeCallsPerHuman: 0 },
  amount: process.env.X402_AMOUNT ?? "100000",
  payTo: process.env.HEDERA_PAY_TO!,
  verifier: SnarkjsVerifier.fromPath(process.env.WARRANT_VKEY_PATH!),
  roots,
  getMerkleRoot: async () => (await roots.currentRoot()).toString(),
  nullifiers: new FileNullifierStore(process.env.WARRANT_NULLIFIER_PATH!),
  challenges: new FileChallengeStore(process.env.WARRANT_CHALLENGE_PATH!),
  defaultPath: "/v1/orders",
});
await initializeWarrantShop(shop);

const app = new Hono();
app.use("/v1/*", warrantHono(shop));
app.post("/v1/orders", async (c) => {
  const order = await createOrder(await c.req.json());
  return c.json(order);
});
```

## Any machine

1. Node 20.18+ (macOS, Linux, or Windows).
2. `npm i @ronnakamoto/warrant-core @ronnakamoto/warrant-x402 hono viem`
3. Put the Groth16 vkey on disk. Set `WARRANT_VKEY_PATH` to an **absolute** path.
4. Set `BASE_SEPOLIA_RPC`, `REGISTRY_ADDRESS`, `HEDERA_PAY_TO`, nullifier and challenge file paths.
5. `initializeWarrantShop(shop)` after construct. Registering ExactHedera happens inside the factory **before** initialize.

This package does not include a zkey. It does not protect a URL you paste. Your process wraps your route.

See [LICENSE](../../LICENSE) (Apache-2.0).
