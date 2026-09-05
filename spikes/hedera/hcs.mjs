import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  Client,
  AccountId,
  PrivateKey,
  TopicCreateTransaction,
  TopicMessageSubmitTransaction,
} from "@hiero-ledger/sdk";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "../..");

function loadEnvFile(path) {
  if (!existsSync(path)) return;
  for (const raw of readFileSync(path, "utf8").split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 1) continue;
    const key = line.slice(0, eq);
    let value = line.slice(eq + 1);
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

loadEnvFile(join(repoRoot, ".env"));
loadEnvFile(join(here, ".env"));

const accountId = process.env.HEDERA_ACCOUNT_ID;
const privateKeyHex = process.env.HEDERA_PRIVATE_KEY;
if (!accountId || !privateKeyHex) {
  console.error("Need HEDERA_ACCOUNT_ID and HEDERA_PRIVATE_KEY in .env");
  process.exit(2);
}

const MIRROR = "https://testnet.mirrornode.hedera.com/api/v1";
const accountRes = await fetch(`${MIRROR}/accounts/${accountId}`);
const account = await accountRes.json();

const operatorId = AccountId.fromString(accountId);
const operatorKey = PrivateKey.fromStringECDSA(privateKeyHex);
const derivedEvm = operatorKey.publicKey.toEvmAddress();
const client = Client.forTestnet();
client.setOperator(operatorId, operatorKey);

const create = await new TopicCreateTransaction()
  .setTopicMemo("warrant-research HCS audit")
  .freezeWith(client)
  .sign(operatorKey);
const createResp = await create.execute(client);
const createReceipt = await createResp.getReceipt(client);
const topicId = createReceipt.topicId.toString();

const payload = JSON.stringify({
  nullifier: "spike",
  scope: 1,
  tier: 2,
  note: "nameless audit line",
});
const submit = await new TopicMessageSubmitTransaction()
  .setTopicId(topicId)
  .setMessage(payload)
  .freezeWith(client)
  .sign(operatorKey);
const submitResp = await submit.execute(client);
const submitReceipt = await submitResp.getReceipt(client);

client.close();

const result = {
  ok: createReceipt.status.toString() === "SUCCESS" && submitReceipt.status.toString() === "SUCCESS",
  accountId,
  evmAddress: account.evm_address,
  derivedEvm: derivedEvm.startsWith("0x") ? derivedEvm : `0x${derivedEvm}`,
  evmMatches: account.evm_address?.toLowerCase() === `0x${derivedEvm.replace(/^0x/, "")}`.toLowerCase(),
  keyType: account.key?._type,
  balanceTinybars: account.balance?.balance,
  balanceHbar: Number(account.balance?.balance ?? 0) / 1e8,
  topicId,
  create: {
    status: createReceipt.status.toString(),
    transactionId: createResp.transactionId.toString(),
    hashscan: `https://hashscan.io/testnet/transaction/${createResp.transactionId.toString()}`,
  },
  submit: {
    status: submitReceipt.status.toString(),
    transactionId: submitResp.transactionId.toString(),
    hashscan: `https://hashscan.io/testnet/transaction/${submitResp.transactionId.toString()}`,
    topic: `https://hashscan.io/testnet/topic/${topicId}`,
    message: payload,
  },
  payTo: accountId,
  implication:
    "HCS topic create + submit works with @hiero-ledger/sdk and this ECDSA operator. Use this account as Blocky402 payTo. Do not commit the private key.",
};

writeFileSync(join(here, "hcs-results.json"), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
