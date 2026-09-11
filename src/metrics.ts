// The five metrics the challenge asks for: WER, Accuracy, Hallucination,
// Transcript loss, Segment loss.
//
// WER alone is not enough and the Igbo clip in our own run proves it: Whisper
// scores a LOWER WER there than Sahara while fabricating a question-and-answer
// exchange that never happened. A metric that rewards the transcript with
// invented content in it is measuring the wrong thing on its own. So the four
// remaining metrics are all derived from a single word-level alignment per
// (reference, hypothesis) pair, which keeps them mutually consistent and
// keeps the comparison between models fair: every model is scored by the same
// code against the same reference.

// Tags the transcriber writes where speech was not speech. Intron strip these
// from both reference and hypothesis before scoring, in scripts/evaluations.py
// of intron-innovation/Intron-Multimodal-Benchmarking. Scoring a model for
// failing to reproduce "[inaudible]" would measure nothing real.
const INAUDIBLE = /\[(?:in ?aud[ai]ble|music|silence|noise|blank)\]|\((?:in ?aud[ai]ble|noise|audio is empty)\)/gi;

// Hesitations, removed for the same reason and from the same source. Whether a
// model transcribed "um" is not a measure of whether it understood the speaker.
const FILLERS = new Set(["ah", "blah", "eh", "hmm", "huh", "hum", "mmhmm", "mm", "oh", "ohh", "uh", "uhhuh", "umhum", "uhhum", "um"]);

/** Normalisation aligned with Intron's own published benchmarking pipeline
 *  (intron-innovation/Intron-Multimodal-Benchmarking, scripts/evaluations.py):
 *  strip inaudible tags, drop filler words, lowercase, remove punctuation,
 *  collapse whitespace.
 *
 *  Verified against this corpus before adopting: the four AfriSwitchCare
 *  references contain no inaudible tags and 2 filler words in 2,391, so the
 *  cleaning is very nearly a no-op here and the published figures did not move.
 *  It is applied anyway so the method matches theirs rather than merely
 *  resembling it. */
export function normalize(text: string): string {
  const stripped = text
    .replace(INAUDIBLE, " ")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!stripped) return "";
  return stripped.split(" ").filter((w) => !FILLERS.has(w)).join(" ");
}

/** Unnormalised tokens: whitespace split only, case and punctuation intact.
 *  Intron publish transcription_wer.csv and transcription_unnormalized_wer.csv
 *  side by side, and we report both cuts for the same reason: normalisation is
 *  a choice, and a reader should be able to see how much of a result depends
 *  on it. */
export function wordsUnnormalized(text: string): string[] {
  const t = text.replace(INAUDIBLE, " ").replace(/\s+/g, " ").trim();
  return t ? t.split(" ") : [];
}

export function words(text: string): string[] {
  const n = normalize(text);
  return n ? n.split(" ") : [];
}

/** Normalised tokens with tone marks and under-dots removed ("Èmi ò rí"
 *  becomes "emi o ri"). AfriSwitch references write Yoruba and Igbo in
 *  everyday untoned spelling, so a model that writes the standard orthography
 *  is otherwise scored as wrong on words it heard correctly. Reported beside
 *  the strict WER, never instead of it. */
export function wordsToneless(text: string): string[] {
  const n = normalize(text.normalize("NFD").replace(/\p{M}/gu, ""));
  return n ? n.split(" ") : [];
}

export type Op = "correct" | "substitution" | "deletion" | "insertion";

export type Alignment = {
  ops: Op[];
  /** For each reference word index, what happened to it. */
  refOps: Exclude<Op, "insertion">[];
  correct: number;
  substitutions: number;
  deletions: number;
  insertions: number;
  refLength: number;
  hypLength: number;
};

/** Standard Levenshtein alignment over words, with backtrace. Deletion means a
 *  reference word the model never produced; insertion means a hypothesis word
 *  with nothing behind it in the reference. */
