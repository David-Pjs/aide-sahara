// Sahara CodeSwitch Africa Challenge, required benchmark: Sahara vs at least
// two other speech models on code-switched audio. Run with:
//
//   npx tsx src/benchmark.ts
//
// Reads benchmark/manifest.json (a list of local audio clips + ground-truth
// transcripts + language pair/accent/noise metadata, see benchmark/README.md
// for how to pull real clips from Intron's own Afriswitch dataset on
// Hugging Face) and scores each configured provider's transcript against the
// reference with Word Error Rate (WER) and Character Error Rate (CER).
//
// Writes benchmark/report.json (machine-readable) and benchmark/report.md
// (the human-readable table for the submission package).

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import "dotenv/config";
import { saharaTranscribeAsync, type SaharaAsrLanguage } from "../lib/sahara.js";

type ManifestEntry = {
  id: string;
  audioPath: string; // relative to benchmark/samples/
  reference: string; // ground-truth transcript
  languagePair: string; // e.g. "Yoruba-English"
  saharaLanguageHint: SaharaAsrLanguage;
  accentCountry?: string;
  domain?: string;
  deviceType?: string;
  noiseCondition?: string;
  source?: string;
  diagnosis?: string;
  durationSeconds?: number;
  numTurns?: number;
  codeMixIndex?: number;
  numSwitchPoints?: number;
};

type ProviderResult = { provider: string; transcript: string; wer: number; cer: number; latencyMs: number; error?: string };

const BENCHMARK_DIR = path.join(process.cwd(), "benchmark");
const MANIFEST_PATH = path.join(BENCHMARK_DIR, "manifest.json");

async function loadManifest(): Promise<ManifestEntry[]> {
  const raw = await readFile(MANIFEST_PATH, "utf-8");
  return JSON.parse(raw) as ManifestEntry[];
}

// --- Providers -------------------------------------------------------------

// Real conversation recordings run well past Sahara's 120s Sync cap, so the
// benchmark uses the async Upload File endpoint (no documented duration
// limit, live-tested successfully on a 376s clip) instead of Sync.
async function transcribeWithSahara(entry: ManifestEntry, audio: Buffer): Promise<string> {
  const blob = new Blob([new Uint8Array(audio)], { type: "audio/wav" });
  const result = await saharaTranscribeAsync(blob, path.basename(entry.audioPath), {
    languageAsrInput: entry.saharaLanguageHint,
  });
  return result.transcript;
}

// OpenAI's flagship general-purpose ASR model, reached through Hugging
// Face's Inference Providers router (not the legacy api-inference host,
// which is dead/migrated). State-of-the-art on most public multilingual ASR
// benchmarks, this is the "best global general-purpose model" comparator.
async function transcribeWithWhisperLargeV3(entry: ManifestEntry, audio: Buffer): Promise<string> {
  return callHfInference("openai/whisper-large-v3", audio);
}

// The distilled/faster sibling of the same flagship model, a second,
// genuinely different comparator (speed/accuracy tradeoff point), not just
// a re-run of the same model.
async function transcribeWithWhisperTurbo(entry: ManifestEntry, audio: Buffer): Promise<string> {
  return callHfInference("openai/whisper-large-v3-turbo", audio);
}

async function callHfInference(model: string, audio: Buffer): Promise<string> {
  const key = process.env.HF_API_TOKEN?.trim();
  if (!key) throw new Error("HF_API_TOKEN not set");
  const res = await fetch(`https://router.huggingface.co/hf-inference/models/${model}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "audio/wav" },
    body: new Uint8Array(audio),
  });
  if (!res.ok) throw new Error(`HF Inference (${model}) failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
  const json = (await res.json()) as { text: string };
  return json.text;
}

type Provider = { name: string; run: (entry: ManifestEntry, audio: Buffer) => Promise<string> };

const PROVIDERS: Provider[] = [
  { name: "Sahara v2.5", run: transcribeWithSahara },
  { name: "OpenAI Whisper large-v3", run: transcribeWithWhisperLargeV3 },
  { name: "OpenAI Whisper large-v3-turbo", run: transcribeWithWhisperTurbo },
];

// --- Scoring -----------------------------------------------------------

function editDistance<T>(a: T[], b: T[]): number {
  const dp: number[][] = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) dp[i][0] = i;
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      if (a[i - 1] === b[j - 1]) dp[i][j] = dp[i - 1][j - 1];
      else dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[a.length][b.length];
}

