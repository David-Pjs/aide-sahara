// A drop-in replacement for the browser's SpeechRecognition object, backed by
// Sahara's code-switching STT instead of Chrome's English-only recognizer.
// Implements the same shape voice-engine.ts already talks to
// (onaudiostart/onsoundstart/onspeechstart/onresult/onend/onerror, start(),
// abort()) so the rest of that file, echo defense, idle/mute timers, restart
// backoff, needs zero changes to run on Sahara.
//
// Why not stream: Sahara's streaming STT is a separate real-time protocol;
// Upload File Sync (one HTTP call per finished utterance) is simpler, still
// fast enough for a conversational loop, and is the same call path the
// benchmark script uses, so what wins the demo is exactly what's benchmarked.
//
// Voice activity detection (RMS over a Web Audio AnalyserNode) stands in for
// the interim/final events Web Speech provides natively, since Sahara only
// returns a transcript for a complete utterance.

type AnyHandler = ((ev: any) => void) | null;

// Sahara has no auto-detect mode, every request must declare ONE language or
// code-switch pair (checked directly against their docs: the STT "Supported
// Languages" list has no "auto" entry). Guessing by firing the same audio at
// several language hints in parallel would only make every turn slower, the
// opposite of what's wanted. The fast alternative that's actually smarter is
// a REMEMBERED per-user preference: ask once, reuse forever, zero added
// latency on every subsequent turn. Persisted in localStorage (per browser)
// rather than a server round trip, so reading/writing it costs nothing.
const LANGUAGE_STORAGE_KEY = "aide-sahara-language";
export const SAHARA_LANGUAGE_OPTIONS: { code: string; label: string }[] = [
  { code: "pcm", label: "English & Nigerian Pidgin" },
  { code: "yo", label: "English & Yoruba" },
  { code: "ig", label: "English & Igbo" },
  { code: "ha", label: "English & Hausa" },
  { code: "sw", label: "English & Swahili" },
  { code: "en", label: "English only" },
];

// True only once a preference has actually been set, distinct from
// getSaharaLanguage(), which always returns a usable default. Used to decide
// whether a brand-new user has ever been asked at all.
export function hasSaharaLanguagePreference(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(LANGUAGE_STORAGE_KEY) !== null;
  } catch {
    return false;
  }
}

export function getSaharaLanguage(): string {
  if (typeof window === "undefined") return process.env.NEXT_PUBLIC_SAHARA_ASR_LANGUAGE || "pcm";
  try {
    return localStorage.getItem(LANGUAGE_STORAGE_KEY) || process.env.NEXT_PUBLIC_SAHARA_ASR_LANGUAGE || "pcm";
  } catch {
    return process.env.NEXT_PUBLIC_SAHARA_ASR_LANGUAGE || "pcm";
  }
}

export function setSaharaLanguage(code: string): void {
  try {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, code);
  } catch {
    /* private browsing / storage disabled, falls back to the default every load */
  }
}

// A blind user cannot use a mouse-driven dropdown to change this, the whole
// product's premise is "no screen required." So this is the real control:
// spoken commands, matched BEFORE the text ever reaches the LLM agent (see
// index.tsx's onFinal handler), so switching language is instant, no model
// round trip, no "thinking" delay, just an immediate spoken confirmation.
// Deliberately keyword-based rather than an LLM intent classifier: latency
// here should be near-zero, and these phrases are unambiguous enough that a
// small pattern set is more reliable AND faster than a model call.
const LANGUAGE_ALIASES: { code: string; words: RegExp }[] = [
  { code: "pcm", words: /\b(pidgin|naija)\b/i },
  { code: "yo", words: /\byoruba\b/i },
  { code: "ig", words: /\bigbo\b/i },
  { code: "ha", words: /\bhausa\b/i },
  { code: "sw", words: /\bswahili\b/i },
  { code: "en", words: /\benglish( only)?\b/i },
];
// Requires an explicit switch-intent verb near the language name, so an
// ordinary sentence that happens to mention a language ("I translate Yoruba
// documents") doesn't misfire.
const SWITCH_INTENT = /\b(speak|switch|change|use|understand|talk|respond)\b/i;
// A whole switch command spoken in a few words ("switch to Yoruba") leaves
// STT no room to still get it right if it mishears the ONE verb carrying the
// intent. Live-tested: "switch to Yoruba" came back as "sweet to Yorùbá",
// which fails the verb check even though the language is right there. A
// short utterance mentioning a language name is overwhelmingly likely to BE
// a switch command in this app, verb intact or not, so short ones don't need
// the verb at all.
const SHORT_UTTERANCE_WORDS = 5;

