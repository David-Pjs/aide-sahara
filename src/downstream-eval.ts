// Downstream task: can an agent still get the facts it needs out of each
// model's transcript?
//
// Aide's recogniser output is never read by a person first; it goes straight
// into a language model that decides what to do. So the downstream question is
// not "how many words match" but "how much of what was said can the agent still
// act on". This measures that as key-fact recall:
//
//   1. deepseek-chat (the model that drives Aide) lists the key facts in the
//      human reference transcript: who, what, how much, when, what is wanted.
//   2. For every speech model, the same LLM is shown only that model's
//      transcript and asked, fact by fact, whether the transcript states it.
//
// Temperature 0, JSON output, results cached in benchmark/downstream.json so
// the published table regenerates without new API calls:
//
//   npx tsx --env-file=.env src/downstream-eval.ts           # run (skips cached)
//   npx tsx src/downstream-eval.ts --report                  # table only

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

type Result = { provider: string; transcript: string; error?: string };
type Item = { entry: { id: string; reference: string; languagePair: string }; results: Result[] };
type Cache = Record<string, { set: string; languagePair: string; facts: string[]; judged: Record<string, boolean[]> }>;

const ROOT = join(process.cwd(), "benchmark");
const CACHE_FILE = join(ROOT, "downstream.json");
const cache: Cache = existsSync(CACHE_FILE) ? JSON.parse(readFileSync(CACHE_FILE, "utf8")) : {};
const save = () => writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2) + "\n", "utf8");

async function ask(system: string, user: string): Promise<unknown> {
  const key = process.env.DEEPSEEK_API_KEY?.trim();
  if (!key) throw new Error("DEEPSEEK_API_KEY is not set");
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      const res = await fetch("https://api.deepseek.com/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "deepseek-chat",
          temperature: 0,
          response_format: { type: "json_object" },
          messages: [{ role: "system", content: system }, { role: "user", content: user }],
        }),
        signal: AbortSignal.timeout(120_000),
      });
      if (res.ok) {
        const body = (await res.json()) as { choices: { message: { content: string } }[] };
        return JSON.parse(body.choices[0].message.content);
      }
      if (attempt === 5) throw new Error(`DeepSeek failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
    } catch (err) {
      // A dropped connection on a home network is not a result; retry it.
      if (attempt === 5) throw err;
    }
    await new Promise((r) => setTimeout(r, 3000 * attempt));
  }
  throw new Error("unreachable");
}

const EXTRACT = `You extract the key facts an assistant would need to act on from a transcript of code-switched Nigerian speech (English mixed with Hausa, Igbo, Yoruba or Nigerian Pidgin).
A key fact is one short, self-contained English statement of something the speaker said: a request, a symptom, an amount, a number, a time, a name, a decision, an answer to a question.
Translate non-English content into English. Do not include greetings, filler or anything not said.
Return JSON: {"facts": ["...", "..."]}. Return at most MAX facts, the most important first.`;

const JUDGE = `You check whether a speech-recognition transcript still conveys given facts. The transcript may be garbled, mix languages, or contain errors.
For each numbered fact, answer true only if the transcript clearly states that fact, in any language or wording. Answer false if the fact is missing, contradicted, or only guessable.
Return JSON: {"supported": [true, false, ...]} with exactly one boolean per fact, in order.`;

async function run() {
  const sets: [string, string, number][] = [
    ["AfriSwitchCare (4 long conversations)", "report.json", 12],
    ["AfriSwitch (20 short clips)", "afriswitch_report.json", 3],
  ];
  for (const [set, file, max] of sets) {
    const items: Item[] = JSON.parse(readFileSync(join(ROOT, file), "utf8"));
    for (const item of items) {
      const id = item.entry.id;
      if (!cache[id]) {
        const out = (await ask(EXTRACT.replace("MAX", String(max)), item.entry.reference)) as { facts: string[] };
        cache[id] = { set, languagePair: item.entry.languagePair, facts: out.facts.slice(0, max), judged: {} };
        save();
      }
      const facts = cache[id].facts;
      for (const r of item.results) {
        if (r.error || cache[id].judged[r.provider]) continue;
        const list = facts.map((f, i) => `${i + 1}. ${f}`).join("\n");
        const out = (await ask(JUDGE, `FACTS:\n${list}\n\nTRANSCRIPT:\n${r.transcript || "(empty)"}`)) as { supported: boolean[] };
        const judged = facts.map((_, i) => out.supported?.[i] === true);
        cache[id].judged[r.provider] = judged;
        save();
        console.log(`${id.padEnd(26)} ${r.provider.padEnd(40)} ${judged.filter(Boolean).length}/${facts.length}`);
      }
    }
  }
}

function report() {
  const pct = (a: number, b: number) => (b ? `${((a / b) * 100).toFixed(1)}%` : "n/a");
  for (const set of [...new Set(Object.values(cache).map((c) => c.set))]) {
    const clips = Object.values(cache).filter((c) => c.set === set);
    const providers = [...new Set(clips.flatMap((c) => Object.keys(c.judged)))];
    const pairs = [...new Set(clips.map((c) => c.languagePair))];
    console.log(`\n### ${set}: key facts recovered`);
    console.log(`| Language pair | Facts | ${providers.join(" | ")} |`);
    console.log(`|---|---|${providers.map(() => "---").join("|")}|`);
    for (const pair of [...pairs, "All"]) {
      const cs = pair === "All" ? clips : clips.filter((c) => c.languagePair === pair);
      const total = cs.reduce((n, c) => n + c.facts.length, 0);
      const cells = providers.map((p) => {
        const kept = cs.reduce((n, c) => n + (c.judged[p]?.filter(Boolean).length ?? 0), 0);
        return `${pct(kept, total)} (${kept}/${total})`;
      });
      console.log(`| ${pair} | ${total} | ${cells.join(" | ")} |`);
    }
  }
}

if (process.argv.includes("--report")) report();
else run().then(report).catch((e) => { console.error(e); process.exit(1); });
