import { keccak_256 } from "@noble/hashes/sha3";

/** Keccak of UTF-8 bytes as 0x-hex. */
export function bodyHashFromRaw(body: string | Uint8Array | undefined | null): string {
  if (body === undefined || body === null) return "";
  if (typeof body === "string") {
    if (body.length === 0) return "";
    return bytesToHex(keccak_256(new TextEncoder().encode(body)));
  }
  if (body.length === 0) return "";
  return bytesToHex(keccak_256(body));
}

/**
 * Hash a request body the same way Hono `getBody()` + `JSON.stringify` does:
 * parse JSON when possible, then keccak the canonical `JSON.stringify` bytes.
 * Pretty-printed and compact JSON of the same object therefore match.
 */
export function bodyHashFromCanonical(body: unknown): string {
  if (body === undefined || body === null) return "";
  if (typeof body === "string") {
    if (body.length === 0) return "";
    try {
      return bodyHashFromRaw(JSON.stringify(JSON.parse(body)));
    } catch {
      return bodyHashFromRaw(body);
    }
  }
  if (body instanceof Uint8Array) {
    return bodyHashFromCanonical(new TextDecoder().decode(body));
  }
  return bodyHashFromRaw(JSON.stringify(body));
}

function bytesToHex(bytes: Uint8Array): string {
  let hex = "0x";
  for (const b of bytes) hex += b.toString(16).padStart(2, "0");
  return hex;
}
