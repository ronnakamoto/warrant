export type RateLimiter = {
  take(key: string): boolean;
};

export function createRateLimiter(opts: {
  max: number;
  windowMs: number;
  now?: () => number;
}): RateLimiter {
  const hits = new Map<string, number[]>();
  const now = opts.now ?? Date.now;
  return {
    take(key) {
      const t = now();
      const prior = (hits.get(key) ?? []).filter((x) => t - x < opts.windowMs);
      if (prior.length >= opts.max) {
        hits.set(key, prior);
        return false;
      }
      prior.push(t);
      hits.set(key, prior);
      return true;
    },
  };
}
