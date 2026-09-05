/** Server-issued challenge material — never accept amount/payTo/bodyHash from the client. */
export type IssuedChallenge = {
  nonce: string;
  merkleRoot: string;
  issuedAt: string;
};

/**
 * Lookup by nonce for multi-request demos. Single-process; swap for Redis in prod.
 */
export class MemoryChallengeStore {
  readonly #byNonce = new Map<string, IssuedChallenge>();
  #last: IssuedChallenge | undefined;

  put(issued: IssuedChallenge): void {
    this.#byNonce.set(issued.nonce, issued);
    this.#last = issued;
  }

  /** Prefer explicit nonce; otherwise last issued (single-client demo). */
  resolve(nonceHint?: string): IssuedChallenge | undefined {
    if (nonceHint) return this.#byNonce.get(nonceHint);
    return this.#last;
  }

  last(): IssuedChallenge | undefined {
    return this.#last;
  }
}
