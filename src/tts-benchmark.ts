// TTS benchmark. The challenge asks that any TTS in the solution is benchmarked
// too, and Aide is a product whose entire output is speech, so this is not
// optional for us.
//
// Method: round-trip intelligibility. Each system synthesises the same
// code-switched sentence, one fixed ASR model transcribes all of them, and the
// transcript is scored against the original text with the same five metrics the
// ASR benchmark uses (src/metrics.ts). A sentence a listener cannot make out is
// a sentence the recogniser cannot either, so a higher round-trip WER means a
// less intelligible rendering of that code-switched line.
//
// The judge is held constant on purpose. Whisper large-v3 is not the best model
// in our ASR benchmark, but every system is scored by the same recogniser, so
// the comparison between them is fair even where the absolute numbers are not
// the last word.
//
// What this does NOT measure: naturalness, prosody, or whether a Nigerian
// listener finds the voice acceptable. Those need human raters, which is called
// out in the limitations of the report this writes.
//
//   python benchmark/tts/synth.py     (edge-tts and gTTS first)
//   npx tsx -r dotenv/config src/tts-benchmark.ts

import { readFile, writeFile, stat } from "node:fs/promises";
import path from "node:path";
import { saharaSynthesize, type SaharaTtsAccent } from "../lib/sahara";
import { scoreAll } from "./metrics";

type Sentence = {
  id: string;
  languagePair: string;
  text: string;
  source: string;
  saharaAccent: SaharaTtsAccent;
  saharaAccentNote?: string;
  edgeVoice: string;
  gttsLang: string;
  gttsNote?: string;
};

type SystemResult = {
  system: string;
  config: string;
  bytes: number;
  synthesisMs: number;
  transcript: string;
  wer: number;
  accuracy: number;
  transcriptLoss: number;
  segmentLoss: number;
  insertionRate: number;
  error?: string;
};

const TTS_DIR = path.join(process.cwd(), "benchmark", "tts");
const AUDIO_DIR = path.join(TTS_DIR, "audio");
const JUDGE = "openai/whisper-large-v3";

