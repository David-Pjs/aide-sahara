// Client for Intron's Sahara v2.5 voice API, the code-switching STT/TTS layer
// required by the Sahara CodeSwitch Africa Challenge. Kept deliberately thin
// and separate from lib/monnify.ts's style: unlike Monnify, a missing key here
// must not crash the whole app (Sahara access lands after everything else),
// so failures are surfaced per-call instead of at import time.
//
// STT: POST multipart audio -> https://infer.voice.intron.io/file/v1/upload/sync
//      (falls back to polling  https://infer.voice.intron.io/file/v1/status/{id}
//       on the documented 503-with-file-id "still processing" response)
// TTS: POST JSON text        -> https://infer.voice.intron.io/tts/v1/generate
//      (falls back to polling  https://infer.voice.intron.io/tts/v1/status/{id})
// All documented at https://docs.voice.intron.io

const INFER_BASE = (process.env.SAHARA_BASE_URL ?? "https://infer.voice.intron.io").replace(/\/$/, "");

function apiKey(): string {
  const key = process.env.SAHARA_API_KEY?.trim();
  if (!key) throw new Error("SAHARA_API_KEY is not set. Get one at voice.intron.io -> Developer tab.");
  return key;
}

// Both Upload File Sync and TTS Generate can themselves take up to 120s
// before returning a 503 ("still processing, poll this id") per Sahara's own
// docs, so a single request's timeout has to clear that bar; polling then
// covers however much longer the job takes beyond it.
const REQUEST_TIMEOUT_MS = 130_000;
const POLL_INTERVAL_MS = 3_000;
const POLL_TIMEOUT_MS = 300_000;
const SAHARA_DEBUG = process.env.SAHARA_DEBUG === "1";

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export type SaharaTranscription = {
  transcript: string;
  fileId: string;
  processingStatus: string;
  durationSeconds: number | null;
};

// A Sahara-supported input language code for use_language_asr_input. "en"
// covers English; the code-switch pairs relevant to this build are English
// mixed with Nigerian Pidgin, Yoruba, Igbo or Hausa, Sahara auto-detects the
// switch within a single utterance once the base language is set.
export type SaharaAsrLanguage = "en" | "pcm" | "yo" | "ig" | "ha" | "sw" | "am" | "zu" | "af";

export type TranscribeOptions = {
  languageAsrInput?: SaharaAsrLanguage;
  /** Skip LLM post-correction for lower latency (good for a live voice loop). */
  disableLlmCorrections?: boolean;
};

type FileStatusData = {
  file_id: string;
  processing_status: string;
  audio_transcript?: string;
  processed_audio_duration_in_seconds?: number;
};

export async function saharaTranscribe(
  audio: Blob,
  filename: string,
  opts: TranscribeOptions = {}
): Promise<SaharaTranscription> {
  const form = new FormData();
  form.append("audio_file_name", filename);
  form.append("audio_file_blob", audio, filename);
  form.append("use_language_asr_input", opts.languageAsrInput ?? "en");
  if (opts.disableLlmCorrections) form.append("use_disable_llm_corrections", "TRUE");

  const res = await fetchWithTimeout(
    `${INFER_BASE}/file/v1/upload/sync`,
    { method: "POST", headers: { Authorization: `Bearer ${apiKey()}` }, body: form },
    REQUEST_TIMEOUT_MS
  );

  let data: FileStatusData | undefined;
  if (res.status === 503) {
    const json = (await res.json().catch(() => ({}))) as { data?: FileStatusData };
    const fileId = json.data?.file_id;
    if (!fileId) throw new Error("Sahara STT timed out with no file_id to poll");
    data = await pollFileStatus(fileId);
  } else if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Sahara STT failed (${res.status}): ${body.slice(0, 300)}`);
  } else {
    const json = (await res.json()) as { data?: FileStatusData };
    data = json.data;
  }

  if (!data) throw new Error("Sahara STT returned no data");
  return {
    transcript: data.audio_transcript ?? "",
    fileId: data.file_id,
    processingStatus: data.processing_status,
    durationSeconds: data.processed_audio_duration_in_seconds ?? null,
  };
}

// Upload File Sync caps at 120s of audio. Benchmark clips (real conversation
// recordings) run well past that, so this uses the async Upload File
// endpoint instead, same auth, same response shape, no documented duration
// cap. Submits and immediately starts polling, since a multi-minute file is
// never going to be ready on the first check anyway.
export async function saharaTranscribeAsync(
  audio: Blob,
  filename: string,
  opts: TranscribeOptions = {}
): Promise<SaharaTranscription> {
  const form = new FormData();
  form.append("audio_file_name", filename);
  form.append("audio_file_blob", audio, filename);
  form.append("use_language_asr_input", opts.languageAsrInput ?? "en");
  if (opts.disableLlmCorrections) form.append("use_disable_llm_corrections", "TRUE");

  const res = await fetchWithTimeout(
    `${INFER_BASE}/file/v1/upload`,
    { method: "POST", headers: { Authorization: `Bearer ${apiKey()}` }, body: form },
    60_000
  );
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Sahara async STT submit failed (${res.status}): ${body.slice(0, 300)}`);
  }
  const json = (await res.json()) as { data?: { file_id?: string } };
  const fileId = json.data?.file_id;
  if (!fileId) throw new Error("Sahara async STT returned no file_id");

  const data = await pollFileStatus(fileId);
  return {
    transcript: data.audio_transcript ?? "",
    fileId: data.file_id,
    processingStatus: data.processing_status,
    durationSeconds: data.processed_audio_duration_in_seconds ?? null,
  };
}

