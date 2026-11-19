/** Fixed-window counter per key (IP). In memory: resets on restart, fine for one API process. */
export interface RateRule {
  max: number;
  windowMs: number;
}

export class RateLimiter {
  private readonly hits = new Map<string, Array<{ start: number; count: number }>>();

  constructor(private readonly rules: RateRule[], private readonly now: () => number = Date.now) {}

  /** Counts one hit. Returns the seconds to wait when a rule is over its limit, else null. */
  take(key: string): number | null {
    const t = this.now();
    const windows = this.hits.get(key) ?? this.rules.map(() => ({ start: t, count: 0 }));
    let wait: number | null = null;
    this.rules.forEach((rule, i) => {
      const w = windows[i]!;
      if (t - w.start >= rule.windowMs) {
        w.start = t;
        w.count = 0;
      }
      if (w.count >= rule.max) {
        wait = Math.max(wait ?? 0, Math.ceil((w.start + rule.windowMs - t) / 1000));
      }
    });
    if (wait === null) for (const w of windows) w.count += 1;
    this.hits.set(key, windows);
    if (this.hits.size > 10_000) this.prune(t);
    return wait;
  }

  private prune(t: number): void {
    const longest = Math.max(...this.rules.map((rule) => rule.windowMs));
    for (const [key, windows] of this.hits) {
      if (windows.every((w) => t - w.start >= longest)) this.hits.delete(key);
    }
  }
}
