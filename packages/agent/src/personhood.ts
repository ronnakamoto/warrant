import { createPublicClient, http, type Address, type Chain } from "viem";
import type { IPersonhood } from "@warrant/core";

/** Always unbound — documented tier=0 demo path (no World Sandbox). */
export class TierZeroPersonhood implements IPersonhood {
  async lookupHuman(_agentWallet: `0x${string}`): Promise<bigint | null> {
    return null;
  }
}

const agentBookAbi = [
  {
    type: "function",
    name: "lookupHuman",
    stateMutability: "view",
    inputs: [{ name: "agent", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

export type AgentBookPersonhoodArgs = {
  rpcUrl: string;
  agentBook: Address;
  chain?: Chain;
};

/**
 * World AgentBook read adapter.
 * Returns null when lookup reverts or returns 0.
 */
export class AgentBookPersonhood implements IPersonhood {
  readonly #rpcUrl: string;
  readonly #agentBook: Address;
  readonly #chain: Chain | undefined;

  constructor(args: AgentBookPersonhoodArgs) {
    this.#rpcUrl = args.rpcUrl;
    this.#agentBook = args.agentBook;
    this.#chain = args.chain;
  }

  async lookupHuman(agentWallet: `0x${string}`): Promise<bigint | null> {
    try {
      const client = createPublicClient({
        chain: this.#chain,
        transport: http(this.#rpcUrl),
      });
      const id = await client.readContract({
        address: this.#agentBook,
        abi: agentBookAbi,
        functionName: "lookupHuman",
        args: [agentWallet],
      });
      if (id === 0n) return null;
      return id;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // Contract revert / missing function → unbound. Transport errors must not look like "not registered".
      if (/revert|execution reverted|ContractFunctionExecutionError/i.test(msg)) return null;
      throw err;
    }
  }
}

/** Prefer AgentBook when env is set; otherwise tier-zero stub. */
export function personhoodFromEnv(env: NodeJS.ProcessEnv = process.env): IPersonhood {
  const rpc = env.WORLDCHAIN_RPC;
  const book = env.AGENTBOOK_ADDRESS as Address | undefined;
  if (rpc && book && /^0x[0-9a-fA-F]{40}$/.test(book)) {
    return new AgentBookPersonhood({ rpcUrl: rpc, agentBook: book });
  }
  return new TierZeroPersonhood();
}
