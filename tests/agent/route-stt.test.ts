import { beforeEach, describe, expect, it, vi } from "vitest";

// The speech endpoint end to end, with both providers mocked: the guards run
// before any credit is spent, and an out-of-credit Sahara still gets the user
// a transcript from Groq in the same request.

const mocks = vi.hoisted(() => {
  process.env.SAHARA_API_KEY = "sahara-test";
  process.env.GROQ_API_KEY = "groq-test";
  return { sahara: vi.fn(), groq: vi.fn() };
});

vi.mock("@/lib/sahara", () => ({ saharaTranscribe: mocks.sahara }));
vi.mock("@/lib/speech/groq", () => ({ groqTranscribe: mocks.groq }));

const { POST } = await import("../../app/api/stt/route");
const { resetCooldowns } = await import("../../lib/speech/providers");

let ipCounter = 0;

function sttRequest(opts: { origin?: string | null; audio?: Blob | null; ip?: string } = {}) {
  const form = new FormData();
  const audio = opts.audio === undefined ? new Blob([new Uint8Array(6000)], { type: "audio/mp4" }) : opts.audio;
  if (audio) form.append("audio", audio, "utterance.mp4");
  form.append("language", "pcm");
  const headers: Record<string, string> = {
    host: "aide-ng.vercel.app",
    "x-forwarded-for": opts.ip ?? `10.0.0.${++ipCounter}`,
  };
  if (opts.origin !== null) headers.origin = opts.origin ?? "https://aide-ng.vercel.app";
  return new Request("https://aide-ng.vercel.app/api/stt", { method: "POST", headers, body: form });
}

beforeEach(() => {
  resetCooldowns();
  mocks.sahara.mockReset();
  mocks.groq.mockReset();
});

describe("POST /api/stt", () => {
  it("returns Sahara's transcript and names the provider", async () => {
    mocks.sahara.mockResolvedValue({ transcript: "abeg check my balance" });
    const res = await POST(sttRequest());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ transcript: "abeg check my balance", provider: "sahara" });
    expect(mocks.sahara.mock.calls[0][1]).toBe("utterance.mp4");
    expect(mocks.sahara.mock.calls[0][2]).toMatchObject({ languageAsrInput: "pcm", disableLlmCorrections: true });
  });

  it("answers from Groq when Sahara has no credit", async () => {
    mocks.sahara.mockRejectedValue(new Error("Sahara STT failed (400): insufficient balance to process the file"));
    mocks.groq.mockResolvedValue("wetin dey my account");
    const res = await POST(sttRequest());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ transcript: "wetin dey my account", provider: "groq" });
  });

  it("returns 503 without leaking provider error bodies when nothing can answer", async () => {
    mocks.sahara.mockRejectedValue(new Error('Sahara STT failed (400): {"account":"secret-detail"}'));
    mocks.groq.mockRejectedValue(new Error("Groq STT failed (500): upstream"));
    const res = await POST(sttRequest());
    expect(res.status).toBe(503);
    const text = await res.text();
    expect(text).toContain("speech-unavailable");
    expect(text).not.toContain("secret-detail");
  });

  it("refuses other sites before spending any credit", async () => {
    const res = await POST(sttRequest({ origin: "https://elsewhere.example" }));
    expect(res.status).toBe(403);
    expect(mocks.sahara).not.toHaveBeenCalled();
    expect(mocks.groq).not.toHaveBeenCalled();
  });

  it("rejects a request with no audio", async () => {
    const res = await POST(sttRequest({ audio: null }));
    expect(res.status).toBe(400);
  });

  it("rejects audio far longer than one utterance", async () => {
    const res = await POST(sttRequest({ audio: new Blob([new Uint8Array(3 * 1024 * 1024 + 1)]) }));
    expect(res.status).toBe(413);
    expect(mocks.sahara).not.toHaveBeenCalled();
  });

  it("rate-limits one client hammering the endpoint", async () => {
    mocks.sahara.mockResolvedValue({ transcript: "ok" });
    const statuses: number[] = [];
    for (let i = 0; i < 13; i++) statuses.push((await POST(sttRequest({ ip: "41.1.1.1" }))).status);
    expect(statuses.slice(0, 12).every((s) => s === 200)).toBe(true);
    expect(statuses[12]).toBe(429);
  });
});