async function pollFileStatus(fileId: string): Promise<FileStatusData> {
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await sleep(POLL_INTERVAL_MS);
    const res = await fetchWithTimeout(
      `${INFER_BASE}/file/v1/status/${fileId}`,
      { headers: { Authorization: `Bearer ${apiKey()}` } },
      15_000
    );
    if (!res.ok) continue;
    const json = (await res.json()) as { data?: FileStatusData };
    const status = json.data?.processing_status;
    if (SAHARA_DEBUG) console.log(`[sahara] file ${fileId} status: ${status}`);
    if (status === "FILE_TRANSCRIBED") return json.data!;
    if (status === "FILE_PROCESSING_FAILED") throw new Error("Sahara STT processing failed");
  }
  throw new Error("Sahara STT polling timed out");
}

// Accents valid for voice_language "en" (English words spoken with a Nigerian
// accent). "pidgin" is a separate TTS *language* ("pcm"), not an English
// accent, see docs.voice.intron.io/docs/tts/supported-languages-and-accents.
export type SaharaTtsAccent = "yoruba" | "igbo" | "hausa" | "swahili" | "afrikaans" | "zulu";
export type SaharaTtsGender = "male" | "female";

export type SynthesizeOptions = {
  accent?: SaharaTtsAccent;
  gender?: SaharaTtsGender;
  language?: string; // e.g. "en"
  format?: "wav" | "opus";
};

type TtsStatusData = { audio_duration_in_seconds?: number; audio_path?: string; processing_status: string };

// Returns the raw audio bytes (the route handlers stream these straight to
// the browser, same contract as the existing edge-tts route).
export async function saharaSynthesize(text: string, opts: SynthesizeOptions = {}): Promise<{ audio: Buffer; contentType: string }> {
  const format = opts.format ?? "wav";
  const res = await fetchWithTimeout(
    `${INFER_BASE}/tts/v1/generate`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey()}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        text,
        voice_accent: opts.accent ?? process.env.SAHARA_TTS_ACCENT ?? "yoruba",
        voice_gender: opts.gender ?? process.env.SAHARA_TTS_GENDER ?? "female",
        voice_language: opts.language ?? "en",
        output_audio_format: format,
      }),
    },
    REQUEST_TIMEOUT_MS
  );

  let data: TtsStatusData | undefined;
  if (res.status === 503) {
    const json = (await res.json().catch(() => ({}))) as { data?: { text_id?: string } };
    if (SAHARA_DEBUG) console.log("[sahara] tts 503 body:", JSON.stringify(json));
    const textId = json.data?.text_id;
    if (!textId) throw new Error("Sahara TTS timed out with no text_id to poll");
    data = await pollTtsStatus(textId);
  } else if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Sahara TTS failed (${res.status}): ${body.slice(0, 300)}`);
  } else {
    const json = (await res.json()) as { data?: TtsStatusData };
    data = json.data;
  }

  const audioPath = data?.audio_path;
  if (!audioPath) throw new Error("Sahara TTS returned no audio_path");

  const audioRes = await fetchWithTimeout(audioPath, {}, 30_000);
  if (!audioRes.ok) throw new Error(`Failed to fetch Sahara audio_path (${audioRes.status})`);
  const buf = Buffer.from(await audioRes.arrayBuffer());
  return { audio: buf, contentType: format === "opus" ? "audio/opus" : "audio/wav" };
}

async function pollTtsStatus(textId: string): Promise<TtsStatusData> {
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await sleep(POLL_INTERVAL_MS);
    const res = await fetchWithTimeout(`${INFER_BASE}/tts/v1/status/${textId}`, { headers: { Authorization: `Bearer ${apiKey()}` } }, 15_000);
    if (!res.ok) continue;
    const json = (await res.json()) as { data?: TtsStatusData };
    const status = json.data?.processing_status;
    if (SAHARA_DEBUG) console.log(`[sahara] tts ${textId} status: ${status}`);
    if (status === "TTS_TEXT_AUDIO_GENERATED") return json.data!;
    if (status === "TTS_TEXT_AUDIO_PROCESSING_FAILED") throw new Error("Sahara TTS processing failed");
  }
  throw new Error("Sahara TTS polling timed out");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