export function align(reference: string, hypothesis: string, tokenize: (t: string) => string[] = words): Alignment {
  const ref = tokenize(reference);
  const hyp = tokenize(hypothesis);
  const R = ref.length;
  const H = hyp.length;

  const d: Uint32Array = new Uint32Array((R + 1) * (H + 1));
  const at = (i: number, j: number) => i * (H + 1) + j;
  for (let i = 0; i <= R; i++) d[at(i, 0)] = i;
  for (let j = 0; j <= H; j++) d[at(0, j)] = j;

  for (let i = 1; i <= R; i++) {
    for (let j = 1; j <= H; j++) {
      const cost = ref[i - 1] === hyp[j - 1] ? 0 : 1;
      d[at(i, j)] = Math.min(
        d[at(i - 1, j)] + 1,
        d[at(i, j - 1)] + 1,
        d[at(i - 1, j - 1)] + cost,
      );
    }
  }

  const ops: Op[] = [];
  const refOps: Exclude<Op, "insertion">[] = new Array(R);
  let i = R;
  let j = H;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0) {
      const cost = ref[i - 1] === hyp[j - 1] ? 0 : 1;
      if (d[at(i, j)] === d[at(i - 1, j - 1)] + cost) {
        const op: Op = cost === 0 ? "correct" : "substitution";
        ops.push(op);
        refOps[i - 1] = op;
        i--;
        j--;
        continue;
      }
    }
    if (i > 0 && d[at(i, j)] === d[at(i - 1, j)] + 1) {
      ops.push("deletion");
      refOps[i - 1] = "deletion";
      i--;
      continue;
    }
    ops.push("insertion");
    j--;
  }
  ops.reverse();

  let correct = 0;
  let substitutions = 0;
  let deletions = 0;
  let insertions = 0;
  for (const op of ops) {
    if (op === "correct") correct++;
    else if (op === "substitution") substitutions++;
    else if (op === "deletion") deletions++;
    else insertions++;
  }

  return { ops, refOps, correct, substitutions, deletions, insertions, refLength: R, hypLength: H };
}

/** Substitutions + deletions + insertions, over reference length. */
export function wer(a: Alignment): number {
  if (a.refLength === 0) return a.hypLength === 0 ? 0 : 1;
  return (a.substitutions + a.deletions + a.insertions) / a.refLength;
}

/** The share of reference words the model got right. Reported alongside WER
 *  because WER can exceed 1 (insertions are unbounded) and a number above 100%
 *  error reads as nonsense to anyone who is not an ASR person. */
export function accuracy(a: Alignment): number {
  if (a.refLength === 0) return 1;
  return a.correct / a.refLength;
}

/** TRANSCRIPT LOSS: reference words the model simply never produced, as a share
 *  of the reference. This is the deletion rate, separated out from WER because
 *  it is a different failure with different consequences: a substituted word is
 *  wrong and visible, a deleted one is silently absent. For a worker being read
 *  their own job description, silence is worse than a mistake they can query. */
export function transcriptLoss(a: Alignment): number {
  if (a.refLength === 0) return 0;
  return a.deletions / a.refLength;
}

export type SegmentLoss = {
  total: number;
  lost: number;
  rate: number;
  lostSegments: string[];
};

/** SEGMENT LOSS: whole utterances that did not survive at all.
 *
 *  The reference is split on sentence boundaries, and each segment is scored by
 *  how many of its words the alignment marked correct. A segment whose recall
 *  falls below `threshold` is counted lost: the model did not merely garble it,
 *  it dropped it. Derived from the same single alignment as every other metric,
 *  so a model cannot look better here by being scored differently. */
export function segmentLoss(reference: string, a: Alignment, threshold = 0.2): SegmentLoss {
  const rawSegments = reference
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const lostSegments: string[] = [];
  let cursor = 0;
  let total = 0;

  for (const seg of rawSegments) {
    const len = words(seg).length;
    if (len === 0) continue;
    total++;
    let correct = 0;
    for (let k = cursor; k < cursor + len && k < a.refOps.length; k++) {
      if (a.refOps[k] === "correct") correct++;
    }
    if (correct / len < threshold) lostSegments.push(seg);
    cursor += len;
  }

  return {
    total,
    lost: lostSegments.length,
    rate: total === 0 ? 0 : lostSegments.length / total,
    lostSegments,
  };
}

