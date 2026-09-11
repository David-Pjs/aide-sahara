// Groq-hosted Whisper: Aide's fallback recogniser when Sahara cannot answer.
//
// The model is chosen from our own benchmark, not the vendor's table. On the
// four AfriSwitchCare clips, whisper-large-v3-turbo scored 63.7% WER against
// 68.6% for whisper-large-v3 and produced no runaway repetition loops, where
// large-v3 produced two. It is also the faster of the two, which matters more
// in a live conversation than a point of accuracy.
//
// It is still Whisper. The same benchmark shows it losing about half of every
// code-switched sentence. This keeps Aide hearing while Sahara is unavailable;
// it does not replace Sahara.

export const GROQ_TRANSCRIPTIONS_URL = "https://api.groq.com/openai/v1/audio/transcriptions";
export const GROQ_STT_MODEL_DEFAULT = "whisper-large-v3-turbo";

// Whisper takes ISO-639-1 codes. Nigerian Pidgin and Igbo have none it accepts,
// so for those the language is left for Whisper to detect and the prompt below
// carries the vocabulary instead. If Groq rejects a code anyway, the request is
// retried without one rather than failing the utterance.
const WHISPER_LANGUAGE: Record<string, string | undefined> = {
  en: "en",
  yo: "yo",
  ha: "ha",
  sw: "sw",
  pcm: undefined,
  ig: undefined,
};

// Whisper's prompt biases spelling toward words it would otherwise anglicise,
// "wetin" heard as "we tin", "abeg" as "I beg". Well under Groq's 224 token cap.
export const NIGERIAN_PROMPT =
  "Nigerian speaker, English mixed with Pidgin, Yoruba, Igbo or Hausa. Abeg, wetin, dey, comot, sabi, wahala, oga, una, naira, kobo. I wan withdraw. Wetin dey my account.";

export function whisperLanguage(code: string | undefined): string | undefined {
  if (!code) return undefined;
  return WHISPER_LANGUAGE[code.toLowerCase()];
}

// Whisper's best-known failure: given silence or background noise it produces
// fluent text it learned from video subtitles. An agent acting on "Thank you
// for watching" is an agent acting on words nobody said. The cost of dropping
// a genuine, bare "thank you" is that Aide does not reply to a pleasantry.
const SILENCE_HALLUCINATIONS = [
  /^thank you\.?!?$/i,
  /^thanks? for watching\.?!?$/i,
  /^thank you for watching\.?!?$/i,
  /^thank you so much for watching\.?!?$/i,
  /^please subscribe\.?!?$/i,
  /subtitles? (by|provided)/i,
  /amara\.org/i,
  /^\[?\(?(music|silence|blank_audio|no speech)\)?\]?\.?$/i,
  /^you\.?$/i,
];

// Spoken numbers are exempt from repeat-collapsing. "Zero zero zero zero" is a
// real account number, and silently shortening it would move money somewhere
// the user never said.
const NUMBER_WORD = /^(zero|oh|o|one|two|three|four|five|six|seven|eight|nine|ten|double|triple|\d+)[.,]?$/i;

function collapseRunawayRepeats(text: string): string {
  const words = text.split(/\s+/).filter(Boolean);
  const out: string[] = [];
  let i = 0;
  while (i < words.length) {
    let collapsed = false;
    for (let n = 6; n >= 1; n--) {
      if (i + n * 4 > words.length) continue;
      const unitWords = words.slice(i, i + n);
      if (unitWords.every((w) => NUMBER_WORD.test(w))) continue;
      const unit = unitWords.join(" ").toLowerCase();
      let reps = 1;
      while (words.slice(i + reps * n, i + (reps + 1) * n).join(" ").toLowerCase() === unit) reps++;
      if (reps >= 4) {
        out.push(...unitWords);
        i += reps * n;
        collapsed = true;
        break;
      }
    }
    if (!collapsed) {
      out.push(words[i]);
      i++;
    }
  }
  return out.join(" ");
}

export function cleanWhisperTranscript(text: string): string {
  const trimmed = (text ?? "").trim();
  if (!trimmed) return "";
  if (SILENCE_HALLUCINATIONS.some((re) => re.test(trimmed))) return "";
  return collapseRunawayRepeats(trimmed);
}

export type GroqOptions = {
  apiKey?: string;
  model?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
};

export async function groqTranscribe(
  audio: Blob,
  filename: string,
  language: string | undefined,
  opts: GroqOptions = {},
): Promise<string> {
  const apiKey = (opts.apiKey ?? process.env.GROQ_API_KEY ?? "").trim();
  if (!apiKey) throw new Error("GROQ_API_KEY is not set");
  const model = opts.model || process.env.GROQ_STT_MODEL?.trim() || GROQ_STT_MODEL_DEFAULT;
  const doFetch = opts.fetchImpl ?? fetch;

  const send = (lang: string | undefined) => {
    const form = new FormData();
    form.append("file", audio, filename);
    form.append("model", model);
    form.append("response_format", "json");
    form.append("temperature", "0");
    form.append("prompt", NIGERIAN_PROMPT);
    if (lang) form.append("language", lang);
    return doFetch(GROQ_TRANSCRIPTIONS_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
      signal: AbortSignal.timeout(opts.timeoutMs ?? 10_000),
    });
  };

  const lang = whisperLanguage(language);
  let res = await send(lang);
  if (res.status === 400 && lang) {
    const body = await res.clone().text().catch(() => "");
    if (/language/i.test(body)) res = await send(undefined);
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Groq STT failed (${res.status}): ${body.slice(0, 200)}`);
  }
  const json = (await res.json()) as { text?: string };
  return cleanWhisperTranscript(json.text ?? "");
}
