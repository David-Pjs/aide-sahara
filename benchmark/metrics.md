## Extended metrics

The challenge asks for hallucination, transcript loss, segment loss, WER and accuracy. All five are derived from one word-level alignment per (reference, transcript) pair by `src/metrics.ts`, so they stay mutually consistent and every model is scored by the same code against the same reference. `npx tsx src/score-report.ts` regenerates this section from `report.json` without calling any speech API.

### Definitions

| Metric | Definition |
|---|---|
| WER | (substitutions + deletions + insertions) / reference words, over text normalised with Intron's own pipeline: inaudible tags stripped, filler words dropped, lowercased, punctuation removed |
| WER (unnormalised) | the same measure with case and punctuation intact, published alongside the normalised figure exactly as Intron do, so a reader can see how much of a result rests on the normalisation choice |
| Accuracy | correct reference words / reference words. Reported because WER exceeds 100% once a model inserts more than it gets right, which reads as nonsense on its own |
| Transcript loss | deletions / reference words. Content the model never produced at all, separated from content it got wrong |
| Segment loss | share of reference sentences where under 20% of the words survived. A dropped utterance, not a garbled one |
| Hallucination | insertions / reference words, plus a repetition-loop detector: an n-gram (n up to 12) repeated 3+ times consecutively. A loop counts as *runaway* only at 10+ repeats or a looped region of 20+ words, so genuine conversational repetition is not counted against a model |

### Averages across the 4 fully scored clips

> 4 further clip(s) are extracted and in the manifest but not yet scored by every model, so they are excluded here. Averaging a model over clips its competitors were never run on would compare an easy set against a hard one. Pending: afriswitchcare-igbo-2, afriswitchcare-yoruba-2, afriswitchcare-hausa-2, afriswitchcare-pidgin-2.

| Model | WER | WER (unnormalised) | Accuracy | Transcript loss | Segment loss | Hallucination (insertion rate) | Runaway loops |
|---|---|---|---|---|---|---|---|
| Sahara v2.5 | 46.1% | 56.2% | 56.5% | 20.6% | 25.9% | 2.6% | 0 of 4 |
| OpenAI Whisper large-v3 | 68.6% | 77.6% | 38.1% | 27.2% | 53.0% | 6.7% | 2 of 4 |
| OpenAI Whisper large-v3-turbo | 63.7% | 74.2% | 39.1% | 21.4% | 52.9% | 2.8% | 0 of 4 |
| Qwen3-ASR-1.7B (Alibaba) | 55.6% | 72.3% | 50.2% | 7.0% | 44.0% | 5.8% | 0 of 4 |

### Per clip

**afriswitchcare-igbo** (Igbo-English)

| Model | WER | Accuracy | Transcript loss | Segment loss | Insertion rate | Repetition loop |
|---|---|---|---|---|---|---|
| Sahara v2.5 | 50.1% | 50.2% | 28.2% | 51.8% (72/139) | 0.2% | none |
| OpenAI Whisper large-v3 | 41.0% | 60.6% | 17.6% | 48.2% (67/139) | 1.6% | none |
| OpenAI Whisper large-v3-turbo | 38.8% | 64.4% | 16.2% | 49.6% (69/139) | 3.3% | minor: "how" x3 (0.4% of output) |
| Qwen3-ASR-1.7B (Alibaba) | 34.0% | 69.7% | 5.8% | 43.2% (60/139) | 3.7% | minor: "afternoon" x3 (0.7% of output) |

**afriswitchcare-yoruba** (Yoruba-English)

| Model | WER | Accuracy | Transcript loss | Segment loss | Insertion rate | Repetition loop |
|---|---|---|---|---|---|---|
| Sahara v2.5 | 58.5% | 42.7% | 25.2% | 21.2% (14/66) | 1.2% | none |
| OpenAI Whisper large-v3 | 76.3% | 34.6% | 37.2% | 50.0% (33/66) | 10.9% | runaway: "ținăt" x72 (13.4% of output) |
| OpenAI Whisper large-v3-turbo | 85.2% | 17.2% | 8.6% | 75.8% (50/66) | 2.5% | minor: "no" x3 (0.4% of output) |
| Qwen3-ASR-1.7B (Alibaba) | 61.1% | 42.4% | 14.5% | 45.5% (30/66) | 3.6% | none |

**afriswitchcare-hausa** (Hausa-English)

| Model | WER | Accuracy | Transcript loss | Segment loss | Insertion rate | Repetition loop |
|---|---|---|---|---|---|---|
| Sahara v2.5 | 50.0% | 53.8% | 20.5% | 25.0% (2/8) | 3.8% | none |
| OpenAI Whisper large-v3 | 87.1% | 18.2% | 47.0% | 75.0% (6/8) | 5.3% | none |
| OpenAI Whisper large-v3-turbo | 82.6% | 20.5% | 29.5% | 75.0% (6/8) | 3.0% | none |
| Qwen3-ASR-1.7B (Alibaba) | 93.9% | 15.9% | 2.3% | 87.5% (7/8) | 9.8% | none |

**afriswitchcare-pidgin** (Nigerian Pidgin-English)

| Model | WER | Accuracy | Transcript loss | Segment loss | Insertion rate | Repetition loop |
|---|---|---|---|---|---|---|
| Sahara v2.5 | 25.6% | 79.4% | 8.5% | 5.6% (1/18) | 5.0% | minor: "yes" x4 (0.7% of output) |
| OpenAI Whisper large-v3 | 69.9% | 39.2% | 6.9% | 38.9% (7/18) | 9.1% | runaway: "mwenye" x136 (22.4% of output) |
| OpenAI Whisper large-v3-turbo | 48.2% | 54.4% | 31.2% | 11.1% (2/18) | 2.6% | minor: "yes" x3 (0.7% of output) |
| Qwen3-ASR-1.7B (Alibaba) | 33.4% | 72.8% | 5.4% | 0.0% (0/18) | 6.2% | minor: "yes" x4 (1.1% of output) |
