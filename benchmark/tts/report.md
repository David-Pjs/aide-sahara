# TTS benchmark: Sahara TTS vs edge-tts vs gTTS

Aide's entire output is speech, so its text-to-speech is benchmarked on the same footing as its recognition.

## Method

Round-trip intelligibility. Each system speaks the same code-switched sentence, one fixed recogniser (`openai/whisper-large-v3`) transcribes every rendering, and the transcript is scored against the original text with the same five metrics as the ASR benchmark (`src/metrics.ts`). A line a listener cannot make out is a line the recogniser cannot either, so a higher round-trip WER means a less intelligible rendering.

The judge is held constant deliberately. Whisper large-v3 is not the strongest model in our ASR benchmark, but every system is scored by the same recogniser, so the comparison between systems is fair even where the absolute numbers are not the last word.

The four sentences are real reference transcripts from Intron AfriSwitchCare, not text written for this test, so each one is genuine code-switched speech.

## Results

| System | Config | Round-trip WER | Accuracy | Transcript loss | Insertion rate | Synthesis latency |
|---|---|---|---|---|---|---|
| Sahara TTS | per language | 59.8% | 40.2% | 25.8% | 0.0% | 10242ms |
| edge-tts (Microsoft) | en-NG-EzinneNeural | 58.8% | 41.2% | 17.6% | 0.0% | 2986ms |
| gTTS (Google) | per language | 62.3% | 37.7% | 22.2% | 0.0% | 1505ms |

## Per sentence

**pidgin** (Nigerian Pidgin-English)

> No everything has reduced lately Okay but when no be say you dey vomit?

| System | Round-trip WER | What the recogniser heard |
|---|---|---|
| Sahara TTS | 7.1% |  No everything as reduced lately o'kay, but when no be say you dey vomit. |
| edge-tts (Microsoft) | 7.1% |  No everything has reduced lately ok but when no be say you dey vomit. |
| gTTS (Google) | 21.4% |  No, everything has reduced lately, okay, but when nobis say you day vomit. |

**yoruba** (Yoruba-English)

> Orókún mi ni o orókún mi méjèèjì bayii ó má ń ro mí, my knees.

| System | Round-trip WER | What the recogniser heard |
|---|---|---|
| Sahara TTS | 86.7% |  Oroko me mejeji, Bayomaru me my knees. |
| edge-tts (Microsoft) | 73.3% |  Orokan mi ena o Orokan mi mi Jiji bayi omo ena omi, my niece. |
| gTTS (Google) | 73.3% |  Orokunmi ni o Orokunmi mejeji ba i o mo enro im, my knees. |

**igbo** (Igbo-English)

> A chọọ m, a chọọ m ilere ahụ gị now, ok?

| System | Round-trip WER | What the recogniser heard |
|---|---|---|
| Sahara TTS | 90.9% |  A chua mi lewe a huk gena okey. |
| edge-tts (Microsoft) | 90.9% |  H.U.M., H.U.M. Ilaria Ohuji Inao, OK. |
| gTTS (Google) | 81.8% |  H-U-M. H-U-M ilere ahugi nau. OK. |

**hausa** (Hausa-English)

> Babu angaya Maka da wai kana da diabetes ko A'a okay akwai Wani a cikin family ka Wanda suna hypertension ko diabetes?

| System | Round-trip WER | What the recogniser heard |
|---|---|---|
| Sahara TTS | 54.5% |  Babu angaya makadawayi Canada diabetes kua aoke. Akwai, wani a chicken family kawanda suna hypertension kuda diabetes. |
| edge-tts (Microsoft) | 63.6% |  Babu Angaya Moka Dewai Kona de Diabetes K.O.A. Ok Akwae Onea Sikim Family Kowanda Suna Hypertension K.O. Diabetes |
| gTTS (Google) | 72.7% |  Babo angaya makadaweka na ada diabetes kwa aaa oke akwewane atikimu family kawanda suna. Hypertension kwa diabetes. |

## Findings

**Sahara TTS shows no intelligibility advantage over a general-purpose voice on this test.** Round-trip WER is 59.8% against edge-tts's 58.8% and gTTS's 62.3%, a three-way tie inside the noise of a four-sentence sample. Sahara wins Hausa (54.5% against 63.6% and 72.7%) and ties edge-tts on Pidgin (7.1% each); it loses Yoruba (86.7% against 73.3%) and ties on Igbo (90.9%).

**Latency is the decisive difference, and it goes the other way.** edge-tts averages 3.0s and gTTS 1.5s. Sahara averages 10.2s once warm, and its first call of a session took 64.3s. Aide speaks in a live conversation with a blind user who has no screen to watch while waiting, so a ten-second pause before every reply is not a tuning problem, it is a broken product. This is why Aide's output path stays on edge-tts and `app/api/tts/sahara/route.ts` exists but is not wired in. That decision is now measured rather than assumed.

**gTTS has no Yoruba and no Igbo voice at all.** Both fall back to English, which is a coverage gap rather than a quality one, and is the clearest single argument in this table for African-language-specific speech infrastructure existing at all.

**No system hallucinated.** Insertion rate is 0.0% across all twelve renderings. Whatever these systems lose, they do not invent.

## An important caveat about the absolute numbers

The judge is not neutral about these languages. In the ASR benchmark in `../report.md`, Whisper large-v3 scores 68.6% average WER on **real human speech** in these same four language pairs, and 76.3% on Yoruba specifically. So a high round-trip WER here conflates two different things: how clearly the TTS rendered the line, and how badly the recogniser handles the language regardless of who is speaking.

That is why the Yoruba and Igbo rows sit near 90% for every system, including the ones that produced perfectly reasonable audio. The comparison **between** systems stays fair, because all three are scored by the same recogniser on the same sentence. The absolute figures should not be read as a claim that these renderings are unintelligible to a person.

## Limitations

- **Four sentences, one per language pair.** Enough to expose a coverage gap and a latency gap, not enough for a confident WER estimate per language.
- **One judge.** A second recogniser would separate TTS quality from judge weakness, which is the main confound above.
- **No human rating.** Naturalness, prosody and accent acceptability to a Nigerian listener are not measured here and cannot be measured this way. That needs human raters.
- **Sahara has no Pidgin accent.** The Pidgin sentence was synthesised with the Yoruba accent, which is the product default, so that row is not a test of a Pidgin voice.