function normalize(text: string): string {
  return text.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, "").replace(/\s+/g, " ").trim();
}

function wer(reference: string, hypothesis: string): number {
  const ref = normalize(reference).split(" ").filter(Boolean);
  const hyp = normalize(hypothesis).split(" ").filter(Boolean);
  if (ref.length === 0) return hyp.length === 0 ? 0 : 1;
  return editDistance(ref, hyp) / ref.length;
}

function cer(reference: string, hypothesis: string): number {
  const ref = normalize(reference).replace(/\s/g, "").split("");
  const hyp = normalize(hypothesis).replace(/\s/g, "").split("");
  if (ref.length === 0) return hyp.length === 0 ? 0 : 1;
  return editDistance(ref, hyp) / ref.length;
}

// --- Runner --------------------------------------------------------------

async function main() {
  const manifest = await loadManifest();
  if (manifest.length === 0) {
    console.error("benchmark/manifest.json is empty, see benchmark/README.md to add sample clips.");
    process.exit(1);
  }

  const allResults: { entry: ManifestEntry; results: ProviderResult[] }[] = [];

  for (const entry of manifest) {
    const audioPath = path.join(BENCHMARK_DIR, "samples", entry.audioPath);
    const audio = await readFile(audioPath).catch((err) => {
      console.error(`Skipping ${entry.id}: cannot read ${audioPath} (${err.message})`);
      return null;
    });
    if (!audio) continue;

    console.log(`\n--- ${entry.id} (${entry.languagePair}) ---`);
    const results: ProviderResult[] = [];
    for (const provider of PROVIDERS) {
      const start = Date.now();
      try {
        const transcript = await provider.run(entry, audio);
        const latencyMs = Date.now() - start;
        const w = wer(entry.reference, transcript);
        const c = cer(entry.reference, transcript);
        results.push({ provider: provider.name, transcript, wer: w, cer: c, latencyMs });
        console.log(`${provider.name.padEnd(28)} WER ${(w * 100).toFixed(1)}%  CER ${(c * 100).toFixed(1)}%  ${latencyMs}ms`);
      } catch (err) {
        results.push({ provider: provider.name, transcript: "", wer: 1, cer: 1, latencyMs: Date.now() - start, error: (err as Error).message });
        console.log(`${provider.name.padEnd(28)} FAILED: ${(err as Error).message}`);
      }
    }
    allResults.push({ entry, results });
  }

  await writeFile(path.join(BENCHMARK_DIR, "report.json"), JSON.stringify(allResults, null, 2));
  await writeFile(path.join(BENCHMARK_DIR, "report.md"), renderMarkdown(allResults));
  console.log(`\nWrote benchmark/report.json and benchmark/report.md`);
}

