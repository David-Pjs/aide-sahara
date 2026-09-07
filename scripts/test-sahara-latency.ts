import "dotenv/config";
import { readFile } from "node:fs/promises";
import { saharaTranscribe } from "../lib/sahara.js";

const audio = await readFile("scripts/pidgin-test.mp3");
const blob = new Blob([new Uint8Array(audio)], { type: "audio/mpeg" });

for (const disableLlm of [false, true]) {
  const runs: number[] = [];
  let lastTranscript = "";
  for (let i = 0; i < 3; i++) {
    const start = Date.now();
    const result = await saharaTranscribe(blob, "pidgin-test.mp3", {
      languageAsrInput: "pcm",
      disableLlmCorrections: disableLlm,
    });
    runs.push(Date.now() - start);
    lastTranscript = result.transcript;
  }
  console.log(`\ndisableLlmCorrections=${disableLlm}: runs=${runs.join(",")}ms avg=${Math.round(runs.reduce((a, b) => a + b) / runs.length)}ms`);
  console.log(`  transcript: ${JSON.stringify(lastTranscript)}`);
}
