import { createAgentBookVerifier, AGENTKIT, createAgentkitClient, declareAgentkitExtension } from "@worldcoin/agentkit";
import { createPublicClient, http, parseAbi } from "viem";
import { worldchain } from "viem/chains";

const RPC = "https://worldchain-mainnet.g.alchemy.com/public";
const AB = "0xA23aB2712eA7BBa896930544C7d6636a96b944dA";

const client = createPublicClient({ chain: worldchain, transport: http(RPC) });

const t0 = Date.now();
const code = await client.getCode({ address: AB });
const nonceZero = await client.readContract({
  address: AB,
  abi: parseAbi(["function getNextNonce(address) view returns (uint256)"]),
  functionName: "getNextNonce",
  args: ["0x0000000000000000000000000000000000000001"],
});
const groupId = await client.readContract({
  address: AB,
  abi: parseAbi(["function groupId() view returns (uint256)"]),
  functionName: "groupId",
});
const humanZero = await client.readContract({
  address: AB,
  abi: parseAbi(["function lookupHuman(address) view returns (uint256)"]),
  functionName: "lookupHuman",
  args: ["0x0000000000000000000000000000000000000001"],
});

const verifier = createAgentBookVerifier({ rpcUrl: RPC });
const sdkLookup = await verifier.lookupHuman("0x0000000000000000000000000000000000000001");

const declared = declareAgentkitExtension({
  domain: "translate.warrant.example",
  resourceUri: "https://translate.warrant.example/v1/translate",
  statement: "Prove a Warrant chain rooted in a unique human",
  network: "eip155:480",
  mode: { type: "free-trial", uses: 3 },
});

const result = {
  rpcMs: Date.now() - t0,
  chainId: await client.getChainId(),
  agentBook: {
    address: AB,
    bytecodeBytes: (code.length - 2) / 2,
    groupId: groupId.toString(),
    getNextNonce_0x1: nonceZero.toString(),
    lookupHuman_0x1: humanZero.toString(),
    sdkLookupNullForUnregistered: sdkLookup === null,
  },
  extensionKey: AGENTKIT,
  declaredExtension: declared,
  clientExports: {
    createAgentkitClient: typeof createAgentkitClient,
  },
};

console.log(JSON.stringify(result, null, 2, (k, v) => (typeof v === "bigint" ? v.toString() : v)));
