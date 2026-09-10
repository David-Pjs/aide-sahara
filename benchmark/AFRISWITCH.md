# AfriSwitch: staged clips, and what the data turned up

[Intron AfriSwitch](https://huggingface.co/datasets/intronhealth/AfriSwitch) is the closer match to what Aide actually hears. Its clips are short natural utterances from broadcast and conversation, where AfriSwitchCare is six-minute simulated clinical consultations. Access was granted on 10 September 2026, and this set is staged for scoring.

**Status: extracted and verified, not yet scored.** Both the Sahara API credit and the Hugging Face inference credit were exhausted at the time of staging. No result from these clips appears in any table in `report.md` until every model has scored every clip, which the fairness guard in `src/score-report.ts` enforces.

## What is staged

20 clips, 5 per language pair, 4.6 to 15.3 seconds each.

| Language pair | Clips | Total audio | Code-mix index |
|---|---|---|---|
| Hausa-English | 5 | 45.8 s | 6.25 on every clip |
| Igbo-English | 5 | 50.0 s | 50.0 on every clip |
| Nigerian Pidgin-English | 5 | 51.3 s | 50.0 on every clip |
| Yoruba-English | 5 | 39.9 s | 50.0 on every clip |
| **All** | **20** | **187.0 s** | |

All 20 clips together hold about 3 minutes of audio, half the length of the single Igbo AfriSwitchCare conversation already in the benchmark. With limited credit, this set buys more evidence per unit of Sahara credit than extending the long-form set would.

Every reference keeps the dataset's own `transcription_tagged` field, which marks the English spans as `[[EN]]...[[/EN]]`. That makes accuracy on the switched spans measurable separately from accuracy on the whole clip, which is the most direct test of code-switching a benchmark can run.

## Selection

Deterministic, so it can be checked rather than trusted. Implemented in `benchmark/extract_afriswitch.py`:

1. duration between 4 and 20 seconds, using the dataset's own duration field
2. at least 2 switch points, so the clip genuinely switches language
3. at most one clip per source recording, so no single speaker or broadcast dominates a language
4. ranked by code-mix index, highest first, then the first 5 taken

The smallest shard per language was used: Hausa `test-00003`, Igbo `test-00000`, Nigerian Pidgin `test-00003`, Yoruba `test-00002`.

## Finding 1: the Hausa audio carries the wrong sample rate

Every Hausa WAV header declares 16000 Hz. Four of the five staged clips actually contain 48000 Hz audio, and one contains 44100 Hz audio. Played as labelled, the speech runs roughly three times too slow and far too low.

Unrepaired, every model would score badly on Hausa for a reason that has nothing to do with the models, and the Hausa row of any comparison would measure a data defect.

Two independent measurements confirm it before anything was changed:

| Clip | Header length | Dataset length | Words/sec as labelled | Words/sec at dataset length | Voice pitch as labelled | Voice pitch at true rate | True rate |
|---|---|---|---|---|---|---|---|
| hausa-1 | 29.86 s | 9.95 s | 1.07 | 3.22 | 55 Hz | 150 Hz | 48000 Hz |
| hausa-2 | 17.62 s | 5.87 s | 0.91 | 2.72 | 45 Hz | 131 Hz | 48000 Hz |
| hausa-3 | 25.94 s | 9.41 s | 1.23 | 3.40 | 67 Hz | 184 Hz | 44100 Hz |
| hausa-4 | 26.89 s | 8.96 s | 0.60 | 1.79 | 86 Hz | 246 Hz | 48000 Hz |
| hausa-5 | 34.75 s | 11.58 s | 0.92 | 2.76 | 67 Hz | 198 Hz | 48000 Hz |

As labelled, the speakers talk at about one word a second in a voice below the adult range. At the true rate they speak at two to three words a second in an ordinary 130 to 250 Hz voice. The Nigerian Pidgin clips, used as a control, give identical results under both readings, which is what a correctly labelled file should do.

**Repair.** `benchmark/wav_rate.py` infers the true rate from the dataset's own duration field, snaps it to the nearest standard audio rate only when it lands within 3% of one, and resamples by that exact rational ratio to a correct 16000 Hz file. It passes a synthetic self-test: a one-second 200 Hz tone written at 44100 Hz or 48000 Hz and mislabelled as 16000 Hz comes back as exactly 1.000 s at 200 Hz.

**A mistake caught along the way.** The first version assumed the true rate was always a whole multiple and decimated every Hausa clip by 3. That is correct for 48000 Hz and wrong for hausa-3, which came out 9% fast at 3.70 words per second. The speaking-rate check exposed it. The corrected repair is the one committed, and after it all 20 staged clips match the dataset's listed durations to within 0.0%.

## Finding 2: speaker labels inside a reference transcript

One Yoruba reference contained transcriber annotation written as speech: `[Spaeker 1]`, `[Spaeker 2]`, misspelled in the source. Left in, every model is charged for not saying words nobody said. They are removed, by a pattern tolerant of the misspelling, and the manifest records the change against that clip under `referenceCleaning`. This follows the same principle as Intron's own pipeline, which strips inaudible tags before scoring.

## Finding 3: typos in references, left as they are

Two Nigerian Pidgin references contain tokens that look like transcription errors in the dataset: `2econd` and `7thingera`. They are not corrected. There is no way to be confident what was said without listening, a guessed correction would put our judgment inside the ground truth, and an error in the reference costs every model equally, so the comparison between models stays fair.

## Finding 4: the Hausa clips barely code-switch

Every one of the 15 rows in the Hausa shard used here has a code-mix index of 6.25, against 50.0 for every staged Igbo, Nigerian Pidgin and Yoruba clip. They do switch, at least twice each, but lightly. A Hausa result from this set should not be read as a result on dense code-switching. The larger Hausa shards (187 to 259 MB each) may contain more heavily mixed speech; they were not downloaded, because the build machine had under 2 GB of free disk.

## Licensing

AfriSwitch is published by Intron Health under CC BY-NC-SA 4.0. It is used here for non-commercial benchmarking with attribution. The staged clips are Intron's audio, resampled to a correct 16000 Hz where the header was wrong, with no other modification. Each clip's original source filename is recorded in `benchmark/afriswitch_manifest.json`.
