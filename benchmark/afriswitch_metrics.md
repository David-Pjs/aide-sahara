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

### Averages across the 20 fully scored clips

| Model | WER | WER (unnormalised) | Accuracy | Transcript loss | Segment loss | Hallucination (insertion rate) | Runaway loops |
|---|---|---|---|---|---|---|---|
| Sahara v2.5 | 54.7% | 60.4% | 52.7% | 14.3% | 18.3% | 7.4% | 0 of 20 |
| OpenAI Whisper large-v3 (Groq) | 77.9% | 89.3% | 27.7% | 16.4% | 41.7% | 5.6% | 0 of 20 |
| OpenAI Whisper large-v3-turbo (Groq) | 79.7% | 89.3% | 28.2% | 21.9% | 38.3% | 7.9% | 0 of 20 |

### By language pair

Each cell is strict WER, then in brackets WER with tone marks and under-dots ignored. The AfriSwitch references spell Yoruba and Igbo without tone marks, so a model writing standard orthography ("Èmi ò rí" for the reference "Emi o ri") loses words it heard correctly under the strict figure. Both are computed for every model by the same code.

| Language pair | Clips | Sahara v2.5 WER (tone marks ignored) | OpenAI Whisper large-v3 (Groq) WER (tone marks ignored) | OpenAI Whisper large-v3-turbo (Groq) WER (tone marks ignored) |
|---|---|---|---|---|
| Hausa-English | 5 | 21.3% (21.3%) | 91.3% (91.3%) | 97.5% (97.5%) |
| Igbo-English | 5 | 52.2% (46.2%) | 69.0% (69.0%) | 72.6% (72.6%) |
| Nigerian Pidgin-English | 5 | 56.2% (56.2%) | 72.5% (72.5%) | 62.2% (62.2%) |
| Yoruba-English | 5 | 89.1% (73.6%) | 78.9% (78.9%) | 86.3% (86.3%) |
| All | 20 | 54.7% (49.3%) | 77.9% (77.9%) | 79.7% (79.7%) |

### Code-switched spans

Share of reference words transcribed correctly, split by the dataset's own [[EN]] tags into the English spans and the rest. Computed on the 19 clips whose tagged reference matches the scored reference word for word (the other 1 had annotation removed from the plain reference, so the labels would not line up).

| Model | English words kept | Nigerian-language words kept |
|---|---|---|
| Sahara v2.5 | 65.0% (91/140) | 56.7% (143/252) |
| OpenAI Whisper large-v3 (Groq) | 57.9% (81/140) | 15.1% (38/252) |
| OpenAI Whisper large-v3-turbo (Groq) | 60.7% (85/140) | 13.1% (33/252) |

### Per clip

**afriswitch-hausa-1** (Hausa-English)

| Model | WER | Accuracy | Transcript loss | Segment loss | Insertion rate | Repetition loop |
|---|---|---|---|---|---|---|
| Sahara v2.5 | 34.4% | 65.6% | 12.5% | 0.0% (0/1) | 0.0% | none |
| OpenAI Whisper large-v3 (Groq) | 90.6% | 9.4% | 21.9% | 100.0% (1/1) | 0.0% | none |
| OpenAI Whisper large-v3-turbo (Groq) | 96.9% | 3.1% | 18.8% | 100.0% (1/1) | 0.0% | none |

**afriswitch-hausa-2** (Hausa-English)

| Model | WER | Accuracy | Transcript loss | Segment loss | Insertion rate | Repetition loop |
|---|---|---|---|---|---|---|
| Sahara v2.5 | 37.5% | 68.8% | 12.5% | 0.0% (0/1) | 6.3% | none |
| OpenAI Whisper large-v3 (Groq) | 93.8% | 6.3% | 25.0% | 100.0% (1/1) | 0.0% | none |
| OpenAI Whisper large-v3-turbo (Groq) | 100.0% | 0.0% | 37.5% | 100.0% (1/1) | 0.0% | none |

**afriswitch-hausa-3** (Hausa-English)

| Model | WER | Accuracy | Transcript loss | Segment loss | Insertion rate | Repetition loop |
|---|---|---|---|---|---|---|
| Sahara v2.5 | 12.5% | 90.6% | 3.1% | 0.0% (0/1) | 3.1% | none |
| OpenAI Whisper large-v3 (Groq) | 87.5% | 12.5% | 21.9% | 100.0% (1/1) | 0.0% | none |
| OpenAI Whisper large-v3-turbo (Groq) | 100.0% | 0.0% | 84.4% | 100.0% (1/1) | 0.0% | none |

**afriswitch-hausa-4** (Hausa-English)

| Model | WER | Accuracy | Transcript loss | Segment loss | Insertion rate | Repetition loop |
|---|---|---|---|---|---|---|
| Sahara v2.5 | 12.5% | 87.5% | 0.0% | 0.0% (0/1) | 0.0% | none |
| OpenAI Whisper large-v3 (Groq) | 93.8% | 6.3% | 25.0% | 100.0% (1/1) | 0.0% | none |
| OpenAI Whisper large-v3-turbo (Groq) | 93.8% | 6.3% | 25.0% | 100.0% (1/1) | 0.0% | none |

