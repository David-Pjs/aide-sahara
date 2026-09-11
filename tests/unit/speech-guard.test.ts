import { describe, expect, it } from "vitest";
import { MAX_AUDIO_BYTES, RateLimiter, clientKey, isSameOrigin, requestHost } from "../../lib/speech/guard";

// The speech endpoint spends shared quota on every call. These guards are what
// stop someone else's script from spending it and leaving the next person who
// talks to Aide with silence.

const req = (headers: Record<string, string>) =>
  new Request("https://aide-ng.vercel.app/api/stt", { method: "POST", headers });

describe("same-origin check", () => {
  it("accepts a request from Aide's own page", () => {
    expect(isSameOrigin(req({ host: "aide-ng.vercel.app", origin: "https://aide-ng.vercel.app" }))).toBe(true);
  });

  it("refuses a request from another site", () => {
    expect(isSameOrigin(req({ host: "aide-ng.vercel.app", origin: "https://quota-thief.example" }))).toBe(false);
  });

  it("refuses a request carrying neither Origin nor Referer", () => {
    expect(isSameOrigin(req({ host: "aide-ng.vercel.app" }))).toBe(false);
  });

  it("falls back to Referer when Origin is absent", () => {
    expect(isSameOrigin(req({ host: "aide-ng.vercel.app", referer: "https://aide-ng.vercel.app/jobs" }))).toBe(true);
  });

  it("uses the forwarded host that Vercel sets", () => {
    const r = req({ host: "internal-host", "x-forwarded-host": "aide-ng.vercel.app", origin: "https://aide-ng.vercel.app" });
    expect(requestHost(r)).toBe("aide-ng.vercel.app");
    expect(isSameOrigin(r)).toBe(true);
  });
});

describe("client key", () => {
  it("uses the first address in x-forwarded-for", () => {
    expect(clientKey(req({ "x-forwarded-for": "102.89.1.7, 10.0.0.1" }))).toBe("102.89.1.7");
  });

  it("falls back to x-real-ip", () => {
    expect(clientKey(req({ "x-real-ip": "41.58.2.9" }))).toBe("41.58.2.9");
  });
});

describe("rate limiter", () => {
  it("allows a client its budget, then refuses, then allows again once the window passes", () => {
    let clock = 0;
    const limiter = new RateLimiter(3, 60_000, () => clock);
    expect([limiter.allow("a"), limiter.allow("a"), limiter.allow("a")]).toEqual([true, true, true]);
    expect(limiter.allow("a")).toBe(false);
    clock += 60_001;
    expect(limiter.allow("a")).toBe(true);
  });

  it("keeps clients' budgets separate", () => {
    const limiter = new RateLimiter(1, 60_000, () => 0);
    expect(limiter.allow("a")).toBe(true);
    expect(limiter.allow("a")).toBe(false);
    expect(limiter.allow("b")).toBe(true);
  });
});

describe("size cap", () => {
  it("is far above what an eight-second utterance produces", () => {
    // Eight seconds of iPhone AAC is roughly 200 KB.
    expect(MAX_AUDIO_BYTES).toBeGreaterThan(10 * 200 * 1024);
  });
});
