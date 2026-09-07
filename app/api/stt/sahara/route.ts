import { saharaTranscribe, type SaharaAsrLanguage } from "@/lib/sahara";

export const runtime = "nodejs";

// Receives one finished utterance (recorded client-side by SaharaRecognizer,
// see app/aide/sahara-recognizer.ts) as multipart audio and returns the
// code-switched transcript from Sahara. This is the endpoint that makes the
// live voice loop actually understand Nigerian Pidgin/Yoruba/Igbo/Hausa mixed
// with English, replacing the browser's English-only SpeechRecognition.
export async function POST(req: Request) {
  const form = await req.formData().catch(() => null);
  if (!form) return Response.json({ error: "expected multipart/form-data" }, { status: 400 });

  const audio = form.get("audio");
  if (!(audio instanceof Blob) || audio.size === 0) {
    return Response.json({ error: "audio file is required" }, { status: 400 });
  }
  const language = (form.get("language") as string | null) ?? undefined;

  try {
    // Live-tested 2026-09-06: use_disable_llm_corrections=TRUE cut average
    // Sahara STT latency from ~5s to ~2.1s (3 runs each) on identical audio,
    // with byte-identical transcripts both ways. For a live conversational
    // loop where every turn pays this cost, that's the right trade — full
    // LLM correction stays on for the offline benchmark script instead,
    // where accuracy is what's being measured, not latency.
    const result = await saharaTranscribe(audio, "utterance.webm", {
      languageAsrInput: language as SaharaAsrLanguage | undefined,
      disableLlmCorrections: true,
    });
    return Response.json({ transcript: result.transcript, durationSeconds: result.durationSeconds });
  } catch (err) {
    console.error("Sahara STT route failed:", err);
    return Response.json({ error: (err as Error).message }, { status: 502 });
  }
}
