import "dotenv/config";
import { readFile } from "node:fs/promises";
import { saharaTranscribe } from "../lib/sahara.js";

const audio = await readFile(process.argv[2]);
const blob = new Blob([new Uint8Array(audio)], { type: "audio/wav" });
const result = await saharaTranscribe(blob, "check.wav", { languageAsrInput: (process.argv[3] as any) ?? "en" });
console.log("Sahara heard:", JSON.stringify(result.transcript));
