// Re-scores benchmark/report.json against the five metrics the challenge asks
// for, and writes benchmark/metrics.md.
//
// Deliberately offline. It reads the transcripts the harness already captured
// and calls no speech API, so the extended metrics cost nothing to recompute
// and anyone can reproduce them from the committed report.json alone.
//
//   npx tsx src/score-report.ts

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { scoreAll, align, wer as werOf, wordsUnnormalized, normalize, type Scored } from "./metrics";

type ProviderResult = { provider: string; transcript: string; wer: number; cer: number; latencyMs: number; error?: string };
type Entry = {
  entry: { id: string; reference: string; languagePair: string; durationSeconds?: number };
  results: ProviderResult[];
};

const ROOT = join(process.cwd(), "benchmark");
const report: Entry[] = JSON.parse(readFileSync(join(ROOT, "report.json"), "utf8"));
type ManifestEntry = { id: string; diagnosis?: string; durationSeconds?: number; codeMixIndex?: number };
const manifest: ManifestEntry[] = JSON.parse(readFileSync(join(ROOT, "manifest.json"), "utf8"));
const meta = new Map(manifest.map((m) => [m.id, m]));

/** Character error rate over the same Intron-aligned normalisation as WER, so
 *  the two are computed from one definition rather than two. */
function cer(reference: string, hypothesis: string): number {
  const r = normalize(reference).replace(/ /g, "").split("");
  const h = normalize(hypothesis).replace(/ /g, "").split("");
  if (r.length === 0) return h.length === 0 ? 0 : 1;
  let prev = Array.from({ length: h.length + 1 }, (_, j) => j);
  for (let i = 1; i <= r.length; i++) {
    const cur = [i];
    for (let j = 1; j <= h.length; j++) {
      cur[j] = r[i - 1] === h[j - 1] ? prev[j - 1] : 1 + Math.min(prev[j], cur[j - 1], prev[j - 1]);
    }
    prev = cur;
  }
  return prev[h.length] / r.length;
}

const mmss = (sec?: number) => (sec === undefined ? "" : `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, "0")}`);

const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

type Row = Scored & { werUnnorm: number; cer: number; latencyMs: number; clip: string; languagePair: string; provider: string };
const rows: Row[] = [];

for (const item of report) {
  for (const r of item.results) {
    const s = scoreAll(item.entry.reference, r.transcript ?? "");
    const werUnnorm = werOf(align(item.entry.reference, r.transcript ?? "", wordsUnnormalized));
    const c = cer(item.entry.reference, r.transcript ?? "");
    rows.push({ ...s, werUnnorm, cer: c, latencyMs: r.latencyMs, clip: item.entry.id, languagePair: item.entry.languagePair, provider: r.provider });
  }
}

const providers = [...new Set(rows.map((r) => r.provider))];

// FAIRNESS GUARD. Every model must be scored on exactly the same clips, or an
// average silently compares one model's easy set against another's hard set.
// A clip is only scored once every provider has a real transcript for it;
// anything short of that is staged, reported as such, and excluded.
const complete = report.filter((item) => providers.every((p) => item.results.some((r) => r.provider === p && !r.error)));
const staged = report.filter((item) => !complete.includes(item));
const completeIds = new Set(complete.map((i) => i.entry.id));
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const scored = rows.filter((r) => completeIds.has(r.clip));

