import { createPublicClient, http, type Address } from "viem";
import { baseSepolia } from "viem/chains";
import type { IRootChecker } from "@warrant/core";

const abi = [
  {
    type: "function",
    name: "currentRoot",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

/** Demo root policy: eth_call MandateRegistry.currentRoot — never isKnownRoot. */
export class CurrentRootChecker implements IRootChecker {
  readonly #client;
  readonly #address: Address;

  constructor(opts: { rpcUrl: string; registry: Address }) {
    this.#client = createPublicClient({
      chain: baseSepolia,
      transport: http(opts.rpcUrl),
    });
    this.#address = opts.registry;
  }

  async isAcceptable(merkleRoot: bigint): Promise<boolean> {
    if (merkleRoot === 0n) return false;
    const current = await this.#client.readContract({
      address: this.#address,
      abi,
      functionName: "currentRoot",
    });
    return current === merkleRoot;
  }

  async currentRoot(): Promise<bigint> {
    return this.#client.readContract({
      address: this.#address,
      abi,
      functionName: "currentRoot",
    });
  }
}

/** Test / offline: fixed acceptable root. */
export class FixedRootChecker implements IRootChecker {
  constructor(private readonly root: bigint) {}

  async isAcceptable(merkleRoot: bigint): Promise<boolean> {
    return merkleRoot !== 0n && merkleRoot === this.root;
  }
}