function renderMarkdown(allResults: { entry: ManifestEntry; results: ProviderResult[] }[]): string {
  const lines: string[] = [
    "# Sahara CodeSwitch Africa Challenge: Benchmark Report",
    "",
    "Aide (voice-native work-and-pay platform for blind Nigerian workers) benchmarked on real code-switched audio.",
    "",
    "## Methodology",
    "",
    "- **Source**: [Intron AfriSwitchCare](https://huggingface.co/datasets/intronhealth/AfriSwitchCare), Intron's own published code-switching benchmark dataset. Simulated doctor-patient consultations; no real patient data (explicitly disclosed by the dataset authors).",
    "- **Clips**: whole conversations (audio + human-transcribed reference are paired 1:1 by the dataset's own construction, so there is zero alignment risk). Sahara's Upload File Sync caps at 120s, so the async Upload File endpoint was used instead (no documented duration limit, live-tested successfully).",
    "- **Metric**: Word Error Rate (WER) and Character Error Rate (CER), word/character-level Levenshtein edit distance over normalized (lowercased, punctuation-stripped) text. Speaker-turn artifacts (\" : \" separators left over from the dataset's own transcript format) were stripped from the reference before scoring, since they are not real spoken content and would otherwise penalize every model equally but unfairly.",
    "- **Models compared**: Sahara v2.5 (Africa/code-switching-specialized) vs. OpenAI Whisper large-v3 (global flagship, state-of-the-art on most public multilingual ASR benchmarks) vs. Whisper large-v3-turbo (its distilled, faster sibling), one specialized model against the current best general-purpose model at two speed/accuracy points.",
    "",
  ];
  const providerNames = allResults[0]?.results.map((r) => r.provider) ?? [];
  lines.push("## Results", "");
  lines.push(`| Clip | Language pair | Diagnosis (simulated) | Duration | Code-mix index | ${providerNames.map((n) => `${n} WER`).join(" | ")} |`);
  lines.push(`|---|---|---|---|---|${providerNames.map(() => "---").join("|")}|`);
  for (const { entry, results } of allResults) {
    const dur = entry.durationSeconds ? `${Math.floor(entry.durationSeconds / 60)}:${String(entry.durationSeconds % 60).padStart(2, "0")}` : "?";
    lines.push(
      `| ${entry.id} | ${entry.languagePair} | ${entry.diagnosis ?? "?"} | ${dur} | ${entry.codeMixIndex?.toFixed(1) ?? "?"} | ${results
        .map((r) => (r.error ? "FAILED" : `${(r.wer * 100).toFixed(1)}%`))
        .join(" | ")} |`
    );
  }

  lines.push("", "## Averages", "");
  for (const name of providerNames) {
    const werValues = allResults.map((r) => r.results.find((x) => x.provider === name)?.wer ?? 1);
    const cerValues = allResults.map((r) => r.results.find((x) => x.provider === name)?.cer ?? 1);
    const avgWer = werValues.reduce((a, b) => a + b, 0) / werValues.length;
    const avgCer = cerValues.reduce((a, b) => a + b, 0) / cerValues.length;
    const latencies = allResults.map((r) => r.results.find((x) => x.provider === name)?.latencyMs ?? 0);
    const avgLatency = Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length);
    lines.push(`- **${name}**: average WER ${(avgWer * 100).toFixed(1)}%, average CER ${(avgCer * 100).toFixed(1)}%, average latency ${avgLatency}ms`);
  }

  lines.push(
    "",
    "## Strengths and weaknesses",
    "",
    "_Fill in after reviewing the per-clip transcripts below: where did each model handle a language switch cleanly, and where did it produce fluent-sounding but wrong text (a common ASR failure mode on code-switched audio)?_",
    ""
  );

  lines.push("## Per-clip transcripts", "");
  for (const { entry, results } of allResults) {
    lines.push(
      `### ${entry.id} (${entry.languagePair}, ${entry.numTurns ?? "?"} turns, ${entry.numSwitchPoints ?? "?"} switch points)`,
      "",
      `**Reference (human transcript):** ${entry.reference}`,
      ""
    );
    for (const r of results) {
      lines.push(`- **${r.provider}** (WER ${(r.wer * 100).toFixed(1)}%, ${r.latencyMs}ms): ${r.error ? `_${r.error}_` : r.transcript}`);
    }
    lines.push("");
  }

  lines.push(
    "## Responsible AI note",
    "",
    "Benchmark audio is Intron's own published, consented AfriSwitchCare dataset: simulated doctor-patient roleplay performed by bilingual annotators, not recordings of real patients. No PII, no real clinical data. See the dataset's own disclosure at https://huggingface.co/datasets/intronhealth/AfriSwitchCare.",
    ""
  );

  return lines.join("\n");
}

await main();
