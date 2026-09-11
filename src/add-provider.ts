// Runs ONE speech model over the benchmark clips and merges its results into
// benchmark/report.json, leaving every existing provider's transcript untouched.
//
// This exists because re-running the whole harness to add a fourth model would
// re-transcribe everything through Sahara as well, and the challenge grants
// about one dollar of Sahara credit in total. Adding a comparator must not cost
// the credit already spent on the model under test.
//
//   npx tsx src/add-provider.ts qwen
//   npx tsx src/add-provider.ts sahara --set afriswitch --missing
//
// --set afriswitch scores the short AfriSwitch clips into their own report,
// benchmark/afriswitch_report.json, created from afriswitch_manifest.json on
// first use. The two sets never share a table: six-minute clinical
// conversations and ten-second utterances are different tasks.
//
// After it finishes, re-derive the extended metrics with:
//
//   npx tsx src/score-report.ts [--set afriswitch]

import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { saharaTranscribeAsync, type SaharaAsrLanguage } from "../lib/sahara";
import { align, wer as werOf } from "./metrics";

type ManifestEntry = { id: string; audioPath: string; reference: string; saharaLanguageHint?: SaharaAsrLanguage; [k: string]: unknown };
type ProviderResult = { provider: string; transcript: string; wer: number; cer: number; latencyMs: number; error?: string };
type ReportEntry = { entry: ManifestEntry; results: ProviderResult[] };

const BENCHMARK_DIR = path.join(process.cwd(), "benchmark");
const SET = process.argv.includes("--set") ? process.argv[process.argv.indexOf("--set") + 1] : "main";
const REPORT_FILE = SET === "afriswitch" ? "afriswitch_report.json" : "report.json";

function normalize(text: string): string {
  return text.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, "").replace(/\s+/g, " ").trim();
}

/** Character error rate, matching src/benchmark.ts exactly (whitespace removed)
 *  so a provider added here is scored the same way as the original three. */
