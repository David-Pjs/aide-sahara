import { readFileSync, writeFileSync } from "node:fs";

const langs = [
  { id: "igbo", saharaLanguageHint: "ig", languagePair: "Igbo-English", accentCountry: "Nigeria" },
  { id: "yoruba", saharaLanguageHint: "yo", languagePair: "Yoruba-English", accentCountry: "Nigeria" },
  { id: "hausa", saharaLanguageHint: "ha", languagePair: "Hausa-English", accentCountry: "Nigeria" },
  { id: "pidgin", saharaLanguageHint: "pcm", languagePair: "Nigerian Pidgin-English", accentCountry: "Nigeria" },
];

const manifest = langs.map((l) => {
  const meta = JSON.parse(readFileSync(`benchmark/raw/${l.id}.meta.json`, "utf-8"));
  const reference = readFileSync(`benchmark/raw/${l.id}.txt`, "utf-8").trim();
  return {
    id: `afriswitchcare-${l.id}`,
    audioPath: `${l.id}.wav`,
    reference,
    languagePair: l.languagePair,
    saharaLanguageHint: l.saharaLanguageHint,
    accentCountry: l.accentCountry,
    domain: "clinical-consultation (simulated, no real patient data)",
    deviceType: "studio-recorded, 16kHz mono",
    noiseCondition: "clean",
    source: "Intron AfriSwitchCare (huggingface.co/datasets/intronhealth/AfriSwitchCare)",
    diagnosis: meta.diagnosis,
    durationSeconds: Math.round(meta.durationSeconds),
    numTurns: meta.numTurns,
    codeMixIndex: meta.cmi,
    numSwitchPoints: meta.numSwitchPoints,
  };
});

writeFileSync("benchmark/manifest.json", JSON.stringify(manifest, null, 2));
console.log(`Wrote benchmark/manifest.json with ${manifest.length} real entries.`);
