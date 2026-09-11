import { saharaTranscribe, type SaharaAsrLanguage } from "@/lib/sahara";
import { groqTranscribe } from "@/lib/speech/groq";
import { MAX_AUDIO_BYTES, RateLimiter, clientKey, isSameOrigin } from "@/lib/speech/guard";
import {
  SpeechUnavailableError,
  providerOrder,
  transcribeWithFallback,
  type SpeechProviderName,
} from "@/lib/speech/providers";

export const runtime = "nodejs";
export const maxDuration = 30;

// Receives one finished utterance, recorded in the browser by
// app/aide/sahara-recognizer.ts, and returns its transcript. Recording in the
// browser and transcribing here is what lets Aide hear in every browser,
// including Firefox, Brave and anything on an iPhone, where the built-in
// recogniser either does not exist or cannot reach its speech service.
//
// Providers are tried in SPEECH_PROVIDERS order, "sahara,groq" by default.

// Twelve utterances a minute is one every five seconds, faster than anyone
// talks to an assistant, and low enough that one visitor cannot use up the
// free Groq allowance of 20 requests a minute on their own.
const limiter = new RateLimiter(12, 60_000);

const hasKey = (provider: SpeechProviderName): boolean =>
  provider === "sahara" ? !!process.env.SAHARA_API_KEY?.trim() : !!process.env.GROQ_API_KEY?.trim();

const transcribers = {
  sahara: async (audio: Blob, filename: string, language: string | undefined) =>
    (
      await saharaTranscribe(audio, filename, {
        languageAsrInput: language as SaharaAsrLanguage | undefined,
        // Live-tested: corrections off cut Sahara latency from about 5s to about
        // 2.1s with identical transcripts. The benchmark keeps them on, since
        // there accuracy is what is being measured, not speed.
        disableLlmCorrections: true,
      })
    ).transcript,
  groq: (audio: Blob, filename: string, language: string | undefined) => groqTranscribe(audio, filename, language),
};

export async function POST(req: Request) {
  if (!isSameOrigin(req)) {
    return Response.json({ error: "This endpoint only serves Aide's own pages." }, { status: 403 });
  }
  if (!limiter.allow(clientKey(req))) {
    return Response.json({ error: "Too many requests. Slow down a moment." }, { status: 429 });
  }
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > MAX_AUDIO_BYTES + 64_000) {
    return Response.json({ error: "Audio is too long for one utterance." }, { status: 413 });
  }

  const form = await req.formData().catch(() => null);
  if (!form) return Response.json({ error: "expected multipart/form-data" }, { status: 400 });

  const audio = form.get("audio");
  if (!(audio instanceof Blob) || audio.size === 0) {
    return Response.json({ error: "audio file is required" }, { status: 400 });
  }
  if (audio.size > MAX_AUDIO_BYTES) {
    return Response.json({ error: "Audio is too long for one utterance." }, { status: 413 });
  }

  const language = (form.get("language") as string | null) ?? undefined;
  // The filename carries the real extension for whatever the device recorded
  // (webm on desktop and Android, mp4/AAC on iPhone). Both providers read the
  // format from it, and a wrong extension produces empty or wrong transcripts.
  const filename = audio instanceof File && audio.name ? audio.name : "utterance.webm";

  try {
    const result = await transcribeWithFallback(audio, filename, language, {
      order: providerOrder(process.env.SPEECH_PROVIDERS),
      transcribers,
      hasKey,
    });
    if (result.attempts.length > 1) console.info("[stt] served after fallback:", JSON.stringify(result.attempts));
    return Response.json({ transcript: result.transcript, provider: result.provider });
  } catch (err) {
    if (err instanceof SpeechUnavailableError) {
      console.error("[stt] no provider could transcribe:", JSON.stringify(err.attempts));
      // Provider names and failure categories only. Provider error bodies can
      // carry account details and never leave the server.
      return Response.json({ error: "speech-unavailable", attempts: err.attempts }, { status: 503 });
    }
    console.error("[stt] unexpected failure:", err);
    return Response.json({ error: "speech-unavailable" }, { status: 500 });
  }
}