function cer(reference: string, hypothesis: string): number {
  const ref = normalize(reference).replace(/\s/g, "").split("");
  const hyp = normalize(hypothesis).replace(/\s/g, "").split("");
  if (ref.length === 0) return hyp.length === 0 ? 0 : 1;
  const dp: number[][] = Array.from({ length: ref.length + 1 }, () => new Array(hyp.length + 1).fill(0));
  for (let i = 0; i <= ref.length; i++) dp[i][0] = i;
  for (let j = 0; j <= hyp.length; j++) dp[0][j] = j;
  for (let i = 1; i <= ref.length; i++) {
    for (let j = 1; j <= hyp.length; j++) {
      dp[i][j] = ref[i - 1] === hyp[j - 1] ? dp[i - 1][j - 1] : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[ref.length][hyp.length] / ref.length;
}

/** Qwen3-ASR (Alibaba), reached through Hugging Face's router to DeepInfra's
 *  OpenAI-compatible transcription endpoint.
 *
 *  Why this model: hf-inference serves exactly two ASR models and both are
 *  OpenAI Whisper, so the original three-model comparison was one specialist
 *  against two builds of a single generalist from a single vendor. Qwen3-ASR is
 *  a different vendor, a different architecture and independently multilingual,
 *  which is what makes the comparison a comparison. */
async function transcribeWithQwen(audio: Buffer, filename: string): Promise<string> {
  const key = process.env.HF_API_TOKEN?.trim();
  if (!key) throw new Error("HF_API_TOKEN not set");
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(audio)], { type: "audio/wav" }), filename);
  form.append("model", "Qwen/Qwen3-ASR-1.7B");
  const res = await fetch("https://router.huggingface.co/deepinfra/v1/openai/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}` },
    body: form,
    signal: AbortSignal.timeout(300_000),
  });
  if (!res.ok) throw new Error(`Qwen3-ASR failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
  const json = (await res.json()) as { text?: string };
  return json.text ?? "";
}

/** OpenAI Whisper through Hugging Face's own inference provider, the same
 *  route the original harness used, so a clip added later is transcribed
 *  exactly as the first four were. */
function hfInference(model: string) {
  return async (audio: Buffer): Promise<string> => {
    const key = process.env.HF_API_TOKEN?.trim();
    if (!key) throw new Error("HF_API_TOKEN not set");
    const res = await fetch(`https://router.huggingface.co/hf-inference/models/${model}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "audio/wav" },
      body: new Uint8Array(audio),
      signal: AbortSignal.timeout(600_000),
    });
    if (!res.ok) throw new Error(`HF Inference (${model}) failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
    return ((await res.json()) as { text?: string }).text ?? "";
  };
}

/** Sahara through the async Upload File endpoint, the same call and language
 *  hint src/benchmark.ts uses, so a clip scored here matches the first run. */
async function transcribeWithSahara(audio: Buffer, filename: string, entry: ManifestEntry): Promise<string> {
  const blob = new Blob([new Uint8Array(audio)], { type: "audio/wav" });
  return (await saharaTranscribeAsync(blob, filename, { languageAsrInput: entry.saharaLanguageHint })).transcript;
}

/** The same OpenAI Whisper weights, hosted by Groq, used when Hugging Face
 *  credit is exhausted. Deliberately raw: no prompt, no language, temperature
 *  0, no cleaning. Aide's live fallback adds a Nigerian vocabulary prompt; a
 *  benchmark must measure the model, not our help. Named with "(Groq)" so a
 *  table can never pass a different host's decode off as the same run. */
function groqWhisper(model: string) {
  return async (audio: Buffer, filename: string): Promise<string> => {
    const key = process.env.GROQ_API_KEY?.trim();
    if (!key) throw new Error("GROQ_API_KEY not set");
    const form = new FormData();
    form.append("file", new Blob([new Uint8Array(audio)], { type: "audio/wav" }), filename);
    form.append("model", model);
    form.append("temperature", "0");
    form.append("response_format", "json");
    const res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}` },
      body: form,
      signal: AbortSignal.timeout(300_000),
    });
    if (!res.ok) throw new Error(`Groq (${model}) failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
    return ((await res.json()) as { text?: string }).text ?? "";
  };
}

const PROVIDERS: Record<string, { name: string; run: (audio: Buffer, filename: string, entry: ManifestEntry) => Promise<string> }> = {
  sahara: { name: "Sahara v2.5", run: transcribeWithSahara },
  qwen: { name: "Qwen3-ASR-1.7B (Alibaba)", run: transcribeWithQwen },
  whisper: { name: "OpenAI Whisper large-v3", run: hfInference("openai/whisper-large-v3") },
  turbo: { name: "OpenAI Whisper large-v3-turbo", run: hfInference("openai/whisper-large-v3-turbo") },
  "groq-whisper": { name: "OpenAI Whisper large-v3 (Groq)", run: groqWhisper("whisper-large-v3") },
  "groq-turbo": { name: "OpenAI Whisper large-v3-turbo (Groq)", run: groqWhisper("whisper-large-v3-turbo") },
};

async function loadReport(): Promise<ReportEntry[]> {
  const file = path.join(BENCHMARK_DIR, REPORT_FILE);
  if (existsSync(file)) return JSON.parse(await readFile(file, "utf-8"));
  if (SET !== "afriswitch") throw new Error(`${REPORT_FILE} not found`);
  const manifest: ManifestEntry[] = JSON.parse(await readFile(path.join(BENCHMARK_DIR, "afriswitch_manifest.json"), "utf-8"));
  return manifest.map((entry) => ({ entry, results: [] }));
}

async function main() {
  const which = process.argv[2];
  const provider = PROVIDERS[which];
  if (!provider) {
    console.error(`Unknown provider "${which}". Known: ${Object.keys(PROVIDERS).join(", ")}`);
    process.exit(1);
  }

  const report = await loadReport();

  const only = process.argv.includes("--missing");
  for (const item of report) {
    const existing = item.results.findIndex((r) => r.provider === provider.name);
    if (only && existing >= 0 && !item.results[existing].error) {
      console.log(`${item.entry.id.padEnd(26)} skipped (already scored)`);
      continue;
    }
    // audioPath is relative to benchmark/samples/ ("igbo.wav", "afriswitch/igbo-1.wav").
    const audio = await readFile(path.join(BENCHMARK_DIR, "samples", item.entry.audioPath));
    const started = Date.now();
    let result: ProviderResult;
    try {
      const transcript = await provider.run(audio, path.basename(item.entry.audioPath), item.entry);
      const latencyMs = Date.now() - started;
      const w = werOf(align(item.entry.reference, transcript));
      const c = cer(item.entry.reference, transcript);
      result = { provider: provider.name, transcript, wer: w, cer: c, latencyMs };
      console.log(`${item.entry.id.padEnd(24)} WER ${(w * 100).toFixed(1)}%  CER ${(c * 100).toFixed(1)}%  ${latencyMs}ms`);
    } catch (err) {
      result = { provider: provider.name, transcript: "", wer: 1, cer: 1, latencyMs: Date.now() - started, error: (err as Error).message };
      console.log(`${item.entry.id.padEnd(24)} FAILED: ${(err as Error).message}`);
    }
    if (existing >= 0) item.results[existing] = result;
    else item.results.push(result);
    // Saved after every clip, so a run that dies when credit runs out keeps
    // everything it had already paid for.
    await writeFile(path.join(BENCHMARK_DIR, REPORT_FILE), JSON.stringify(report, null, 2), "utf-8");
  }

  console.log(`\nmerged ${provider.name} into benchmark/${REPORT_FILE}`);
  console.log(`now run: npx tsx src/score-report.ts${SET === "afriswitch" ? " --set afriswitch" : ""}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
