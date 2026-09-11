import { beforeEach, describe, expect, it } from "vitest";
import {
  LONG_COOLDOWN_MS,
  SHORT_COOLDOWN_MS,
  SpeechUnavailableError,
  classifyFailure,
  providerOrder,
  resetCooldowns,
  transcribeWithFallback,
  type SpeechProviderName,
  type Transcriber,
} from "../../lib/speech/providers";

// This chain is the difference between a blind user hearing a reply and hearing
// nothing, so each test is a real way it could have left them in silence.

const audio = new Blob([new Uint8Array(8000)], { type: "audio/webm" });
const ok = (text: string): Transcriber => async () => text;
const fail = (message: string): Transcriber => async () => {
  throw new Error(message);
};
const never: Transcriber = () => new Promise<string>(() => {});

function deps(
  t: Partial<Record<SpeechProviderName, Transcriber>>,
  opts: { keys?: SpeechProviderName[]; now?: () => number; order?: SpeechProviderName[]; timeoutMs?: number } = {},
) {
  return {
    order: opts.order ?? (["sahara", "groq"] as SpeechProviderName[]),
    transcribers: { sahara: t.sahara ?? ok("from sahara"), groq: t.groq ?? ok("from groq") },
    hasKey: (p: SpeechProviderName) => (opts.keys ?? ["sahara", "groq"]).includes(p),
    now: opts.now,
    timeoutMs: opts.timeoutMs,
  };
}

const SAHARA_EMPTY = 'Sahara STT failed (400): {"data":{},"message":"insufficient balance to process the file","status":"Error"}';
const GROQ_EMPTY = 'Groq STT failed (402): {"error":"You have depleted your monthly included credits."}';

beforeEach(() => resetCooldowns());

describe("provider order", () => {
  it("tries Sahara first by default", () => {
    expect(providerOrder(undefined)).toEqual(["sahara", "groq"]);
  });

  it("follows configuration and drops unknown names and duplicates", () => {
    expect(providerOrder("groq, SAHARA, whisperx, groq")).toEqual(["groq", "sahara"]);
  });
});

describe("fallback chain", () => {
  it("uses Sahara when Sahara works", async () => {
    const r = await transcribeWithFallback(audio, "u.webm", "pcm", deps({}));
    expect(r.provider).toBe("sahara");
    expect(r.transcript).toBe("from sahara");
  });

  it("falls through to Groq in the same request when Sahara is out of credit", async () => {
    const r = await transcribeWithFallback(audio, "u.webm", "pcm", deps({ sahara: fail(SAHARA_EMPTY) }));
    expect(r.provider).toBe("groq");
    expect(r.attempts[0]).toMatchObject({ provider: "sahara", outcome: "failed", reason: "credit-or-auth" });
  });

  it("skips a provider with no key without calling it", async () => {
    let called = false;
    const r = await transcribeWithFallback(
      audio,
      "u.webm",
      "pcm",
      deps({ sahara: async () => { called = true; return "x"; } }, { keys: ["groq"] }),
    );
    expect(called).toBe(false);
    expect(r.provider).toBe("groq");
    expect(r.attempts[0]).toMatchObject({ provider: "sahara", outcome: "skipped", reason: "no-key" });
  });

  it("stops paying for Sahara after a credit failure, then tries it again once the pause is over", async () => {
    let clock = 1_000_000;
    let saharaCalls = 0;
    const sahara: Transcriber = async () => {
      saharaCalls++;
      throw new Error(SAHARA_EMPTY);
    };
    const d = deps({ sahara }, { now: () => clock });

    await transcribeWithFallback(audio, "u.webm", "pcm", d);
    const second = await transcribeWithFallback(audio, "u.webm", "pcm", d);
    expect(saharaCalls).toBe(1);
    expect(second.attempts[0]).toMatchObject({ provider: "sahara", outcome: "skipped", reason: "cooling-down" });

    clock += LONG_COOLDOWN_MS + 1;
    await transcribeWithFallback(audio, "u.webm", "pcm", d);
    expect(saharaCalls).toBe(2);
  });

  it("gives a rate-limited provider only a short pause", async () => {
    let clock = 5_000_000;
    let groqCalls = 0;
    const groq: Transcriber = async () => {
      groqCalls++;
      throw new Error('Groq STT failed (429): {"error":"rate limit reached"}');
    };
    const d = deps({ groq }, { keys: ["groq"], now: () => clock });

    await expect(transcribeWithFallback(audio, "u.webm", "pcm", d)).rejects.toBeInstanceOf(SpeechUnavailableError);
    clock += SHORT_COOLDOWN_MS + 1;
    await expect(transcribeWithFallback(audio, "u.webm", "pcm", d)).rejects.toBeInstanceOf(SpeechUnavailableError);
    expect(groqCalls).toBe(2);
  });

  it("does not wait on a provider that has stopped answering", async () => {
    const r = await transcribeWithFallback(audio, "u.webm", "pcm", deps({ sahara: never }, { timeoutMs: 20 }));
    expect(r.provider).toBe("groq");
    expect(r.attempts[0]).toMatchObject({ provider: "sahara", outcome: "failed", reason: "timeout" });
  });

  it("does not pause a provider after a timeout, so the next utterance tries it again", async () => {
    let calls = 0;
    const slowOnce: Transcriber = () => {
      calls++;
      return calls === 1 ? new Promise<string>(() => {}) : Promise.resolve("recovered");
    };
    const d = deps({ sahara: slowOnce }, { timeoutMs: 20 });
    await transcribeWithFallback(audio, "u.webm", "pcm", d);
    const r = await transcribeWithFallback(audio, "u.webm", "pcm", d);
    expect(r.provider).toBe("sahara");
    expect(r.transcript).toBe("recovered");
  });

  it("treats an empty transcript as an answer, not a failure", async () => {
    let groqCalled = false;
    const r = await transcribeWithFallback(
      audio,
      "u.webm",
      "pcm",
      deps({ sahara: ok(""), groq: async () => { groqCalled = true; return "x"; } }),
    );
    expect(r.provider).toBe("sahara");
    expect(r.transcript).toBe("");
    expect(groqCalled).toBe(false);
  });

  it("reports every attempt when no provider can answer", async () => {
    const err = await transcribeWithFallback(
      audio,
      "u.webm",
      "pcm",
      deps({ sahara: fail(SAHARA_EMPTY), groq: fail(GROQ_EMPTY) }),
    ).catch((e) => e);
    expect(err).toBeInstanceOf(SpeechUnavailableError);
    expect((err as SpeechUnavailableError).attempts.map((a) => [a.provider, a.reason])).toEqual([
      ["sahara", "credit-or-auth"],
      ["groq", "credit-or-auth"],
    ]);
  });
});

describe("classifyFailure", () => {
  it.each([
    [SAHARA_EMPTY, "credit-or-auth"],
    [GROQ_EMPTY, "credit-or-auth"],
    ['Groq STT failed (401): {"error":"Invalid API Key"}', "credit-or-auth"],
    ["GROQ_API_KEY is not set", "credit-or-auth"],
    ['Groq STT failed (429): {"error":"Rate limit reached"}', "rate-limited"],
    ["timed out after 12000ms", "timeout"],
    ["The operation was aborted due to timeout", "timeout"],
    ["Sahara STT failed (500): upstream error", "error"],
  ])("classifies %s", (message, expected) => {
    expect(classifyFailure(message)).toBe(expected);
  });
});
