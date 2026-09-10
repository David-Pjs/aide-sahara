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
import { scoreAll, type Scored } from "./metrics";

type ProviderResult = { provider: string; transcript: string; wer: number; cer: number; latencyMs: number; error?: string };
type Entry = {
  entry: { id: string; reference: string; languagePair: string; durationSeconds?: number };
  results: ProviderResult[];
};

const ROOT = join(process.cwd(), "benchmark");
const report: Entry[] = JSON.parse(readFileSync(join(ROOT, "report.json"), "utf8"));

const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

type Row = Scored & { clip: string; languagePair: string; provider: string };
const rows: Row[] = [];

for (const item of report) {
  for (const r of item.results) {
    const s = scoreAll(item.entry.reference, r.transcript ?? "");
    rows.push({ ...s, clip: item.entry.id, languagePair: item.entry.languagePair, provider: r.provider });
  }
}

const providers = [...new Set(rows.map((r) => r.provider))];
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

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
lines.push("| WER | (substitutions + deletions + insertions) / reference words |");
lines.push("| Accuracy | correct reference words / reference words. Reported because WER exceeds 100% once a model inserts more than it gets right, which reads as nonsense on its own |");
lines.push("| Transcript loss | deletions / reference words. Content the model never produced at all, separated from content it got wrong |");
lines.push("| Segment loss | share of reference sentences where under 20% of the words survived. A dropped utterance, not a garbled one |");
lines.push("| Hallucination | insertions / reference words, plus a repetition-loop detector: an n-gram (n up to 12) repeated 3+ times consecutively. A loop counts as *runaway* only at 10+ repeats or a looped region of 20+ words, so genuine conversational repetition is not counted against a model |");
lines.push("");
lines.push("### Averages across the four clips");
lines.push("");
lines.push("| Model | WER | Accuracy | Transcript loss | Segment loss | Hallucination (insertion rate) | Runaway loops |");
lines.push("|---|---|---|---|---|---|---|");
for (const p of providers) {
  const rs = rows.filter((r) => r.provider === p);
  const loops = rs.filter((r) => r.hallucination.severe).length;
  lines.push(
    `| ${p} | ${pct(mean(rs.map((r) => r.wer)))} | ${pct(mean(rs.map((r) => r.accuracy)))} | ` +
      `${pct(mean(rs.map((r) => r.transcriptLoss)))} | ${pct(mean(rs.map((r) => r.segmentLoss.rate)))} | ` +
      `${pct(mean(rs.map((r) => r.hallucination.insertionRate)))} | ${loops} of ${rs.length} |`,
  );
}
lines.push("");
lines.push("### Per clip");
lines.push("");
for (const item of report) {
  lines.push(`**${item.entry.id}** (${item.entry.languagePair})`);
  lines.push("");
  lines.push("| Model | WER | Accuracy | Transcript loss | Segment loss | Insertion rate | Repetition loop |");
  lines.push("|---|---|---|---|---|---|---|");
  for (const p of providers) {
    const r = rows.find((x) => x.clip === item.entry.id && x.provider === p);
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
if (startAt >= 0 && endAt > startAt) {
  const eol = reportText.includes("\r\n") ? "\r\n" : "\n";
  const rebuilt = reportText.slice(0, startAt) + block.split("\n").join(eol) + eol + eol + reportText.slice(endAt);
  writeFileSync(reportPath, rebuilt, "utf8");
  console.error("refreshed the Extended metrics section of report.md");
}

console.log(lines.join("\n"));
console.error("\nwrote benchmark/metrics.md and benchmark/metrics.json");
