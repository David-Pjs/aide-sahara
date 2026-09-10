import { describe, expect, it } from "vitest";
import { extractSentences, streamAgentReply } from "../../app/aide/agent-stream";

// Sentence splitting decides what Aide actually says out loud. A boundary
// missed here is not a cosmetic bug: the sentence either never reaches the
// speaker, or reaches it fused to the next one and gets mispronounced. Both
// have shipped.

const feed = (chunks: string[]) => {
  let unspoken = "";
  const spoken: string[] = [];
  for (const c of chunks) {
    unspoken += c;
    const { sentences, rest } = extractSentences(unspoken);
    unspoken = rest;
    spoken.push(...sentences);
  }
  return { spoken, unspoken };
};

describe("extractSentences", () => {
  it("splits on ordinary sentence punctuation", () => {
    const { spoken } = feed(["Your balance is ready. Say withdraw to move it. "]);
    expect(spoken).toEqual(["Your balance is ready.", "Say withdraw to move it."]);
  });

  it("splits text fused across a tool call, which arrives with no space", () => {
    // The SDK concatenates what the model said before a tool call with what it
    // said after. Left fused, TTS reads the full stop aloud as "dot".
    const { spoken } = feed(["Let me check that for you.I found one job. "]);
    expect(spoken).toEqual(["Let me check that for you.", "I found one job."]);
  });

  it("speaks a finished sentence sitting at the end of the buffer", () => {
    // The opening line is the last thing emitted before a tool runs, so it has
    // no trailing space. It must still be spoken, covering that pause is the
    // only reason it exists. Waiting for the tool to return defeats it.
    const { spoken, unspoken } = feed(["Let me pull those up for you."]);
    expect(spoken).toEqual(["Let me pull those up for you."]);
    expect(unspoken).toBe("");
  });

  it("does not split an initialism", () => {
    const { spoken } = feed(["Call the U.S.A office now. "]);
    expect(spoken).toEqual(["Call the U.S.A office now."]);
  });

  it("does not split a decimal", () => {
    const { spoken } = feed(["I paid 12.5 naira today. "]);
    expect(spoken).toEqual(["I paid 12.5 naira today."]);
  });

  it("does not treat a numbered list marker as a sentence end", () => {
    const { spoken } = feed(["Step 1. Open the app. Step 2. Tap it. "]);
    expect(spoken).toEqual(["Step 1. Open the app.", "Step 2. Tap it."]);
  });

  it("handles a question mark fused to the next sentence", () => {
    const { spoken } = feed(["Is it ready?Yes it is. "]);
    expect(spoken).toEqual(["Is it ready?", "Yes it is."]);
  });

  it("reassembles a sentence arriving one character at a time", () => {
    const text = "Your withdrawal is confirmed. The money is on its way. ";
    const { spoken } = feed(text.split(""));
    expect(spoken).toEqual(["Your withdrawal is confirmed.", "The money is on its way."]);
  });

  // The invariant that matters most: whatever the chunk boundaries, every word
  // the model produced must end up either spoken or still buffered. Nothing may
  // silently vanish, a dropped sentence is invisible to a user who cannot see
  // the transcript.
  it("never loses text, at any chunk size", () => {
    const text =
      "Good morning. You have twelve thousand naira ready.I found three jobs for you. Would you like to hear them?";
    for (const size of [1, 2, 3, 5, 7, 11, 23, 100]) {
      const chunks: string[] = [];
      for (let i = 0; i < text.length; i += size) chunks.push(text.slice(i, i + size));
      const { spoken, unspoken } = feed(chunks);
      // Whitespace may legitimately change, splitting a fused pair inserts a
      // gap the original did not have, but no other character may vanish.
      const roundTrip = (spoken.join("") + unspoken).replace(/\s+/g, "");
      expect(roundTrip, `chunk size ${size}`).toBe(text.replace(/\s+/g, ""));
    }
  });

  it("returns nothing for a buffer with no sentence end yet", () => {
    const { spoken, unspoken } = feed(["I am still speaking and have not"]);
    expect(spoken).toEqual([]);
    expect(unspoken).toBe("I am still speaking and have not");
  });
});

// Navigation is the one claim the system prompt forbids Aide to make without
// doing: "Moving them is an ACTION, never a claim". A blind user told they are
// on the payments page cannot glance up and discover they are not, so a
// dropped navigation is a correctness bug, not a polish one.

function streamOf(events: unknown[]): Response {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      const enc = new TextEncoder();
      for (const e of events) controller.enqueue(enc.encode(JSON.stringify(e) + "\n"));
      controller.close();
    },
  });
  return new Response(body, { status: 200 });
}

async function run(events: unknown[]) {
  const moves: string[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async () => streamOf(events)) as typeof fetch;
  try {
    const result = await streamAgentReply([{ role: "user", content: "go" }], {
      onDelta: () => {},
      onSentence: () => {},
      onNavigate: (to) => moves.push(to),
    });
    // The caller navigates only when the stream did not already do it.
    if (result.navigateTo && !result.navigated) moves.push(result.navigateTo);
    return { result, moves };
  } finally {
    globalThis.fetch = original;
  }
}

describe("streamAgentReply navigation", () => {
  it("moves the screen mid-reply when a tool returns a destination", async () => {
    const { moves } = await run([
      { t: "delta", text: "Opening that now. " },
      { t: "nav", navigateTo: "/payments#balance" },
      { t: "done", navigateTo: "/payments#balance" },
    ]);
    expect(moves).toEqual(["/payments#balance"]);
  });

  it("does not navigate twice to the same destination", async () => {
    const { moves } = await run([
      { t: "delta", text: "Opening the jobs page. " },
      { t: "nav", navigateTo: "/jobs#listings" },
      { t: "nav", navigateTo: "/jobs#listings" },
      { t: "done", navigateTo: "/jobs#listings" },
    ]);
    expect(moves).toEqual(["/jobs#listings"]);
  });

  it("follows a later destination that only arrives in the final event", async () => {
    // The regression. A mid-stream nav used to latch `navigated` true for the
    // whole turn, so this second destination was dropped and the user was left
    // on the jobs page while Aide said the assessment was open.
    const { moves, result } = await run([
      { t: "nav", navigateTo: "/jobs#listings" },
      { t: "delta", text: "Starting your assessment. " },
      { t: "done", navigateTo: "/jobs?assessment=abc" },
    ]);
    expect(moves).toEqual(["/jobs#listings", "/jobs?assessment=abc"]);
    expect(result.navigateTo).toBe("/jobs?assessment=abc");
  });

  it("still navigates when the only destination arrives at the end", async () => {
    const { moves } = await run([
      { t: "delta", text: "Here you go. " },
      { t: "done", navigateTo: "/profile#skills" },
    ]);
    expect(moves).toEqual(["/profile#skills"]);
  });

  it("does not navigate when no tool moved the screen", async () => {
    const { moves } = await run([
      { t: "delta", text: "Your balance is twelve thousand naira. " },
      { t: "done" },
    ]);
    expect(moves).toEqual([]);
  });
});
