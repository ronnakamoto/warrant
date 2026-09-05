import { keccak_256 } from "@noble/hashes/sha3";

/** Match translate `bodyHashFromContext` — keccak of raw UTF-8 body bytes as 0x-hex. */
export function bodyHashFromRaw(body: string | Uint8Array | undefined | null): string {
  if (body === undefined || body === null) return "";
  if (typeof body === "string") {
    if (body.length === 0) return "";
    return bytesToHex(keccak_256(new TextEncoder().encode(body)));
  }
  if (body.length === 0) return "";
  return bytesToHex(keccak_256(body));
}

function bytesToHex(bytes: Uint8Array): string {
  let hex = "0x";
  for (const b of bytes) hex += b.toString(16).padStart(2, "0");
  return hex;
}
