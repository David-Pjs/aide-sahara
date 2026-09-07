# Benchmark: Sahara vs. 2+ other speech models

The Sahara CodeSwitch Africa Challenge requires benchmarking on code-switched
audio across **at least three speech models**, one of which must be an Intron
Sahara API. This folder does that for Aide.

## 1. Get real code-switched clips

Pull a handful (5–10 is plenty for the submission) of short `.wav` clips from
Intron's own open collection:

https://huggingface.co/collections/intronhealth/code-switching

Use **Intron Afriswitch** (general) or **Intron AfriswitchCare** (medical
domain) — both ship ground-truth transcripts alongside the audio, which is
exactly what `reference` in the manifest needs. Nigerian Pidgin-English,
Yoruba-English, Igbo-English and Hausa-English pairs are the most relevant to
Aide's job-application use case.

Drop each clip into `benchmark/samples/` and add a matching entry to
`benchmark/manifest.json` with the real reference transcript and metadata
(language pair, accent/country, domain, device type, noise condition — the
challenge asks for this metadata alongside any submitted samples).

## 2. Set provider keys

In `.env` at the project root:

```
SAHARA_API_KEY=...       # required
GROQ_API_KEY=...         # required — free tier at console.groq.com
HF_API_TOKEN=...         # required — free at huggingface.co/settings/tokens
```

## 3. Run it

```
npx tsx src/benchmark.ts
```

This writes `benchmark/report.json` (raw data) and `benchmark/report.md`
(the table + transcripts to paste into the submission's benchmark section).

## Notes

- Swap `HF_STT_MODEL` (env var) to point the third comparator at a different
  open-source model — e.g. an Afriswitch-fine-tuned Whisper checkpoint if your
  team has one, instead of the stock `openai/whisper-large-v3` default.
- WER/CER are computed with a standard Levenshtein edit distance over
  normalized (lowercased, punctuation-stripped) words/characters — the same
  metric family Intron uses in its own
  [Intron-Multimodal-Benchmarking](https://github.com/intron-innovation/Intron-Multimodal-Benchmarking)
  repo, so results are described the same way judges are used to seeing them.
