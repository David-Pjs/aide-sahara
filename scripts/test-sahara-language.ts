import "dotenv/config";
import { readFile } from "node:fs/promises";
import { saharaTranscribe } from "../lib/sahara.js";

const audio = await readFile("scripts/pidgin-test.mp3");
const blob = new Blob([new Uint8Array(audio)], { type: "audio/mpeg" });

for (const lang of ["en", "pcm"] as const) {
  console.log(`\n--- use_language_asr_input=${lang} ---`);
  try {
    const result = await saharaTranscribe(blob, "pidgin-test.mp3", { languageAsrInput: lang });
    console.log("Transcript:", JSON.stringify(result.transcript));
  } catch (err) {
    console.log("Error:", (err as Error).message);
  }
}
