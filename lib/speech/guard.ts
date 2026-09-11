// Keeps the speech endpoint for Aide's own pages.
//
// Every transcription spends credit or quota, and the free Groq plan allows 20
// requests a minute across the whole account. Left open, anyone who found the
// address could spend it, and the next person testing the live site would be
// met with silence. So the endpoint accepts same-origin requests only, caps the
// upload well above any real utterance, and gives each client a request budget.

// The recorder stops an utterance at 8 seconds. Eight seconds of Opus is about
// 100 KB and of iPhone AAC about 200 KB, so 3 MB is room to spare, not a limit
// a real speaker can reach.
export const MAX_AUDIO_BYTES = 3 * 1024 * 1024;

export function requestHost(req: Request): string | null {
  const forwarded = req.headers.get("x-forwarded-host");
  if (forwarded) return forwarded.split(",")[0].trim();
  const host = req.headers.get("host");
  if (host) return host;
  try {
    return new URL(req.url).host;
  } catch {
    return null;
  }
}

/** True when the request comes from a page on the same host. Browsers send
 *  Origin on every POST made with fetch; Referer is the fallback for the rare
 *  client that strips it. A request carrying neither is not from a browser page
 *  and is refused. */
export function isSameOrigin(req: Request): boolean {
  const host = requestHost(req);
  if (!host) return false;
  const source = req.headers.get("origin") ?? req.headers.get("referer");
  if (!source) return false;
  try {
    return new URL(source).host === host;
  } catch {
    return false;
  }
}

export function clientKey(req: Request): string {
  const forwardedFor = req.headers.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

/** Sliding-window request budget per client. In memory, so it holds per server
 *  instance rather than globally; that is enough to stop one visitor using up
 *  the shared quota, which is its only job. */
export class RateLimiter {
  private readonly hits = new Map<string, number[]>();
  private readonly limit: number;
  private readonly windowMs: number;
  private readonly now: () => number;

  constructor(limit: number, windowMs: number, now: () => number = () => Date.now()) {
    this.limit = limit;
    this.windowMs = windowMs;
    this.now = now;
  }

  allow(key: string): boolean {
    const t = this.now();
    const recent = (this.hits.get(key) ?? []).filter((stamp) => t - stamp < this.windowMs);
    if (recent.length >= this.limit) {
      this.hits.set(key, recent);
      return false;
    }
    recent.push(t);
    this.hits.set(key, recent);
    if (this.hits.size > 5000) this.prune(t);
    return true;
  }

  private prune(t: number): void {
    for (const [key, stamps] of this.hits) {
      if (stamps.every((stamp) => t - stamp >= this.windowMs)) this.hits.delete(key);
    }
  }
}
