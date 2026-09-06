"use client";

import {
  createWalletClient,
  custom,
  type Address,
  type Hex,
} from "viem";
import { baseSepolia } from "viem/chains";
import { mandateRegistryAbi } from "./registry";
import { WalletRejectedError } from "./browser-wallet";

function injected(): { request: (args: { method: string; params?: unknown[] }) => Promise<unknown> } {
  if (typeof window === "undefined" || !window.ethereum) {
    throw new Error("NO_WALLET");
  }
  return window.ethereum;
}

function isReject(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /reject|denied|user abort|cancel/i.test(msg);
}

export async function revokeFromInjected(args: {
  siblings: string[];
  wallet: Address;
  registry: Address;
}): Promise<Hex> {
  const eth = injected();
  const client = createWalletClient({
    account: args.wallet,
    chain: baseSepolia,
    transport: custom(eth),
  });
  try {
    await client.switchChain({ id: baseSepolia.id });
  } catch (err) {
    if (isReject(err)) throw new WalletRejectedError();
    try {
      await client.addChain({ chain: baseSepolia });
      await client.switchChain({ id: baseSepolia.id });
    } catch (inner) {
      if (isReject(inner)) throw new WalletRejectedError();
      throw inner;
    }
  }
  try {
    return await client.writeContract({
      address: args.registry,
      abi: mandateRegistryAbi,
      functionName: "revoke",
      args: [args.siblings.map((s) => BigInt(s))],
    });
  } catch (err) {
    if (isReject(err)) throw new WalletRejectedError();
    throw err;
  }
}
