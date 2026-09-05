import { createPublicClient, http, parseAbi } from "viem";
import { sepolia } from "viem/chains";

const RPC = "https://ethereum-sepolia-rpc.publicnode.com";
const client = createPublicClient({ chain: sepolia, transport: http(RPC) });

const ADDRESSES = {
  ensUniversalResolver: "0xeEeEEEeE14D718C2B47D9923Deab1335E144EeEe",
  ensRegistry: "0xBDC85dD5b15D7ecb354cd7cb6f2c50b4f2c4F0E2", // ETHRegistry from ensjs 2026-07-30
  ensVerifiableFactory: "0x10dC6333CDFe1FCEf624c6e0a8221b91804Cd7ef",
  ensPermissionedResolverImpl: "0x9EAe5C2730a7dD16BDD1DeE6421a1B91e3B0365e",
  ensUserRegistryImpl: "0x624a25d67B59D587752EbEc8DdeD8827dAe52050",
  ensEthRegistrar: "0xa88553F454b77203B0D036A05c894d555EAAa2Cc",
};

const sizes = {};
for (const [k, address] of Object.entries(ADDRESSES)) {
  const code = await client.getCode({ address });
  sizes[k] = { address, bytecodeBytes: code && code !== "0x" ? (code.length - 2) / 2 : 0 };
}

const parent = await client.readContract({
  address: ADDRESSES.ensRegistry,
  abi: parseAbi(["function getParent() view returns (address, string)"]),
  functionName: "getParent",
});

const is1155 = await client.readContract({
  address: ADDRESSES.ensRegistry,
  abi: parseAbi(["function supportsInterface(bytes4) view returns (bool)"]),
  functionName: "supportsInterface",
  args: ["0xd9b67a26"],
});

const hasRootRolesFalse = await client.readContract({
  address: ADDRESSES.ensRegistry,
  abi: parseAbi(["function hasRootRoles(uint256,address) view returns (bool)"]),
  functionName: "hasRootRoles",
  args: [1n, "0x0000000000000000000000000000000000000001"],
});

const ethFromRoot = await client.readContract({
  address: parent[0],
  abi: parseAbi(["function getSubregistry(string) view returns (address)"]),
  functionName: "getSubregistry",
  args: ["eth"],
});

console.log(
  JSON.stringify(
    {
      chainId: await client.getChainId(),
      sizes,
      ethRegistry: {
        getParent: { rootRegistry: parent[0], label: parent[1] },
        supportsERC1155: is1155,
        hasRootRoles_dummy: hasRootRolesFalse,
        rootGetSubregistry_eth: ethFromRoot,
        rootMatchesEnsjs: ethFromRoot.toLowerCase() === ADDRESSES.ensRegistry.toLowerCase(),
      },
      note: "ENSv2 Sepolia addresses taken from ensjs l1.ts (2026-07-30 redeploy). Pin in deployments/ and re-verify on day 9.",
    },
    null,
    2,
  ),
);
