## Extended metrics

The challenge asks for hallucination, transcript loss, segment loss, WER and accuracy. All five are derived from one word-level alignment per (reference, transcript) pair by `src/metrics.ts`, so they stay mutually consistent and every model is scored by the same code against the same reference. `npx tsx src/score-report.ts` regenerates this section from `report.json` without calling any speech API.

### Definitions

| Metric | Definition |
|---|---|
| WER | (substitutions + deletions + insertions) / reference words |
| Accuracy | correct reference words / reference words. Reported because WER exceeds 100% once a model inserts more than it gets right, which reads as nonsense on its own |
| Transcript loss | deletions / reference words. Content the model never produced at all, separated from content it got wrong |
| Segment loss | share of reference sentences where under 20% of the words survived. A dropped utterance, not a garbled one |
| Hallucination | insertions / reference words, plus a repetition-loop detector: an n-gram (n up to 12) repeated 3+ times consecutively. A loop counts as *runaway* only at 10+ repeats or a looped region of 20+ words, so genuine conversational repetition is not counted against a model |

### Averages across the four clips

| Model | WER | Accuracy | Transcript loss | Segment loss | Hallucination (insertion rate) | Runaway loops |
|---|---|---|---|---|---|---|
| Sahara v2.5 | 46.3% | 56.4% | 20.4% | 25.9% | 2.7% | 0 of 4 |
| OpenAI Whisper large-v3 | 68.9% | 38.1% | 27.1% | 53.0% | 7.0% | 2 of 4 |
| OpenAI Whisper large-v3-turbo | 63.8% | 39.1% | 21.3% | 52.9% | 2.9% | 0 of 4 |

### Per clip

**afriswitchcare-igbo** (Igbo-English)

| Model | WER | Accuracy | Transcript loss | Segment loss | Insertion rate | Repetition loop |
|---|---|---|---|---|---|---|
| Sahara v2.5 | 50.1% | 50.2% | 28.2% | 51.8% (72/139) | 0.2% | none |
| OpenAI Whisper large-v3 | 41.9% | 60.6% | 17.4% | 48.2% (67/139) | 2.5% | none |
| OpenAI Whisper large-v3-turbo | 39.1% | 64.4% | 16.2% | 49.6% (69/139) | 3.5% | minor: "how" x3 (0.4% of output) |

**afriswitchcare-yoruba** (Yoruba-English)

| Model | WER | Accuracy | Transcript loss | Segment loss | Insertion rate | Repetition loop |
|---|---|---|---|---|---|---|
| Sahara v2.5 | 58.5% | 42.7% | 25.2% | 21.2% (14/66) | 1.2% | none |
| OpenAI Whisper large-v3 | 76.3% | 34.6% | 37.2% | 50.0% (33/66) | 10.9% | runaway: "ținăt" x72 (13.4% of output) |
| OpenAI Whisper large-v3-turbo | 85.2% | 17.2% | 8.5% | 75.8% (50/66) | 2.5% | minor: "no" x3 (0.4% of output) |

**afriswitchcare-hausa** (Hausa-English)

| Model | WER | Accuracy | Transcript loss | Segment loss | Insertion rate | Repetition loop |
|---|---|---|---|---|---|---|
| Sahara v2.5 | 50.8% | 53.8% | 19.7% | 25.0% (2/8) | 4.5% | none |
| OpenAI Whisper large-v3 | 87.1% | 18.2% | 47.0% | 75.0% (6/8) | 5.3% | none |
| OpenAI Whisper large-v3-turbo | 82.6% | 20.5% | 29.5% | 75.0% (6/8) | 3.0% | none |

**afriswitchcare-pidgin** (Nigerian Pidgin-English)

| Model | WER | Accuracy | Transcript loss | Segment loss | Insertion rate | Repetition loop |
|---|---|---|---|---|---|---|
| Sahara v2.5 | 25.7% | 79.1% | 8.5% | 5.6% (1/18) | 4.8% | minor: "yes" x4 (0.7% of output) |
| OpenAI Whisper large-v3 | 70.3% | 39.1% | 6.9% | 38.9% (7/18) | 9.4% | runaway: "mwenye" x136 (22.2% of output) |
| OpenAI Whisper large-v3-turbo | 48.3% | 54.2% | 31.1% | 11.1% (2/18) | 2.6% | minor: "yes" x3 (0.7% of output) |
