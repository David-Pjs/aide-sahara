# Aide: work you can hear

**A voice-native agent for blind and low-vision workers in Nigeria, listening through Sahara.**

**Category:** Other High-Impact Use Cases (accessibility)
**Live:** [aide-ng.vercel.app](https://aide-ng.vercel.app). Any browser, phone or laptop. Allow the microphone and talk.
**Team:** David Uhumagho and Dillon Ofili

| Read next | What it holds |
|---|---|
| [`benchmark/report.md`](benchmark/report.md) | 4 models, 3 vendors, 4 long code-switched conversations, every transcript in full |
| [`benchmark/AFRISWITCH.md`](benchmark/AFRISWITCH.md) | 3 models on 20 short clips, scored per language and inside the switch itself |
| [`benchmark/Aide-benchmark-report.pdf`](benchmark/Aide-benchmark-report.pdf) | The 3-page benchmark report: models, data, metrics, per-language WER/CER, downstream task, qualitative findings |
| [`benchmark/tts/report.md`](benchmark/tts/report.md) | Speech synthesis: Sahara TTS against two general voices |
| [`ETHICS.md`](ETHICS.md) | Consent, privacy, bias, dignity, and where we are still exposed |
| [`ARCHITECTURE.md`](ARCHITECTURE.md) | Speech pipeline, measured latency, security mechanisms |

---

Picture a blind worker in Lagos saying: *"Abeg find me transcription work wey pay pass twelve thousand."*

In our tests, general-purpose recognisers kept the English in sentences like that and lost the Nigerian language around it. One wrote Nigerian Pidgin in Bengali script. On a longer Pidgin conversation, Whisper large-v3 wrote the word "mwenye" 136 times in a row. A sighted user sees that and retypes. A blind user has no screen to check, so the agent acts on words nobody said.

Aide listens through Sahara, which in our benchmark kept 57% of the Nigerian-language words inside code-switched sentences, against 13% to 15% for Whisper. Then it does the work: finds the job, applies, runs a spoken skill assessment, gets the worker hired, and tells them when the money has actually arrived.

## 1. Why we built this

I have low vision. At school I could not see the board. I sat as close to the front as they would let me and still copied most lessons from someone else's notebook.

What I remember is not the difficulty. It is the question underneath it, which was how I was going to survive. A classroom has people who are obliged to help you. A workplace has nobody.

I went looking for the answer to that question while building this. It is worse than I expected.

So I am building what I will need. Dillon and I both write the code, but the accessibility decisions in Aide were never researched. They were argued about by the person who has to live with the answer.

## 2. Real-world impact: who this is for

The answer to that question is 86%.

**More than 86% of blind and low-vision Nigerians of working age are unemployed.** Aide is for the people inside that number who can do the work and are locked out by the interface rather than the task. That distinction is the whole argument, and it is not ours to claim. It is what the research says:

| | |
|---|---|
| Unemployed among blind and low-vision Nigerians | **more than 86%** |
| Regional studies (Enugu State) | **72% to 95%** |
| University-educated blind and low-vision graduates | roughly **8 times** more likely to be unemployed than sighted peers |
| Formal labour force participation | around **8%**, against 64% for sighted citizens |

The papers do not attribute these figures to incapacity. They attribute them to **assistive technology gaps, policy failure, and employers assuming blindness means an inability to work**. An 8-times graduate disadvantage is not a skills problem. It is a tooling problem, and tooling is something you can build.

Sources: Adigun and Mngomezulu, *Exploring the lived experiences of (un)employment among visually impaired persons in Nigeria*, British Journal of Visual Impairment, 2023, reporting the 86% figure from Balarabe et al. 2014 and Eneh 2011; and the Enugu State assistive-technology study in the African Journal of Social and Behavioural Sciences.

**How many people.** The Nigeria National Blindness and Visual Impairment Survey (15,375 participants aged 40 and over) found blindness prevalence of **4.2%** (95% CI 3.8 to 4.6) plus a further **1.5%** severely visually impaired. Extrapolated nationally that is roughly **1.13 million blind** and about **4.25 million blind or visually impaired** Nigerian adults aged 40 and over, with **84% of the blindness avoidable**: most of these people lost their sight to something treatable and were earning before they did. A companion paper, *Poverty and Blindness in Nigeria*, describes the loop Aide tries to break: losing your sight costs you your income, and losing your income makes the sight loss harder to treat.

Two honest notes on that figure. It counts adults 40 and over, so it is a floor for a working-age product, not a count of our users. And it counts Nigeria alone.

**Across all ages and the region.** The Global Burden of Disease vision loss analysis for Sub-Saharan Africa estimates that in 2020, **5.08 million people were blind and 20.4 million more had moderate to severe vision impairment**: about **25.5 million people of all ages**, with the highest age-standardised blindness prevalence of any world region (0.99%, nearly double the world average). In Nigeria, the National Commission for Persons with Disabilities plans around a WHO-based estimate of **35.5 million people with disabilities**, a figure the Commission itself treats as an estimate pending better data. And Aide's voice-first design does not stop at sight: any worker who cannot read a screen uses it the same way.

Sources: Vision Loss Expert Group of the Global Burden of Disease Study, *Prevalence of Blindness and Visual Impairment in Sub-Saharan Africa in 2020*, Ophthalmic Epidemiology, 2026 ([PMID 40127261](https://pubmed.ncbi.nlm.nih.gov/40127261/)); National Commission for Persons with Disabilities, as reported by Leadership Newspaper.

Sources: Kyari F et al., *Prevalence of Blindness and Visual Impairment in Nigeria*, IOVS 2009; Rabiu MM et al., *Review of the publications of the Nigeria national blindness survey*, 2012 ([PMID 22684129](https://pubmed.ncbi.nlm.nih.gov/22684129/)).

**Why not a screen reader.** A screen reader narrates an interface built for eyes. It cannot restructure a flow that assumes you can scan a page, compare two rows, or read a code before it expires. And it cannot fix the recogniser underneath: a blind Nigerian worker does not speak clean English, and every general-purpose recogniser we tested fails at the switch point.

**Why code-switching is a safety property here.** When a general model fails on Nigerian speech, it rarely falls silent. It produces fluent, confident text: a translation, a repeated word, another alphabet. For a user driving an agent by voice with no screen to check, that is an agent acting on invented instructions, sometimes about their money.

## 3. The code-switching benchmark

We asked one question: **does Sahara actually hear Nigerian code-switched speech better than the models most developers would reach for, and where does it not?**

### Two datasets, kept apart

| | AfriSwitchCare | AfriSwitch |
|---|---|---|
| What | 4 whole doctor and patient conversations (simulated, no real patients) | 20 short natural utterances from broadcast and conversation |
| Length | 1.5 to 6.3 minutes each | 4.6 to 15.3 seconds each |
| Languages | Igbo, Yoruba, Hausa, Nigerian Pidgin, each mixed with English | The same four, 5 clips each |
| Models | Sahara v2.5, Whisper large-v3, Whisper large-v3-turbo, Qwen3-ASR-1.7B | Sahara v2.5, Whisper large-v3, Whisper large-v3-turbo |
| Why | Long, dense code-switching; stresses hallucination and dropped sentences | The closest match to what a person says to Aide |

Both are Intron's own published datasets, used under CC BY-NC-SA 4.0 with attribution. They are never averaged together: a six-minute consultation and a ten-second utterance are different tasks. Every clip carries language pair, domain, device, noise condition and source file in its manifest.

### Metrics

The five the challenge asks for, all computed from **one word alignment per transcript** (`src/metrics.ts`), so they can never contradict each other:

| Metric | What it catches |
|---|---|
| WER | words wrong, over text normalised with Intron's own published pipeline |
| Accuracy | reference words recovered; stays readable when WER passes 100% |
| Transcript loss | speech the model skipped entirely |
| Segment loss | whole sentences where under 20% of the words survived |
| Hallucination | inserted words, plus a detector for runaway repetition loops |

Added because this set needed them: **unnormalised WER** (published alongside, as Intron do), **tone-insensitive WER** (AfriSwitch references omit Yoruba and Igbo tone marks), **code-switched span recall** (below), and **95% bootstrap intervals** on every average and every gap.

### Result 1: inside the switch

Every AfriSwitch reference tags its English spans with `[[EN]]`. So every reference word is labelled English or Nigerian-language, and we checked which ones each model got right:

| Model | English words kept | Nigerian-language words kept |
|---|---|---|
| **Sahara v2.5** | **65.0%** (91/140) | **56.7%** (143/252) |
| Whisper large-v3 | 57.9% (81/140) | 15.1% (38/252) |
| Whisper large-v3-turbo | 60.7% (85/140) | 13.1% (33/252) |

On English, the three models are within 7 points of each other. On the Hausa, Igbo, Yoruba and Pidgin around it, Whisper keeps about one word in seven and Sahara keeps more than half. **A general model hears the English inside a code-switched sentence and loses the language it switched from.** This is the most direct measurement of code-switching we could build, and it is the reason Aide listens through Sahara.

One weighting to be clear about: Hausa supplies 120 of the 252 Nigerian-language words, and Sahara is strongest on Hausa. Leaving Hausa out entirely, Sahara still keeps 34.8% of the Nigerian-language words against 21.2% and 20.5% for the two Whisper builds.

### Result 2: short utterances

| Model | WER | 95% interval | Accuracy | Segment loss | Runaway loops |
|---|---|---|---|---|---|
| **Sahara v2.5** | **54.7%** | 41.8% to 67.4% | **52.7%** | **18.3%** | 0 of 20 |
| Whisper large-v3 | 77.9% | 69.7% to 86.3% | 27.7% | 41.7% | 0 of 20 |
| Whisper large-v3-turbo | 79.7% | 71.0% to 88.1% | 28.2% | 38.3% | 0 of 20 |

**The lead survives the small sample.** Resampling the per-clip difference on the same clips, Sahara's advantage over Whisper large-v3 has a 95% interval of **7.6 to 39.2** WER points, and over turbo **10.3 to 41.1**. Neither reaches zero. Sahara is better on 13 and 14 of the 20 clips.

| Language pair | Sahara v2.5 | Whisper large-v3 | Whisper large-v3-turbo |
|---|---|---|---|
| Hausa-English | **21.3%** | 91.3% | 97.5% |
| Igbo-English | **52.2%** | 69.0% | 72.6% |
| Nigerian Pidgin-English | **56.2%** | 72.5% | 62.2% |
| Yoruba-English | 89.1% (73.6% tone marks ignored) | **78.9%** | 86.3% |

### Result 3: long conversations

| Model | WER | Accuracy | Transcript loss | Segment loss | Insertion rate | Runaway loops |
|---|---|---|---|---|---|---|
| **Sahara v2.5** | **46.1%** | **56.5%** | 20.6% | **25.9%** | **2.6%** | **0 of 4** |
| Whisper large-v3 | 68.6% | 38.1% | 27.2% | 53.0% | 6.7% | 2 of 4 |
| Whisper large-v3-turbo | 63.7% | 39.1% | 21.4% | 52.9% | 2.8% | 0 of 4 |
| Qwen3-ASR-1.7B (Alibaba) | 55.6% | 50.2% | **7.0%** | 44.0% | 5.8% | 0 of 4 |

Sahara is the only model whose worst conversation stays under 60% WER (58.5%), against 85.2%, 87.1% and 93.9% for the others. For a product that reads a transcript to someone who cannot check it, the worst case matters more than the average.

We are careful about what four clips can prove. Sahara's lead over Whisper large-v3 survives resampling (interval 2.5 to 40.7 points). Its leads over turbo (-1.7 to 30.1) and Qwen (-10.1 to 33.6) do not: Sahara is better on 3 of 4 conversations against each, but four conversations cannot rule out chance. That is why the 20-clip set exists.

### Result 4: the downstream task, what an agent can still act on

Aide's transcript is never read by a person first; it goes straight into the agent. So we measured what the agent can still get out of it. deepseek-chat, the model that drives Aide, lists the key facts in each human reference transcript (requests, symptoms, amounts, names, answers), then judges fact by fact whether each model's transcript still states them. Same judge for every model, temperature 0, cached in `benchmark/downstream.json` (`src/downstream-eval.ts`).

| Key facts recovered | Sahara v2.5 | Whisper large-v3 | Whisper large-v3-turbo | Qwen3-ASR-1.7B |
|---|---|---|---|---|
| Long conversations (48 facts) | **83.3%** | 58.3% | 52.1% | 62.5% |
| Short clips (33 facts) | **63.6%** | 42.4% | 39.4% | not run |

The downstream view sharpens the WER one. On the Igbo conversation, where Sahara has the worst WER of the four models, its transcript still carries the most facts (7 of 12, against 3 to 5). WER weighs every word equally; an agent needs the few words that carry the request. Per-language cells rest on few facts, so they are indicative; the full per-language table is in the benchmark PDF.

### What the averages hide: failures a blind user cannot catch

- **Runaway loops.** Whisper large-v3 wrote "mwenye" 136 times on the Pidgin consultation (22.4% of its output) and a nonsense word 72 times on the Yoruba one. Sahara produced no runaway loop on any of its 24 transcripts.
- **Translation instead of transcription.** For a 32-word Hausa sentence, Whisper large-v3-turbo returned "We have to do this."
- **The wrong alphabet.** 6 of Whisper's 40 short-clip transcripts contain Bengali, Arabic, Cyrillic, Oriya or Gurmukhi characters, though every language in the set is written in Latin script. Sahara: none, checked by Unicode script property across all its output.
- **Invented dialogue.** On the Igbo consultation, Whisper large-v3 has a lower WER than Sahara while inventing a whole exchange ("What is your name? My name is Ruslan Abayisi...") that nobody said. WER barely moves over six minutes, which is why we never report WER alone.
- **Qwen3-ASR on Hausa** reached 93.9% WER, writing Swahili-like words.

### Where Sahara loses

A benchmark that only flattered the host's model would not be worth reading.

- **English-heavy speech.** On the Igbo consultation, mostly clinical English (code-mix index 12.0, the lowest), Sahara is last of four at 50.1% WER. Qwen wins it at 34.0%.
- **Short Yoruba clips.** 89.1% strict WER against Whisper large-v3's 78.9%. Part of that is spelling: the references omit tone marks and Sahara writes them ("Èmi ò rí" for "Emi o ri"). Ignoring tone marks for every model brings Sahara to 73.6%, narrowly ahead. The rest is real: on one clip Sahara returned 2 words for a 14-word reference.
- **Speed.** On short clips Sahara's median latency is 3.97 seconds against 0.61 and 0.43 for Groq-hosted Whisper.
- **Speaking.** Sahara TTS is no more intelligible than Microsoft's free Nigerian English voice (59.8% against 58.8% round-trip WER) and takes 10.2 seconds a line against 3.0. So Aide listens with Sahara and speaks with edge-tts. The benchmark decided that, not preference.

### What we found wrong in the data, and what we did about it

- **Hausa audio at the wrong sample rate.** Every Hausa AfriSwitch file declares 16 kHz. Four hold 48 kHz audio and one holds 44.1 kHz, so as labelled the speech plays about three times too slow. Every model's Hausa score would have measured a broken file. We confirmed it two independent ways (speaking rate against the dataset's own durations, and voice pitch), repaired it with a resampler that passes a synthetic self-test, and caught and fixed a mistake in our own first repair along the way.
- **Speaker labels written as speech** ("[Spaeker 1]") in one Yoruba reference: removed, and recorded against that clip in the manifest.
- **Typos in references** ("7thingera"): left alone. Correcting them would put our guess into the answer key, and a typo costs every model the same words.

### Why the comparison is fair, and how to check it

- Every model heard the same audio and was scored by the same code against the same reference.
- A **fairness guard** in `src/score-report.ts` averages only clips every model scored, so no model gets an easier set.
- On the short clips, Whisper ran raw: no prompt, no language, temperature 0. Aide's live fallback adds a vocabulary prompt; the benchmark does not, because it measures the model, not our help.
- Sahara received the per-clip language hint its API accepts. Whisper has no code for Igbo, Nigerian Pidgin or mixed speech, so no equivalent hint existed for every clip. We disclose this rather than hide it.
- Every number regenerates from the committed transcripts with no API call and no credit:

```bash
npx tsx src/score-report.ts
npx tsx src/score-report.ts --set afriswitch
```

## 4. Product quality and fit

### What a worker can do, entirely by voice

Find work, apply, sit a spoken skill assessment, get hired, message the employer, check a balance, and withdraw money. Employers post gigs, review applicants, hire and pay, also by voice. The screen mirrors every step for anyone who can use it, and nothing on it is required.

### It is an agent, not a voice front end

Aide gives the model **34 tools** (`lib/agent/tools.ts`) and a real multi-step loop (`maxSteps: 6`). There is no scripted flow underneath.

| Area | Tools |
|---|---|
| Navigation | `open_page`, `filter_jobs` |
| Identity | `create_account`, `switch_account`, `log_out`, `update_profile` |
| Finding work | `list_jobs`, `apply_to_job`, `get_applications`, `withdraw_application`, `scan_external_jobs`, `track_external_job` |
| Assessment | `start_assessment`, `submit_assessment`, `assessment_time_left`, `cancel_assessment` |
| Hiring | `post_gig`, `review_applicants`, `hire_worker`, `reject_worker`, `mark_gig_paid`, `delete_gig` |
| Messaging | `read_messages`, `send_message`, `delete_message` |
| Money | `get_balance`, `register_payout_account`, `set_security_phrase`, `list_beneficiaries`, `save_beneficiary`, `prepare_withdrawal`, `confirm_withdrawal` |

*"Find me transcription jobs paying over twelve thousand and apply me to the first one"* runs `filter_jobs`, `apply_to_job`, then `start_assessment` when the gig requires one, and moves the screen as it speaks so the words and the display never disagree.

### Code-switching in the product, not just the report

- **Asked once, changeable by voice.** Sahara has no auto-detect, so on first visit Aide asks: *"Which language do you speak? English, Pidgin, Yoruba, Igbo, or Hausa."* It remembers the answer, and saying "Yoruba", "Igbo" or "Hausa" at any point switches it.
- **Every browser, every phone.** The browser's built-in recogniser only really works in Chrome. Aide records each utterance itself (Opus on Android and desktop, AAC on iPhone) and sends it to `/api/stt`, so the same Sahara path serves Safari, Firefox, Brave and iPhone browsers, not only Chrome. Verified against the live endpoint: a Pidgin utterance came back from Sahara as *"I no wan chop i just wan work"*, round trip about 2.6 seconds warm.
- **A deaf app is the failure we designed against.** If Sahara cannot answer (no credit, a timeout, an outage), the same request falls through to Whisper on Groq. A provider out of credit is skipped for 10 minutes so it costs one attempt, not every utterance. Whisper's known silence hallucinations ("Thank you for watching") and repetition loops are stripped, with spoken digits exempt so an account number is never shortened.
- **Interruptible.** A tap stops Aide mid-sentence. The microphone pauses while Aide talks so it never transcribes its own voice as a command, and nobody has to wait out a paragraph to correct a machine.

### Built for the people who can see a little, too

Atkinson Hyperlegible, the Braille Institute typeface designed for low-vision readers, at an 18px base. No status signalled by colour alone. After hiring, the first task and the login details arrive in the same voice channel and are read aloud on arrival, instead of dropping the worker back into an inbox.

## 5. Technical execution

**Speech pipeline.** A drop-in recogniser (`app/aide/sahara-recognizer.ts`) with its own voice activity detection over a Web Audio `AnalyserNode`, a provider chain with cooldowns (`lib/speech/providers.ts`), and an engine that switches between browser and server recognition when one path fails, and never switches back to a path that already failed in that tab, so it cannot oscillate.

**Replies arrive sentence by sentence.** The agent streams newline-delimited JSON and each finished sentence is spoken while the rest is generating. Waiting for the full reply added seconds of silence that a user with no screen cannot tell apart from a dead app. Measured: first token about 950ms, full agent turn about 1.2s.

**Money the model cannot invent.** Balances, payment statuses and account names come only from payment API calls made this turn. Webhooks are rejected unless the SHA-512 HMAC matches, and the payment is re-fetched before a number is spoken. When the bank is unreachable the balance is `null` and reads as a dash, never zero, because "zero" tells a worker they were not paid. Withdrawal reads back the amount and the bank-verified account name, then requires a spoken security phrase (salted scrypt, constant-time comparison). In the payment sandbox, third-party payouts return `PENDING_AUTHORIZATION` pending business verification, and we show that real response rather than a fake success.

**Guarded speech endpoint.** Same-origin check, 3 MB upload cap, 12 requests a minute per client, and provider error bodies never leave the server.

**Tested.** 445 automated tests across 27 files cover the provider chain and cooldowns, the endpoint's guards, the fallback cleaner, recogniser switching, and every benchmark metric. The model provider is swappable by environment variable, so a dead key cannot take the product down.

## 6. Ethics, safety and inclusion

In short, with the full note in [`ETHICS.md`](ETHICS.md):

- **Nothing said to Aide is stored.** The conversation lives in the open page and is gone on reload. We log which speech provider answered and why one failed, never audio or transcripts.
- **Consented data only.** All benchmark audio is Intron's published datasets, simulated and without real patient data, used within the licence. We recorded nothing from real users.
- **Not proctored, on purpose.** Camera and lockdown proctoring assume a sighted user, so they would exclude the people this is for. Integrity comes from accepted work and employer ratings instead. We accept the trade.
- **Errors are sentences a person can act on**, never raw runtime text read aloud.
- **We name our exposures:** audio leaves the device and may reach two companies when the fallback runs; the fallback hears code-switched speech worse; the language preference is a guess about a person that can be wrong.

## 7. Honest limitations

- **Small samples.** 4 conversations and 20 clips, 5 per language. The intervals above say exactly how far that goes; per-language figures are indicative, not settled.
- **Qwen3-ASR is absent from the short clips** because Hugging Face inference credit ran out. Whisper there ran on Groq, the same open weights on a different host, labelled "(Groq)" in every table.
- **The Hausa short clips barely code-switch** (code-mix index 6.25 against 50.0 for the others), so Sahara's strong Hausa result is not a result on dense switching.
- **Benchmark audio is not our users' audio.** Real users say short job and payment commands into their own phones, wherever they are. The short clips are closer, but not the same.
- **No human evaluation yet.** Whether Nigerian listeners trust a synthesised voice with their money is not something round-trip WER can answer.
- **Payouts are sandboxed.** Inbound payment verification is live against the sandbox; outbound transfers stop at `PENDING_AUTHORIZATION` until business verification is complete.