// Strips diacritics/tone marks so "Yorùbá" and "Ọ̀gá" match the same as
// "Yoruba" and "Oga". Native-orthography answers are the CORRECT, accurate
// transcription for a fluent speaker, not an edge case, so failing to match
// them was a real bug, not a rare miss.
function normalize(text: string): string {
  // NFD decomposes "ù" into "u" + a combining grave-accent codepoint; this
  // strips every codepoint in the combining-diacritical-marks block
  // (U+0300-U+036F), leaving the plain base letters behind.
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

export function matchLanguageCommand(text: string): { code: string; label: string } | null {
  const normalized = normalize(text);
  const isShort = normalized.trim().split(/\s+/).length <= SHORT_UTTERANCE_WORDS;
  if (!isShort && !SWITCH_INTENT.test(normalized)) return null;
  return matchLanguageAnswer(normalized);
}

// Looser match with no required intent verb, for the one moment a bare
// language name IS the whole answer: right after Aide has directly asked
// "which language do you speak?" during first-visit onboarding.
export function matchLanguageAnswer(text: string): { code: string; label: string } | null {
  const normalized = normalize(text);
  for (const { code, words } of LANGUAGE_ALIASES) {
    if (words.test(normalized)) {
      const opt = SAHARA_LANGUAGE_OPTIONS.find((o) => o.code === code);
      if (opt) return opt;
    }
  }
  return null;
}

// iOS WebKit (Safari AND every iOS browser, since Apple requires them all to
// run on WebKit, including "Chrome" on iPhone) does not support the WebM
// container at all, MediaRecorder.isTypeSupported("audio/webm") is false
// there. The old code only tried "audio/webm;codecs=opus" then blindly fell
// back to the literal string "audio/webm" with no support check, which
// throws on construction on iOS. This tries real candidates in order and
// lets the browser's own default apply only if none of them match, iOS
// lands on "audio/mp4" (AAC), which both MediaRecorder AND Sahara's upload
// endpoint accept fine once the filename/extension actually says mp4 (see
// the extension map below and the upload() call).
const MIME_CANDIDATES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4;codecs=mp4a.40.2", "audio/mp4", "audio/aac"];
function pickSupportedMimeType(): string {
  if (typeof MediaRecorder === "undefined" || !MediaRecorder.isTypeSupported) return "";
  for (const type of MIME_CANDIDATES) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return ""; // none matched, let MediaRecorder pick its own platform default
}

// Sahara's upload endpoint reads the audio format from the filename
// extension, not from the multipart part's Content-Type. Sending an AAC/MP4
// recording under a ".webm" name (the previous behavior, hardcoded) is
// exactly the kind of mismatch that produces silently wrong or empty
// transcripts, this is very likely a real cause of "it doesn't hear me" on
// iPhone specifically, since that's the one platform that never records webm.
function extensionFor(mimeType: string): string {
  if (mimeType.includes("mp4")) return "mp4";
  if (mimeType.includes("aac")) return "aac";
  if (mimeType.includes("ogg")) return "ogg";
  return "webm";
}

const VAD_INTERVAL_MS = 100;
// Never actually tuned against a real microphone, this was a guess. Chrome's
// default getUserMedia noise suppression can attenuate a normal speaking
// voice well below what feels like an obviously loud threshold, so if speech
// still isn't being detected, this is the first thing to lower. See the
// throttled `[sahara-vad] rms=` console log below for the real numbers.
const SOUND_RMS_THRESHOLD = 0.01;
const SILENCE_TO_FINALIZE_MS = 700;
// Sahara's Upload File Sync rejects anything under 1 real second of audio
// ("audio file duration of Ns is less than minimum of 1s"). This must clear
// that bar with margin, it's measured from when speech actually starts, not
// from when the recorder was armed, so a stray blip right after a previous
// utterance can't undercount it.
const MIN_UTTERANCE_MS = 1100;
// Below this, a "detected speech" segment is almost certainly noise (a click,
// a chair creak) rather than real speech, skip the upload instead of paying
// a guaranteed-to-fail Sahara call for it.
const MIN_BLOB_BYTES = 4_000;
// If ambient noise sits above SOUND_RMS_THRESHOLD, lastLoudAt keeps
// resetting and silence-based finalize never fires, the recorder can run
// away indefinitely, capturing minutes of noise-plus-a-few-words that Sahara
// then has to guess a transcript for (this is very likely what produced
// fluent-sounding but unrelated text like "Since farmers, I'm not sure what
// the matter is" for an actual "switch to Yoruba": a 32-second real request
// was found in the server logs for what should have been a two-second
// utterance). This is the backstop regardless of how the threshold is
// tuned: no legitimate single utterance in this app needs to run longer.
const MAX_RECORDING_MS = 8_000;

// Reused across recognizer instances (voice-engine.ts creates a fresh one per
// restart cycle) so the mic is acquired once, not re-prompted/re-opened every
// time the recognizer is torn down and rebuilt.
let cachedStream: MediaStream | null = null;
async function getMicStream(): Promise<MediaStream> {
  if (cachedStream && cachedStream.active) return cachedStream;
  cachedStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  return cachedStream;
}

export function saharaSttSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof (window as any).MediaRecorder !== "undefined"
  );
}

