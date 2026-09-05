/** Resource payload — no proofs, no payments. */
export function translate(input: string): string {
  return input.split("").reverse().join("");
}