const lines: string[] = [];
lines.push("## Extended metrics");
lines.push("");
lines.push(
  "The challenge asks for hallucination, transcript loss, segment loss, WER and accuracy. " +
    "All five are derived from one word-level alignment per (reference, transcript) pair by `src/metrics.ts`, " +
    "so they stay mutually consistent and every model is scored by the same code against the same reference. " +
    "`npx tsx src/score-report.ts` regenerates this section from `report.json` without calling any speech API.",
);
lines.push("");
lines.push("### Definitions");
lines.push("");
lines.push("| Metric | Definition |");
lines.push("|---|---|");
lines.push("| WER | (substitutions + deletions + insertions) / reference words, over text normalised with Intron's own pipeline: inaudible tags stripped, filler words dropped, lowercased, punctuation removed |");
lines.push("| WER (unnormalised) | the same measure with case and punctuation intact, published alongside the normalised figure exactly as Intron do, so a reader can see how much of a result rests on the normalisation choice |");
lines.push("| Accuracy | correct reference words / reference words. Reported because WER exceeds 100% once a model inserts more than it gets right, which reads as nonsense on its own |");
lines.push("| Transcript loss | deletions / reference words. Content the model never produced at all, separated from content it got wrong |");
lines.push("| Segment loss | share of reference sentences where under 20% of the words survived. A dropped utterance, not a garbled one |");
lines.push("| Hallucination | insertions / reference words, plus a repetition-loop detector: an n-gram (n up to 12) repeated 3+ times consecutively. A loop counts as *runaway* only at 10+ repeats or a looped region of 20+ words, so genuine conversational repetition is not counted against a model |");
lines.push("");
lines.push(`### Averages across the ${complete.length} fully scored clips`);
if (staged.length) {
  lines.push("");
  lines.push(`> ${staged.length} further clip(s) are extracted and in the manifest but not yet scored by every model, so they are excluded here. Averaging a model over clips its competitors were never run on would compare an easy set against a hard one. Pending: ${staged.map((s2) => s2.entry.id).join(", ")}.`);
}
lines.push("");
lines.push("| Model | WER | WER (unnormalised) | Accuracy | Transcript loss | Segment loss | Hallucination (insertion rate) | Runaway loops |");
lines.push("|---|---|---|---|---|---|---|---|");
for (const p of providers) {
  const rs = scored.filter((r) => r.provider === p);
  const loops = rs.filter((r) => r.hallucination.severe).length;
  lines.push(
    `| ${p} | ${pct(mean(rs.map((r) => r.wer)))} | ${pct(mean(rs.map((r) => r.werUnnorm)))} | ${pct(mean(rs.map((r) => r.accuracy)))} | ` +
      `${pct(mean(rs.map((r) => r.transcriptLoss)))} | ${pct(mean(rs.map((r) => r.segmentLoss.rate)))} | ` +
      `${pct(mean(rs.map((r) => r.hallucination.insertionRate)))} | ${loops} of ${rs.length} |`,
  );
}
lines.push("");
lines.push("### Per clip");
lines.push("");
for (const item of complete) {
  lines.push(`**${item.entry.id}** (${item.entry.languagePair})`);
  lines.push("");
  lines.push("| Model | WER | Accuracy | Transcript loss | Segment loss | Insertion rate | Repetition loop |");
  lines.push("|---|---|---|---|---|---|---|");
  for (const p of providers) {
    const r = scored.find((x) => x.clip === item.entry.id && x.provider === p);
    if (!r) continue;
    const loop = r.hallucination.hasLoop
      ? `${r.hallucination.severe ? "runaway" : "minor"}: "${r.hallucination.loopPhrase}" x${r.hallucination.maxRepeat} (${pct(r.hallucination.loopedShare)} of output)`
      : "none";
    lines.push(
      `| ${p} | ${pct(r.wer)} | ${pct(r.accuracy)} | ${pct(r.transcriptLoss)} | ` +
        `${pct(r.segmentLoss.rate)} (${r.segmentLoss.lost}/${r.segmentLoss.total}) | ${pct(r.hallucination.insertionRate)} | ${loop} |`,
    );
  }
  lines.push("");
}

const block = lines.join("\n");
writeFileSync(join(ROOT, "metrics.md"), block, "utf8");
writeFileSync(join(ROOT, "metrics.json"), JSON.stringify(rows, null, 2), "utf8");
// Keep report.md's Extended metrics section in step with the data. Without
// this the report holds a stale snapshot the moment a provider is added, and a
// report that disagrees with its own JSON is worse than no report.
const reportPath = join(ROOT, "report.md");
const reportText = readFileSync(reportPath, "utf8");
const startMark = "## Extended metrics";
const endMark = "## Strengths and weaknesses";
const startAt = reportText.indexOf(startMark);
const endAt = reportText.indexOf(endMark);

// Results and Averages are derived too, so a changed metric definition cannot
// leave the headline table disagreeing with the section below it.
const R: string[] = [];
R.push("## Results");
R.push("");
R.push(`| Clip | Language pair | Diagnosis (simulated) | Duration | Code-mix index | ${providers.map((n) => `${n} WER`).join(" | ")} |`);
R.push(`|---|---|---|---|---|${providers.map(() => "---").join("|")}|`);
for (const item of complete) {
  const m = meta.get(item.entry.id);
  const cells = providers.map((p) => pct(scored.find((r) => r.clip === item.entry.id && r.provider === p)?.wer ?? 1));
  R.push(`| ${item.entry.id} | ${item.entry.languagePair} | ${m?.diagnosis ?? ""} | ${mmss(m?.durationSeconds)} | ${(m?.codeMixIndex ?? 0).toFixed(1)} | ${cells.join(" | ")} |`);
}
R.push("");
R.push("## Averages");
R.push("");
for (const p of providers) {
  const rs = scored.filter((r) => r.provider === p);
  R.push(`- **${p}**: average WER ${pct(mean(rs.map((r) => r.wer)))}, average CER ${pct(mean(rs.map((r) => r.cer)))}, average latency ${Math.round(mean(rs.map((r) => r.latencyMs)))}ms`);
}
R.push("");
{
  const rt = readFileSync(reportPath, "utf8");
  const a = rt.indexOf("## Results");
  const b = rt.indexOf("## Extended metrics");
  if (a >= 0 && b > a) {
    const eol2 = rt.includes("\n") ? "\n" : "\n";
    writeFileSync(reportPath, rt.slice(0, a) + R.join("\n").split("\n").join(eol2) + eol2 + rt.slice(b), "utf8");
    console.error("regenerated Results and Averages in report.md");
  }
}

const reportText2 = readFileSync(reportPath, "utf8");
const startAt2 = reportText2.indexOf(startMark);
const endAt2 = reportText2.indexOf(endMark);
if (startAt2 >= 0 && endAt2 > startAt2) {
  const eol = reportText2.includes("\r\n") ? "\r\n" : "\n";
  const rebuilt = reportText2.slice(0, startAt2) + block.split("\n").join(eol) + eol + eol + reportText2.slice(endAt2);
  writeFileSync(reportPath, rebuilt, "utf8");
  console.error("refreshed the Extended metrics section of report.md");
}

console.log(lines.join("\n"));
console.error("\nwrote benchmark/metrics.md and benchmark/metrics.json");