**afriswitch-hausa-5** (Hausa-English)

| Model | WER | Accuracy | Transcript loss | Segment loss | Insertion rate | Repetition loop |
|---|---|---|---|---|---|---|
| Sahara v2.5 | 9.4% | 90.6% | 3.1% | 0.0% (0/2) | 0.0% | none |
| OpenAI Whisper large-v3 (Groq) | 90.6% | 9.4% | 3.1% | 100.0% (2/2) | 0.0% | none |
| OpenAI Whisper large-v3-turbo (Groq) | 96.9% | 12.5% | 0.0% | 100.0% (2/2) | 9.4% | none |

**afriswitch-igbo-1** (Igbo-English)

| Model | WER | Accuracy | Transcript loss | Segment loss | Insertion rate | Repetition loop |
|---|---|---|---|---|---|---|
| Sahara v2.5 | 50.0% | 50.0% | 26.9% | 0.0% (0/1) | 0.0% | none |
| OpenAI Whisper large-v3 (Groq) | 61.5% | 42.3% | 38.5% | 0.0% (0/1) | 3.8% | none |
| OpenAI Whisper large-v3-turbo (Groq) | 53.8% | 46.2% | 46.2% | 0.0% (0/1) | 0.0% | none |

**afriswitch-igbo-2** (Igbo-English)

| Model | WER | Accuracy | Transcript loss | Segment loss | Insertion rate | Repetition loop |
|---|---|---|---|---|---|---|
| Sahara v2.5 | 45.8% | 54.2% | 4.2% | 0.0% (0/1) | 0.0% | none |
| OpenAI Whisper large-v3 (Groq) | 58.3% | 41.7% | 20.8% | 0.0% (0/1) | 0.0% | none |
| OpenAI Whisper large-v3-turbo (Groq) | 62.5% | 45.8% | 12.5% | 0.0% (0/1) | 8.3% | none |

**afriswitch-igbo-3** (Igbo-English)

| Model | WER | Accuracy | Transcript loss | Segment loss | Insertion rate | Repetition loop |
|---|---|---|---|---|---|---|
| Sahara v2.5 | 65.0% | 40.0% | 30.0% | 66.7% (2/3) | 5.0% | none |
| OpenAI Whisper large-v3 (Groq) | 50.0% | 50.0% | 35.0% | 33.3% (1/3) | 0.0% | none |
| OpenAI Whisper large-v3-turbo (Groq) | 55.0% | 45.0% | 55.0% | 66.7% (2/3) | 0.0% | none |

**afriswitch-igbo-4** (Igbo-English)

| Model | WER | Accuracy | Transcript loss | Segment loss | Insertion rate | Repetition loop |
|---|---|---|---|---|---|---|
| Sahara v2.5 | 83.3% | 16.7% | 25.0% | 100.0% (1/1) | 0.0% | none |
| OpenAI Whisper large-v3 (Groq) | 100.0% | 0.0% | 16.7% | 100.0% (1/1) | 0.0% | none |
| OpenAI Whisper large-v3-turbo (Groq) | 116.7% | 25.0% | 0.0% | 0.0% (0/1) | 41.7% | none |

**afriswitch-igbo-5** (Igbo-English)

| Model | WER | Accuracy | Transcript loss | Segment loss | Insertion rate | Repetition loop |
|---|---|---|---|---|---|---|
| Sahara v2.5 | 16.7% | 83.3% | 8.3% | 0.0% (0/1) | 0.0% | none |
| OpenAI Whisper large-v3 (Groq) | 75.0% | 25.0% | 0.0% | 0.0% (0/1) | 0.0% | none |
| OpenAI Whisper large-v3-turbo (Groq) | 75.0% | 25.0% | 8.3% | 0.0% (0/1) | 0.0% | none |

**afriswitch-pidgin-1** (Nigerian Pidgin-English)

| Model | WER | Accuracy | Transcript loss | Segment loss | Insertion rate | Repetition loop |
|---|---|---|---|---|---|---|
| Sahara v2.5 | 50.0% | 60.0% | 0.0% | 0.0% (0/1) | 10.0% | none |
| OpenAI Whisper large-v3 (Groq) | 50.0% | 60.0% | 0.0% | 0.0% (0/1) | 10.0% | none |
| OpenAI Whisper large-v3-turbo (Groq) | 60.0% | 50.0% | 0.0% | 0.0% (0/1) | 10.0% | none |

**afriswitch-pidgin-2** (Nigerian Pidgin-English)

| Model | WER | Accuracy | Transcript loss | Segment loss | Insertion rate | Repetition loop |
|---|---|---|---|---|---|---|
| Sahara v2.5 | 67.9% | 64.3% | 3.6% | 0.0% (0/1) | 32.1% | none |
| OpenAI Whisper large-v3 (Groq) | 64.3% | 64.3% | 0.0% | 0.0% (0/1) | 28.6% | none |
| OpenAI Whisper large-v3-turbo (Groq) | 57.1% | 64.3% | 0.0% | 0.0% (0/1) | 21.4% | none |

