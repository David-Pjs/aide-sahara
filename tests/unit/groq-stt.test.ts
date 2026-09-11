import { describe, expect, it } from "vitest";
import {
  GROQ_STT_MODEL_DEFAULT,
  GROQ_TRANSCRIPTIONS_URL,
  NIGERIAN_PROMPT,
  cleanWhisperTranscript,
  groqTranscribe,
  whisperLanguage,
} from "../../lib/speech/groq";

const audio = new Blob([new Uint8Array(6000)], { type: "audio/webm" });

type Call = { url: string; form: FormData; auth: string | null };

function fakeFetch(responses: Response[]) {
  const calls: Call[] = [];
  const impl = (async (url: string, init: RequestInit) => {
    calls.push({ url, form: init.body as FormData, auth: new Headers(init.headers).get("authorization") });
    const next = responses.shift();
    if (!next) throw new Error("unexpected extra request");
    return next;
  }) as unknown as typeof fetch;
  return { impl, calls };
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("groqTranscribe", () => {
  it("sends the benchmark-chosen model, the Nigerian vocabulary prompt and the mapped language", async () => {
    const { impl, calls } = fakeFetch([json({ text: "Mo fe withdraw owo mi" })]);
    const text = await groqTranscribe(audio, "utterance.webm", "yo", { apiKey: "gsk_test", fetchImpl: impl });

    expect(text).toBe("Mo fe withdraw owo mi");
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(GROQ_TRANSCRIPTIONS_URL);
    expect(calls[0].auth).toBe("Bearer gsk_test");
    expect(calls[0].form.get("model")).toBe(GROQ_STT_MODEL_DEFAULT);
    expect(calls[0].form.get("prompt")).toBe(NIGERIAN_PROMPT);
    expect(calls[0].form.get("temperature")).toBe("0");
    expect(calls[0].form.get("language")).toBe("yo");
    expect((calls[0].form.get("file") as File).name).toBe("utterance.webm");
  });

  it("leaves the language for Whisper to detect when it has no code for it", async () => {
    for (const code of ["pcm", "ig"]) {
      const { impl, calls } = fakeFetch([json({ text: "wetin dey my account" })]);
      await groqTranscribe(audio, "u.webm", code, { apiKey: "gsk_test", fetchImpl: impl });
      expect(calls[0].form.get("language")).toBeNull();
    }
  });

  it("retries without a language when Groq rejects the code, instead of dropping the utterance", async () => {
    const { impl, calls } = fakeFetch([
      json({ error: { message: "language 'ha' is not supported" } }, 400),
      json({ text: "ina son cire kudi" }),
    ]);
    const text = await groqTranscribe(audio, "u.webm", "ha", { apiKey: "gsk_test", fetchImpl: impl });
    expect(text).toBe("ina son cire kudi");
    expect(calls).toHaveLength(2);
    expect(calls[0].form.get("language")).toBe("ha");
    expect(calls[1].form.get("language")).toBeNull();
  });

  it("throws with the status, so the provider chain can tell a credit failure from a blip", async () => {
    const { impl } = fakeFetch([json({ error: "You have depleted your monthly included credits." }, 402)]);
    await expect(groqTranscribe(audio, "u.webm", "pcm", { apiKey: "gsk_test", fetchImpl: impl })).rejects.toThrow(/\(402\)/);
  });

  it("refuses to run without a key rather than sending an unauthenticated request", async () => {
    const { impl, calls } = fakeFetch([]);
    await expect(groqTranscribe(audio, "u.webm", "pcm", { apiKey: " ", fetchImpl: impl })).rejects.toThrow(/GROQ_API_KEY/);
    expect(calls).toHaveLength(0);
  });

  it("applies the same cleaning to what Groq returns", async () => {
    const { impl } = fakeFetch([json({ text: "Thank you for watching!" })]);
    expect(await groqTranscribe(audio, "u.webm", "pcm", { apiKey: "gsk_test", fetchImpl: impl })).toBe("");
  });
});

describe("whisperLanguage", () => {
  it("maps codes Whisper accepts and leaves the rest undefined", () => {
    expect(whisperLanguage("en")).toBe("en");
    expect(whisperLanguage("YO")).toBe("yo");
    expect(whisperLanguage("pcm")).toBeUndefined();
    expect(whisperLanguage("ig")).toBeUndefined();
    expect(whisperLanguage(undefined)).toBeUndefined();
  });
});

describe("cleanWhisperTranscript", () => {
  it.each(["Thank you.", "Thanks for watching!", "Thank you for watching.", "[BLANK_AUDIO]", "Subtitles by the Amara.org community", "you"])(
    "drops Whisper's silence hallucination %j",
    (text) => {
      expect(cleanWhisperTranscript(text)).toBe("");
    },
  );

  it("collapses a runaway repetition loop to one occurrence", () => {
    expect(cleanWhisperTranscript("mwenye mwenye mwenye mwenye mwenye send my money")).toBe("mwenye send my money");
    expect(cleanWhisperTranscript("we can take a photo we can take a photo we can take a photo we can take a photo ok")).toBe(
      "we can take a photo ok",
    );
  });

  it("never shortens spoken digits, because an account number is not a loop", () => {
    const account = "my account is zero zero zero zero one two three four five six";
    expect(cleanWhisperTranscript(account)).toBe(account);
    expect(cleanWhisperTranscript("send 5 5 5 5 naira")).toBe("send 5 5 5 5 naira");
  });

  it("leaves ordinary speech alone, including emphatic repetition under four times", () => {
    expect(cleanWhisperTranscript("no no no, abeg wetin dey my account")).toBe("no no no, abeg wetin dey my account");
  });
});
