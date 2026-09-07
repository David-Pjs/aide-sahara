import "dotenv/config";
import { writeFile } from "node:fs/promises";
import { saharaSynthesize, saharaTranscribe } from "../lib/sahara.js";

const text = "Hello, this is a test of Sahara text to speech and speech to text.";
console.log("1) Synthesizing with Sahara TTS...");
const { audio, contentType } = await saharaSynthesize(text);
console.log(`   Got ${audio.length} bytes, content-type ${contentType}`);
await writeFile("scripts/sahara-test-output.wav", audio);

console.log("2) Transcribing that audio back with Sahara STT...");
const blob = new Blob([new Uint8Array(audio)], { type: "audio/wav" });
const result = await saharaTranscribe(blob, "roundtrip-test.wav", { languageAsrInput: "en" });
console.log("   Transcript:", JSON.stringify(result.transcript));
console.log("   Status:", result.processingStatus, "Duration:", result.durationSeconds);
