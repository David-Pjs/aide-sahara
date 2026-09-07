// Sahara CodeSwitch Africa Challenge — required benchmark: Sahara vs at least
// two other speech models on code-switched audio. Run with:
//
//   npx tsx src/benchmark.ts
//
// Reads benchmark/manifest.json (a list of local audio clips + ground-truth
// transcripts + language pair/accent/noise metadata — see benchmark/README.md
// for how to pull real clips from Intron's own Afriswitch dataset on
// Hugging Face) and scores each configured provider's transcript against the
// reference with Word Error Rate (WER) and Character Error Rate (CER).
//
// Writes benchmark/report.json (machine-readable) and benchmark/report.md
// (the human-readable table for the submission package).

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import "dotenv/config";
import { saharaTranscribe, type SaharaAsrLanguage } from "../lib/sahara.js";

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
};

type ProviderResult = { provider: string; transcript: string; wer: number; cer: number; latencyMs: number; error?: string };

const BENCHMARK_DIR = path.join(process.cwd(), "benchmark");
const MANIFEST_PATH = path.join(BENCHMARK_DIR, "manifest.json");

async function loadManifest(): Promise<ManifestEntry[]> {
  const raw = await readFile(MANIFEST_PATH, "utf-8");
  return JSON.parse(raw) as ManifestEntry[];
}

// --- Providers -------------------------------------------------------------

async function transcribeWithSahara(entry: ManifestEntry, audio: Buffer): Promise<string> {
  const blob = new Blob([new Uint8Array(audio)], { type: "audio/wav" });
  const result = await saharaTranscribe(blob, path.basename(entry.audioPath), {
    languageAsrInput: entry.saharaLanguageHint,
  });
  return result.transcript;
}

// Groq hosts whisper-large-v3 with an OpenAI-compatible audio endpoint —
// https://console.groq.com/docs/speech-to-text. Free tier key is enough for
// a benchmark run of a few clips.
async function transcribeWithGroq(entry: ManifestEntry, audio: Buffer): Promise<string> {
  const key = process.env.GROQ_API_KEY?.trim();
  if (!key) throw new Error("GROQ_API_KEY not set");
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(audio)]), path.basename(entry.audioPath));
  form.append("model", process.env.GROQ_STT_MODEL || "whisper-large-v3");
  const res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}` },
    body: form,
  });
  if (!res.ok) throw new Error(`Groq STT failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
  const json = (await res.json()) as { text: string };
  return json.text;
}

// Any open-source/hosted model reachable through Hugging Face's Inference
// API. Defaults to openai/whisper-large-v3; swap HF_STT_MODEL for an
// Africa-focused model (e.g. one fine-tuned on the Afriswitch dataset) if
// your team hosts one.
async function transcribeWithHuggingFace(entry: ManifestEntry, audio: Buffer): Promise<string> {
  const key = process.env.HF_API_TOKEN?.trim();
  if (!key) throw new Error("HF_API_TOKEN not set");
  const model = process.env.HF_STT_MODEL || "openai/whisper-large-v3";
  const res = await fetch(`https://api-inference.huggingface.co/models/${model}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "audio/wav" },
    body: new Uint8Array(audio),
  });
  if (!res.ok) throw new Error(`HF Inference failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
  const json = (await res.json()) as { text: string };
  return json.text;
}

type Provider = { name: string; run: (entry: ManifestEntry, audio: Buffer) => Promise<string> };

const PROVIDERS: Provider[] = [
  { name: "Sahara v2.5", run: transcribeWithSahara },
  { name: "Groq whisper-large-v3", run: transcribeWithGroq },
  { name: `HuggingFace ${process.env.HF_STT_MODEL || "openai/whisper-large-v3"}`, run: transcribeWithHuggingFace },
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
    console.error("benchmark/manifest.json is empty — see benchmark/README.md to add sample clips.");
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
    "# Sahara CodeSwitch Africa Challenge — Benchmark Report",
    "",
    "Aide (voice-native work-and-pay platform for blind Nigerian workers) benchmarked on code-switched audio.",
    "",
  ];
  const providerNames = allResults[0]?.results.map((r) => r.provider) ?? [];
  lines.push(`| Clip | Language pair | ${providerNames.map((n) => `${n} WER`).join(" | ")} |`);
  lines.push(`|---|---|${providerNames.map(() => "---").join("|")}|`);
  for (const { entry, results } of allResults) {
    lines.push(`| ${entry.id} | ${entry.languagePair} | ${results.map((r) => (r.error ? "FAILED" : `${(r.wer * 100).toFixed(1)}%`)).join(" | ")} |`);
  }

  lines.push("", "## Averages", "");
  for (const name of providerNames) {
    const werValues = allResults.map((r) => r.results.find((x) => x.provider === name)?.wer ?? 1);
    const avg = werValues.reduce((a, b) => a + b, 0) / werValues.length;
    lines.push(`- **${name}**: average WER ${(avg * 100).toFixed(1)}%`);
  }

  lines.push("", "## Per-clip transcripts", "");
  for (const { entry, results } of allResults) {
    lines.push(`### ${entry.id}`, "", `**Reference:** ${entry.reference}`, "");
    for (const r of results) {
      lines.push(`- **${r.provider}** (${r.latencyMs}ms): ${r.error ? `_${r.error}_` : r.transcript}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

await main();