export class SaharaRecognizer {
  lang = "en-NG";
  interimResults = true;
  continuous = true;

  onaudiostart: AnyHandler = null;
  onsoundstart: AnyHandler = null;
  onspeechstart: AnyHandler = null;
  onresult: AnyHandler = null;
  onend: AnyHandler = null;
  onerror: AnyHandler = null;

  private stopped = false;
  private stream: MediaStream | null = null;
  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private recorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private vadTimer: ReturnType<typeof setInterval> | null = null;
  private soundStarted = false;
  private speechStarted = false;
  private lastLoudAt = 0;
  private speechStartedAt = 0;
  private recordingStartedAt = 0;
  private uploading = false;
  private lastRmsLogAt = 0;

  async start(): Promise<void> {
    this.stopped = false;
    try {
      this.stream = await getMicStream();
    } catch {
      this.onerror?.({ error: "not-allowed" });
      return;
    }
    if (this.stopped) return;

    // The mic track can die under us (device unplugged, OS revokes access).
    // Web Speech surfaces that as an onend; mirror it so voice-engine.ts's
    // restart logic kicks in the same way.
    for (const track of this.stream.getAudioTracks()) {
      track.onended = () => {
        if (!this.stopped) this.onend?.({});
      };
    }

    this.onaudiostart?.({});

    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    this.ctx = new Ctx();
    // iOS WebKit creates a new AudioContext in "suspended" state whenever
    // the creation happens after an await (as it does here, after awaiting
    // getMicStream()), by then the tap that started this has fallen outside
    // WebKit's user-gesture activation window. A suspended context still
    // exists and won't throw, it just silently never delivers real analyser
    // data, so VAD reads near-zero forever and it looks exactly like "the
    // mic doesn't hear me" even though permission was granted correctly.
    if (this.ctx.state === "suspended") {
      await this.ctx.resume().catch(() => {});
    }
    const source = this.ctx.createMediaStreamSource(this.stream);
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 512;
    source.connect(this.analyser);

    this.armRecorder();
    this.vadTimer = setInterval(() => this.tick(), VAD_INTERVAL_MS);
  }

  abort(): void {
    this.stopped = true;
    if (this.vadTimer) clearInterval(this.vadTimer);
    this.vadTimer = null;
    if (this.recorder && this.recorder.state !== "inactive") {
      this.recorder.onstop = null;
      try {
        this.recorder.stop();
      } catch {}
    }
    this.recorder = null;
    if (this.ctx) {
      this.ctx.close().catch(() => {});
      this.ctx = null;
    }
    this.analyser = null;
    // Deliberately not stopping this.stream's tracks: the stream is cached
    // module-wide and reused by the next recognizer instance.
  }