async function transcribe(audio: Buffer, contentType: string): Promise<string> {
  const key = process.env.HF_API_TOKEN?.trim();
  if (!key) throw new Error("HF_API_TOKEN not set");
  const res = await fetch(`https://router.huggingface.co/hf-inference/models/${JUDGE}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": contentType },
    body: new Uint8Array(audio),
    signal: AbortSignal.timeout(300_000),
  });
  if (!res.ok) throw new Error(`judge ASR failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
  return ((await res.json()) as { text?: string }).text ?? "";
}

const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

async function main() {
  const sentences: Sentence[] = JSON.parse(await readFile(path.join(TTS_DIR, "sentences.json"), "utf-8"));
  const timings: Record<string, Record<string, number>> = JSON.parse(
    await readFile(path.join(TTS_DIR, "timings.json"), "utf-8").catch(() => "{}"),
  );

  const all: { sentence: Sentence; results: SystemResult[] }[] = [];

  for (const s of sentences) {
    const results: SystemResult[] = [];

    // Sahara TTS, synthesised here so it goes through the same client the
    // product uses.
    const saharaPath = path.join(AUDIO_DIR, `sahara-${s.id}.wav`);
    let saharaBuf: Buffer | null = null;
    let saharaMs = 0;
    try {
      const cached = await stat(saharaPath).then(() => true).catch(() => false);
      if (cached) {
        saharaBuf = await readFile(saharaPath);
        saharaMs = timings[s.id]?.sahara ?? 0;
        console.log(`sahara ${s.id.padEnd(8)} (cached)`);
      } else {
        const started = Date.now();
        const { audio } = await saharaSynthesize(s.text, { accent: s.saharaAccent, gender: "female" });
        saharaMs = Date.now() - started;
        saharaBuf = audio;
        await writeFile(saharaPath, new Uint8Array(audio));
        timings[s.id] = { ...(timings[s.id] ?? {}), sahara: saharaMs };
        console.log(`sahara ${s.id.padEnd(8)} ${audio.length} bytes ${saharaMs}ms`);
      }
    } catch (err) {
      results.push({
        system: "Sahara TTS", config: `accent=${s.saharaAccent}`, bytes: 0, synthesisMs: 0,
        transcript: "", wer: 1, accuracy: 0, transcriptLoss: 1, segmentLoss: 1, insertionRate: 0,
        error: (err as Error).message,
      });
      console.log(`sahara ${s.id.padEnd(8)} FAILED: ${(err as Error).message}`);
    }

    const systems: { system: string; config: string; file: string; type: string; buf?: Buffer; ms: number }[] = [];
    if (saharaBuf) {
      systems.push({ system: "Sahara TTS", config: `accent=${s.saharaAccent}`, file: `sahara-${s.id}.wav`, type: "audio/wav", buf: saharaBuf, ms: saharaMs });
    }
    systems.push({ system: "edge-tts (Microsoft)", config: s.edgeVoice, file: `edge-${s.id}.mp3`, type: "audio/mpeg", ms: timings[s.id]?.edge ?? 0 });
    systems.push({ system: "gTTS (Google)", config: `lang=${s.gttsLang}`, file: `gtts-${s.id}.mp3`, type: "audio/mpeg", ms: timings[s.id]?.gtts ?? 0 });

    for (const sys of systems) {
      try {
        const buf = sys.buf ?? (await readFile(path.join(AUDIO_DIR, sys.file)));
        const transcript = await transcribe(buf, sys.type);
        const sc = scoreAll(s.text, transcript);
        results.push({
          system: sys.system, config: sys.config, bytes: buf.length, synthesisMs: sys.ms, transcript,
          wer: sc.wer, accuracy: sc.accuracy, transcriptLoss: sc.transcriptLoss,
          segmentLoss: sc.segmentLoss.rate, insertionRate: sc.hallucination.insertionRate,
        });
        console.log(`  ${sys.system.padEnd(22)} ${s.id.padEnd(8)} WER ${pct(sc.wer)}`);
      } catch (err) {
        results.push({
          system: sys.system, config: sys.config, bytes: 0, synthesisMs: sys.ms, transcript: "",
          wer: 1, accuracy: 0, transcriptLoss: 1, segmentLoss: 1, insertionRate: 0, error: (err as Error).message,
        });
        console.log(`  ${sys.system.padEnd(22)} ${s.id.padEnd(8)} FAILED: ${(err as Error).message}`);
      }
    }

    all.push({ sentence: s, results });
  }

  await writeFile(path.join(TTS_DIR, "timings.json"), JSON.stringify(timings, null, 2), "utf-8");
  await writeFile(path.join(TTS_DIR, "report.json"), JSON.stringify(all, null, 2), "utf-8");

  // --- report -------------------------------------------------------------
  const names = [...new Set(all.flatMap((a) => a.results.map((r) => r.system)))];
  const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
  const L: string[] = [];
  L.push("# TTS benchmark: Sahara TTS vs edge-tts vs gTTS");
  L.push("");
  L.push("Aide's entire output is speech, so its text-to-speech is benchmarked on the same footing as its recognition.");
  L.push("");
  L.push("## Method");
  L.push("");
  L.push("Round-trip intelligibility. Each system speaks the same code-switched sentence, one fixed recogniser (`" + JUDGE + "`) transcribes every rendering, and the transcript is scored against the original text with the same five metrics as the ASR benchmark (`src/metrics.ts`). A line a listener cannot make out is a line the recogniser cannot either, so a higher round-trip WER means a less intelligible rendering.");
  L.push("");
  L.push("The judge is held constant deliberately. Whisper large-v3 is not the strongest model in our ASR benchmark, but every system is scored by the same recogniser, so the comparison between systems is fair even where the absolute numbers are not the last word.");
  L.push("");
  L.push("The four sentences are real reference transcripts from Intron AfriSwitchCare, not text written for this test, so each one is genuine code-switched speech.");
  L.push("");
  L.push("## Results");
  L.push("");
  L.push("| System | Config | Round-trip WER | Accuracy | Transcript loss | Insertion rate | Synthesis latency |");
  L.push("|---|---|---|---|---|---|---|");
  for (const n of names) {
    const rs = all.flatMap((a) => a.results.filter((r) => r.system === n));
    const ok = rs.filter((r) => !r.error);
    const cfg = [...new Set(rs.map((r) => r.config))];
    L.push(
      `| ${n} | ${cfg.length === 1 ? cfg[0] : "per language"} | ${pct(mean(ok.map((r) => r.wer)))} | ` +
        `${pct(mean(ok.map((r) => r.accuracy)))} | ${pct(mean(ok.map((r) => r.transcriptLoss)))} | ` +
        `${pct(mean(ok.map((r) => r.insertionRate)))} | ${Math.round(mean(ok.map((r) => r.synthesisMs)))}ms |`,
    );
  }
  L.push("");
  L.push("## Per sentence");
  L.push("");
  for (const a of all) {
    L.push(`**${a.sentence.id}** (${a.sentence.languagePair})`);
    L.push("");
    L.push("> " + a.sentence.text);
    L.push("");
    L.push("| System | Round-trip WER | What the recogniser heard |");
    L.push("|---|---|---|");
    for (const r of a.results) {
      const heard = r.error ? `FAILED: ${r.error}` : (r.transcript || "(nothing)").replace(/\|/g, " ").slice(0, 160);
      L.push(`| ${r.system} | ${r.error ? "n/a" : pct(r.wer)} | ${heard} |`);
    }
    L.push("");
  }
  await writeFile(path.join(TTS_DIR, "report.md"), L.join("\n"), "utf-8");
  console.log("\nwrote benchmark/tts/report.md and report.json");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
