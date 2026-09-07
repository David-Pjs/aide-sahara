import "dotenv/config";
import { readFile } from "node:fs/promises";
import { saharaTranscribe } from "../lib/sahara.js";

const audio = await readFile("scripts/edge-test.mp3");
console.log(`Loaded ${audio.length} bytes, sending to Sahara STT...`);
const blob = new Blob([new Uint8Array(audio)], { type: "audio/mpeg" });
const result = await saharaTranscribe(blob, "edge-test.mp3", { languageAsrInput: "en" });
console.log("Transcript:", JSON.stringify(result.transcript));
console.log("Status:", result.processingStatus, "Duration:", result.durationSeconds);