export type Hallucination = {
  /** Hypothesis words with nothing behind them in the reference, over reference length. */
  insertionRate: number;
  /** Longest run of a repeated n-gram found in the hypothesis. */
  maxRepeat: number;
  /** The repeated phrase itself, when there is one. */
  loopPhrase: string | null;
  /** Share of hypothesis words sitting inside a detected repetition loop. */
  loopedShare: number;
  /** Absolute number of hypothesis words inside a loop. */
  loopedTokens: number;
  /** True when any n-gram repeated `minRepeat`+ times. Includes benign cases. */
  hasLoop: boolean;
  /** True only for a runaway loop: 10+ repeats, or a looped region of 20+
   *  words. Three consecutive "yes"es in a consultation is plausibly real
   *  speech; 136 consecutive "mwenye"s is not. Severity is deliberately based
   *  on the absolute size of the looped region rather than its share of the
   *  output, because a short utterance makes any repeat look proportionally
   *  huge. Counting benign repetition as degenerate would overstate the case
   *  against a model, so the two are reported apart. */
  severe: boolean;
};

/** HALLUCINATION: content the model invented.
 *
 *  Two components, because the failure has two shapes and they are not equally
 *  dangerous. The insertion rate catches invented content generally. The
 *  repetition-loop detector catches the specific degenerate mode where a model
 *  loses the thread on out-of-distribution audio and emits the same phrase
 *  dozens of times; that mode dominates total edit distance and is the reason a
 *  single clip can wreck an average.
 *
 *  A loop is an n-gram (n up to `maxN`) repeated `minRepeat` or more times
 *  consecutively. maxN is 12 because the loops we actually observed repeat a
 *  whole clause ("we can take a photo of your knee" is eight words), not just
 *  a token. */
export function hallucination(a: Alignment, hypothesis: string, minRepeat = 3, maxN = 12): Hallucination {
  const hyp = words(hypothesis);
  const insertionRate = a.refLength === 0 ? (hyp.length > 0 ? 1 : 0) : a.insertions / a.refLength;

  let maxRepeat = 1;
  let loopPhrase: string | null = null;
  let loopedTokens = 0;

  for (let n = 1; n <= maxN; n++) {
    let i = 0;
    while (i + n <= hyp.length) {
      const phrase = hyp.slice(i, i + n).join(" ");
      let repeats = 1;
      let j = i + n;
      while (j + n <= hyp.length && hyp.slice(j, j + n).join(" ") === phrase) {
        repeats++;
        j += n;
      }
      if (repeats >= minRepeat) {
        loopedTokens += repeats * n;
        if (repeats > maxRepeat) {
          maxRepeat = repeats;
          loopPhrase = phrase;
        }
        i = j;
      } else {
        i++;
      }
    }
    if (loopPhrase) break;
  }

  const loopedShare = hyp.length === 0 ? 0 : Math.min(1, loopedTokens / hyp.length);
  return {
    insertionRate,
    maxRepeat,
    loopPhrase,
    loopedShare,
    loopedTokens,
    hasLoop: maxRepeat >= minRepeat,
    severe: maxRepeat >= 10 || loopedTokens >= 20,
  };
}

export type Scored = {
  wer: number;
  accuracy: number;
  transcriptLoss: number;
  segmentLoss: SegmentLoss;
  hallucination: Hallucination;
};

export function scoreAll(reference: string, hypothesis: string): Scored {
  const a = align(reference, hypothesis);
  return {
    wer: wer(a),
    accuracy: accuracy(a),
    transcriptLoss: transcriptLoss(a),
    segmentLoss: segmentLoss(reference, a),
    hallucination: hallucination(a, hypothesis),
  };
}
