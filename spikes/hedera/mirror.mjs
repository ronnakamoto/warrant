const BASE = "https://testnet.mirrornode.hedera.com/api/v1";

async function get(path) {
  const t0 = Date.now();
  const res = await fetch(BASE + path, { headers: { accept: "application/json" } });
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text.slice(0, 200);
  }
  return { status: res.status, ms: Date.now() - t0, body };
}

const supply = await get("/network/supply");
const nodes = await get("/network/nodes?limit=1");
const tx = await get("/transactions?limit=1&order=desc");
const topicCreate = await fetch(BASE + "/topics", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: "{}",
});
const topicCreateText = await topicCreate.text();

const sampleTx = tx.body?.transactions?.[0];

console.log(
  JSON.stringify(
    {
      supply: { status: supply.status, released: supply.body.released_supply, total: supply.body.total_supply },
      nodes: { status: nodes.status, first: nodes.body.nodes?.[0]?.description, nodeAccount: nodes.body.nodes?.[0]?.node_account_id },
      latestTx: {
        status: tx.status,
        transaction_id: sampleTx?.transaction_id,
        name: sampleTx?.name,
        result: sampleTx?.result,
      },
      topicsPostWithoutAuth: { status: topicCreate.status, body: topicCreateText.slice(0, 200) },
      implication: "Mirror node is live for reads. Topic creation requires a signed Hedera SDK transaction (needs testnet account + key), not a REST POST. Plan: create HCS topic via @hiero-ledger/sdk on day 8 once a testnet account exists.",
    },
    null,
    2,
  ),
);