  private armRecorder(): void {
    if (!this.stream || this.stopped) return;
    const mime = pickSupportedMimeType();
    // Passing no mimeType at all (rather than one MediaRecorder.isTypeSupported
    // rejected) lets every browser, including whatever future engine shows up
    // next, fall back to its own real default instead of throwing.
    const recorder = mime ? new MediaRecorder(this.stream, { mimeType: mime }) : new MediaRecorder(this.stream);
    this.chunks = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) this.chunks.push(e.data);
    };
    recorder.start();
    this.recorder = recorder;
    this.recordingStartedAt = Date.now();
  }

  private lastResumeAttemptAt = 0;

  private tick(): void {
    if (!this.analyser || this.stopped) return;
    // Belt-and-braces recovery: on some OS/browser combination we haven't
    // hit yet, the context can end up suspended after the fact (locking the
    // screen, backgrounding the tab, an OS audio-session interruption from a
    // phone call). A suspended context reads as permanent silence with no
    // error thrown, so retry resume() every 2s rather than require a full
    // page reload to notice the mic went deaf.
    if (this.ctx && this.ctx.state !== "running" && Date.now() - this.lastResumeAttemptAt > 2000) {
      this.lastResumeAttemptAt = Date.now();
      void this.ctx.resume().catch(() => {});
    }
    const data = new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteTimeDomainData(data);
    let sumSquares = 0;
    for (let i = 0; i < data.length; i++) {
      const v = (data[i] - 128) / 128;
      sumSquares += v * v;
    }
    const rms = Math.sqrt(sumSquares / data.length);

    // Throttled to 2x/sec, enough to read live, not enough to flood the
    // console. This is the number to watch in devtools while testing: if it
    // never gets close to SOUND_RMS_THRESHOLD while you're clearly talking,
    // that threshold (or the mic input itself) is the actual problem.
    const now = Date.now();
    if (now - this.lastRmsLogAt > 500) {
      this.lastRmsLogAt = now;
      console.debug(`[sahara-vad] rms=${rms.toFixed(4)} threshold=${SOUND_RMS_THRESHOLD} speaking=${this.speechStarted}`);
    }

    // Hard ceiling, checked before anything else: if ambient noise has kept
    // this "loud" continuously, silence-based finalize below never gets a
    // chance to run at all. Force it rather than let the recording (and the
    // Sahara bill for transcribing it) grow without bound.
    if (this.speechStarted && !this.uploading && now - this.recordingStartedAt >= MAX_RECORDING_MS) {
      this.finalizeUtterance();
      return;
    }

    if (rms > SOUND_RMS_THRESHOLD) {
      this.lastLoudAt = Date.now();
      if (!this.soundStarted) {
        this.soundStarted = true;
        this.onsoundstart?.({});
      }
      if (!this.speechStarted) {
        this.speechStarted = true;
        this.speechStartedAt = Date.now();
        this.onspeechstart?.({});
      }
      return;
    }

    if (this.speechStarted && !this.uploading) {
      const silentFor = Date.now() - this.lastLoudAt;
      if (silentFor < SILENCE_TO_FINALIZE_MS) return; // still mid-utterance
      // The user has stopped talking. A short word ("hello", "yes") can
      // still leave the RECORDED CLIP under Sahara's 1s minimum even though
      // it's a completely valid utterance, that must never be silently
      // dropped (a blind user has no idea their "hello" vanished). Instead,
      // keep the recorder running a little longer: MediaRecorder is still
      // capturing dead air, so recordedFor keeps climbing on its own with
      // every tick, and the moment it clears the bar this finalizes with a
      // few hundred ms of harmless trailing silence, never thrown away.
      const recordedFor = Date.now() - this.recordingStartedAt;
      if (recordedFor >= MIN_UTTERANCE_MS) {
        this.finalizeUtterance();
      }
    }
  }

  private finalizeUtterance(): void {
    if (!this.recorder || this.uploading) return;
    this.uploading = true;
    const recorder = this.recorder;
    const chunksSnapshot = this.chunks;
    const mimeType = recorder.mimeType || "audio/webm";

    recorder.onstop = () => {
      this.soundStarted = false;
      this.speechStarted = false;
      // Start a fresh recorder immediately so the next utterance is captured
      // with no gap while this one uploads in the background.
      this.armRecorder();
      void this.upload(new Blob(chunksSnapshot, { type: mimeType }));
    };
    try {
      recorder.stop();
    } catch {
      this.uploading = false;
    }
  }

  private async upload(blob: Blob): Promise<void> {
    if (blob.size < MIN_BLOB_BYTES) {
      this.uploading = false;
      return;
    }
    try {
      const form = new FormData();
      // The filename's extension is what tells Sahara's upload endpoint how
      // to decode the file, it has to match what was actually recorded
      // (webm on desktop/Android, mp4/AAC on iOS), not a hardcoded guess.
      form.append("audio", blob, `utterance.${extensionFor(blob.type)}`);
      form.append("language", getSaharaLanguage());
      const res = await fetch("/api/stt/sahara", { method: "POST", body: form });
      const json = (await res.json().catch(() => ({}))) as { transcript?: string; error?: string };
      if (!res.ok || !json.transcript?.trim()) {
        if (json.error) console.warn("Sahara STT:", json.error);
        return;
      }
      const entry: any = [{ transcript: json.transcript }];
      entry.isFinal = true;
      this.onresult?.({ resultIndex: 0, results: [entry] });
    } catch (err) {
      console.warn("Sahara STT upload failed:", err);
    } finally {
      this.uploading = false;
    }
  }
}
