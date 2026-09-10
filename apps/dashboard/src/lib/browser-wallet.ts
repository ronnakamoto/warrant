"use client";

import { type Address, type Hex, getAddress, isAddress, stringToHex } from "viem";

export class WalletRejectedError extends Error {
  constructor() {
    super("wallet rejected");
    this.name = "WalletRejectedError";
  }
}

function injected(): EthereumProvider | undefined {
  if (typeof window === "undefined") return undefined;
  return window.ethereum;
}

export async function connectRootWallet(): Promise<Address> {
  const eth = injected();
  if (!eth) throw new Error("NO_WALLET");
  try {
    const accounts = (await eth.request({ method: "eth_requestAccounts" })) as unknown;
    const address = Array.isArray(accounts) ? accounts[0] : undefined;
    if (typeof address !== "string" || !isAddress(address)) throw new Error("NO_WALLET");
    return getAddress(address);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === "NO_WALLET") throw err;
    if (/reject|denied|user abort|cancel/i.test(msg)) throw new WalletRejectedError();
    throw err;
  }
}

export function deskMessage(wallet: Address, nonce: string): string {
  return `Warrant desk\n${getAddress(wallet)}\n${nonce}`;
}

export async function signDeskMessage(wallet: Address, nonce: string): Promise<Hex> {
  const eth = injected();
  if (!eth) throw new Error("NO_WALLET");
  const message = deskMessage(wallet, nonce);
  try {
    const signature = await eth.request({
      method: "personal_sign",
      params: [stringToHex(message), wallet],
    });
    if (typeof signature !== "string") throw new Error("NO_WALLET");
    return signature as Hex;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === "NO_WALLET") throw err;
    if (/reject|denied|user abort|cancel/i.test(msg)) throw new WalletRejectedError();
    throw err;
  }
}

type EthereumProvider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
};

declare global {
  interface Window {
    ethereum?: EthereumProvider;
  }
}
