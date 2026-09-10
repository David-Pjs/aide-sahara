import { describe, expect, it } from "vitest";
import { align, scoreAll, hallucination, segmentLoss, transcriptLoss, wer, accuracy } from "../../src/metrics";

// These five metrics decide the benchmark section of the submission, so they
// have to be right, and they have to be right in the specific ways the failures
// we actually observed would expose. Each test below is a real failure mode
// from the Sahara / Whisper run, reduced to its smallest form.

describe("alignment", () => {
  it("scores an exact match as perfect", () => {
    const a = align("good afternoon doctor", "good afternoon doctor");
    expect(a.correct).toBe(3);
    expect(a.substitutions).toBe(0);
    expect(a.deletions).toBe(0);
    expect(a.insertions).toBe(0);
    expect(wer(a)).toBe(0);
    expect(accuracy(a)).toBe(1);
  });

  it("ignores case and punctuation, the way the harness does", () => {
    const a = align("Good afternoon, doctor.", "good afternoon doctor");
    expect(wer(a)).toBe(0);
  });

  it("counts a wrong word as a substitution, not a loss", () => {
    const a = align("i have a headache", "i have a backache");
    expect(a.substitutions).toBe(1);
    expect(a.deletions).toBe(0);
    expect(transcriptLoss(a)).toBe(0);
  });
});

describe("transcript loss", () => {
  it("measures reference words that never appeared", () => {
    // Four reference words, two produced.
    const a = align("please take this medicine", "please take");
    expect(a.deletions).toBe(2);
    expect(transcriptLoss(a)).toBeCloseTo(0.5, 5);
  });

  it("is zero when nothing was dropped", () => {
    const a = align("please take this", "please take this");
    expect(transcriptLoss(a)).toBe(0);
  });

  it("separates dropped words from wrong words", () => {
    // "medicine" wrong, "now" missing: one substitution, one deletion.
    const a = align("take medicine now", "take tablets");
    expect(transcriptLoss(a)).toBeCloseTo(1 / 3, 5);
  });
});

describe("segment loss", () => {
  it("counts whole sentences the model dropped", () => {
    const reference = "Good afternoon. How are you feeling today. I have chest pain.";
    // Middle sentence entirely absent.
    const hypothesis = "Good afternoon. I have chest pain.";
    const a = align(reference, hypothesis);
    const s = segmentLoss(reference, a);
    expect(s.total).toBe(3);
    expect(s.lost).toBe(1);
    expect(s.lostSegments[0]).toContain("How are you feeling");
  });

  it("does not count a merely garbled sentence as lost", () => {
    const reference = "Good afternoon. How are you feeling today.";
    const hypothesis = "Good afternoon. How are you feeling now.";
    const s = segmentLoss(reference, align(reference, hypothesis));
    expect(s.lost).toBe(0);
  });

  it("reports a rate over the number of segments", () => {
    const reference = "One two three. Four five six.";
    const hypothesis = "One two three.";
    const s = segmentLoss(reference, align(reference, hypothesis));
    expect(s.rate).toBeCloseTo(0.5, 5);
  });
});

describe("hallucination", () => {
  it("catches the repetition loop that wrecked Whisper's averages", () => {
    // The real failure: ~40 consecutive repeats of one phrase.
    const hypothesis = "the patient said " + "mwenye ".repeat(40).trim();
    const h = hallucination(align("the patient said she is tired", hypothesis), hypothesis);
    expect(h.hasLoop).toBe(true);
    expect(h.maxRepeat).toBeGreaterThanOrEqual(30);
    expect(h.loopPhrase).toBe("mwenye");
    expect(h.loopedShare).toBeGreaterThan(0.8);
    expect(h.severe).toBe(true);
  });

  it("does not call ordinary conversational repetition a runaway loop", () => {
    // Three "yes"es in a consultation is plausibly real speech. It is a loop by
    // the raw definition, but must not be counted against a model as one.
    const hypothesis = "yes yes yes the pain is here";
    const h = hallucination(align("yes yes yes the pain is there", hypothesis), hypothesis);
    expect(h.hasLoop).toBe(true);
    expect(h.severe).toBe(false);
  });

  it("detects a repeated multi-word phrase, not just a repeated word", () => {
    const hypothesis = "ok " + "we can take a photo of your knee ".repeat(5).trim();
    const h = hallucination(align("ok let me see your knee", hypothesis), hypothesis);
    expect(h.hasLoop).toBe(true);
    expect(h.loopPhrase).toContain("photo");
  });

  it("does not flag ordinary repeated words as a loop", () => {
    const reference = "yes yes that is right";
    const hypothesis = "yes yes that is right";
    const h = hallucination(align(reference, hypothesis), hypothesis);
    expect(h.hasLoop).toBe(false);
    expect(h.insertionRate).toBe(0);
  });

  it("measures invented content as an insertion rate", () => {
    const reference = "good afternoon";
    const hypothesis = "good afternoon what is your name my name is Ruslan";
    const h = hallucination(align(reference, hypothesis), hypothesis);
    expect(h.insertionRate).toBeGreaterThan(1);
    expect(h.hasLoop).toBe(false);
  });
});

describe("scoreAll", () => {
  it("gives a clean transcript a clean sheet on every metric", () => {
    const text = "Good afternoon. How can I help you today.";
    const s = scoreAll(text, text);
    expect(s.wer).toBe(0);
    expect(s.accuracy).toBe(1);
    expect(s.transcriptLoss).toBe(0);
    expect(s.segmentLoss.lost).toBe(0);
    expect(s.hallucination.hasLoop).toBe(false);
    expect(s.hallucination.insertionRate).toBe(0);
  });

  it("shows why WER alone is not enough", () => {
    // Same WER-ish damage, very different failures: one drops content, the
    // other invents it. Transcript loss and hallucination tell them apart.
    const reference = "take one tablet every morning";
    const dropped = scoreAll(reference, "take one tablet");
    const invented = scoreAll(reference, "take one tablet every morning and also stop your other medication");

    expect(dropped.transcriptLoss).toBeGreaterThan(0);
    expect(dropped.hallucination.insertionRate).toBe(0);

    expect(invented.transcriptLoss).toBe(0);
    expect(invented.hallucination.insertionRate).toBeGreaterThan(0);
  });
});