**afriswitch-pidgin-3** (Nigerian Pidgin-English)

| Model | WER | Accuracy | Transcript loss | Segment loss | Insertion rate | Repetition loop |
|---|---|---|---|---|---|---|
| Sahara v2.5 | 30.0% | 82.5% | 0.0% | 0.0% (0/1) | 12.5% | none |
| OpenAI Whisper large-v3 (Groq) | 47.5% | 70.0% | 0.0% | 0.0% (0/1) | 17.5% | none |
| OpenAI Whisper large-v3-turbo (Groq) | 47.5% | 70.0% | 0.0% | 0.0% (0/1) | 17.5% | none |

**afriswitch-pidgin-4** (Nigerian Pidgin-English)

| Model | WER | Accuracy | Transcript loss | Segment loss | Insertion rate | Repetition loop |
|---|---|---|---|---|---|---|
| Sahara v2.5 | 50.0% | 57.1% | 7.1% | 0.0% (0/1) | 7.1% | none |
| OpenAI Whisper large-v3 (Groq) | 121.4% | 0.0% | 0.0% | 100.0% (1/1) | 21.4% | none |
| OpenAI Whisper large-v3-turbo (Groq) | 71.4% | 57.1% | 0.0% | 0.0% (0/1) | 28.6% | none |

**afriswitch-pidgin-5** (Nigerian Pidgin-English)

| Model | WER | Accuracy | Transcript loss | Segment loss | Insertion rate | Repetition loop |
|---|---|---|---|---|---|---|
| Sahara v2.5 | 83.3% | 45.8% | 0.0% | 0.0% (0/1) | 29.2% | none |
| OpenAI Whisper large-v3 (Groq) | 79.2% | 41.7% | 0.0% | 0.0% (0/1) | 20.8% | none |
| OpenAI Whisper large-v3-turbo (Groq) | 75.0% | 45.8% | 0.0% | 0.0% (0/1) | 20.8% | none |

**afriswitch-yoruba-1** (Yoruba-English)

| Model | WER | Accuracy | Transcript loss | Segment loss | Insertion rate | Repetition loop |
|---|---|---|---|---|---|---|
| Sahara v2.5 | 100.0% | 0.0% | 30.0% | 100.0% (1/1) | 0.0% | none |
| OpenAI Whisper large-v3 (Groq) | 70.0% | 40.0% | 0.0% | 0.0% (0/1) | 10.0% | none |
| OpenAI Whisper large-v3-turbo (Groq) | 80.0% | 20.0% | 50.0% | 0.0% (0/1) | 0.0% | none |

**afriswitch-yoruba-2** (Yoruba-English)

| Model | WER | Accuracy | Transcript loss | Segment loss | Insertion rate | Repetition loop |
|---|---|---|---|---|---|---|
| Sahara v2.5 | 62.9% | 40.0% | 34.3% | 0.0% (0/1) | 2.9% | none |
| OpenAI Whisper large-v3 (Groq) | 74.3% | 25.7% | 40.0% | 0.0% (0/1) | 0.0% | none |
| OpenAI Whisper large-v3-turbo (Groq) | 71.4% | 28.6% | 25.7% | 0.0% (0/1) | 0.0% | none |

**afriswitch-yoruba-3** (Yoruba-English)

| Model | WER | Accuracy | Transcript loss | Segment loss | Insertion rate | Repetition loop |
|---|---|---|---|---|---|---|
| Sahara v2.5 | 90.0% | 30.0% | 0.0% | 0.0% (0/1) | 20.0% | none |
| OpenAI Whisper large-v3 (Groq) | 70.0% | 30.0% | 60.0% | 0.0% (0/1) | 0.0% | none |
| OpenAI Whisper large-v3-turbo (Groq) | 80.0% | 20.0% | 60.0% | 0.0% (0/1) | 0.0% | none |

**afriswitch-yoruba-4** (Yoruba-English)

| Model | WER | Accuracy | Transcript loss | Segment loss | Insertion rate | Repetition loop |
|---|---|---|---|---|---|---|
| Sahara v2.5 | 100.0% | 20.0% | 0.0% | 0.0% (0/1) | 20.0% | none |
| OpenAI Whisper large-v3 (Groq) | 80.0% | 20.0% | 5.0% | 0.0% (0/1) | 0.0% | none |
| OpenAI Whisper large-v3-turbo (Groq) | 100.0% | 0.0% | 0.0% | 100.0% (1/1) | 0.0% | none |

**afriswitch-yoruba-5** (Yoruba-English)

| Model | WER | Accuracy | Transcript loss | Segment loss | Insertion rate | Repetition loop |
|---|---|---|---|---|---|---|
| Sahara v2.5 | 92.9% | 7.1% | 85.7% | 100.0% (1/1) | 0.0% | none |
| OpenAI Whisper large-v3 (Groq) | 100.0% | 0.0% | 14.3% | 100.0% (1/1) | 0.0% | none |
| OpenAI Whisper large-v3-turbo (Groq) | 100.0% | 0.0% | 14.3% | 100.0% (1/1) | 0.0% | none |
