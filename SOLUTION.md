# Aide: a voice-native agent for blind and low-vision workers

**Category:** Other High-Impact Use Cases (accessibility)
**Live:** [aide-ng.vercel.app](https://aide-ng.vercel.app)
**Benchmark:** [`benchmark/report.md`](benchmark/report.md) (speech recognition) and [`benchmark/tts/report.md`](benchmark/tts/report.md) (speech synthesis)

You talk to Aide. It finds you work, proves your skill through a spoken assessment, gets you hired, and tells you when you have been paid. There is no screen to read, no form to fill, and no code to squint at. It listens in Nigerian Pidgin, Yoruba, Igbo and Hausa mixed into English, the way people actually speak, because the alternative is a recogniser that invents words a blind user cannot catch.

## Why we built this

I am an albino. I have low vision, and at school I could not see the board. I sat as close to the front as they would let me and still copied most lessons from someone else's notebook. The thing I remember is not the difficulty. It is the question underneath it, which was what this would mean for me later, when the classroom became a workplace and nobody was obliged to help.

That question has an answer, and it is worse than I expected when I went looking for the numbers.

Aide is built by the people it is for. I am the low-vision half of that; Dillon is the engineer alongside me. Not a product designed for a population studied from the outside.

## Who this is for

Blind and low-vision working-age Nigerians who can do the work and are locked out by the interface rather than the task.

That distinction is the whole argument, and it is not ours. It is what the research says:

| | |
|---|---|
| Unemployed among blind and low-vision Nigerians | **more than 86%** |
| Regional studies (Enugu State) | **72% to 95%** |
| University-educated blind and low-vision graduates | roughly **8 times** more likely to be unemployed than sighted peers |
| Formal labour force participation | around **8%**, against 64% for sighted citizens |

The papers reporting these figures do not attribute them to incapacity. They attribute them to **assistive technology gaps, policy failure, and employers assuming blindness means an inability to work**. Sources: Adigun and Mngomezulu, *Exploring the lived experiences of (un)employment among visually impaired persons in Nigeria*, British Journal of Visual Impairment, 2023, reporting the 86% figure from Balarabe et al. 2014 and Eneh 2011; and the Enugu State assistive-technology study in the African Journal of Social and Behavioural Sciences.

An 8-times graduate disadvantage is not a skills problem. It is a **tooling** problem, and tooling is something you can build.

On population size, which the challenge asks about directly: the **Nigeria National Blindness and Visual Impairment Survey**, the largest eye survey conducted in Nigeria (15,375 participants aged 40 and over), found blindness prevalence of **4.2%** (95% CI 3.8 to 4.6) on presenting visual acuity plus a further **1.5%** severely visually impaired. Extrapolated nationally that is roughly **1.13 million blind** and about **4.25 million blind or visually impaired** Nigerian adults aged 40 and over, with **84% of the blindness avoidable**, meaning most of these people lost their sight to something treatable and were earning before they did.

Two honest notes on that figure. It measures adults 40 and over, so it is a floor for a working-age product rather than a precise count of our users. And it counts Nigeria alone, while Sahara covers 12+ language pairs across the continent, so the addressable population is larger than the number we are willing to claim.

A companion paper from the same survey, *Poverty and Blindness in Nigeria*, establishes the loop this product tries to break: losing your sight in Nigeria costs you your income, and losing your income makes the sight loss harder to treat.

Sources: Kyari F et al., *Prevalence of Blindness and Visual Impairment in Nigeria*, IOVS 2009; Rabiu MM et al., *Review of the publications of the Nigeria national blindness survey*, 2012 ([PMID 22684129](https://pubmed.ncbi.nlm.nih.gov/22684129/)).

## Why voice, and why code-switching specifically

Screen readers exist. They are not the answer here, for two reasons we hit directly.

The first is that a screen reader narrates an interface built for eyes. It reads what is on screen; it cannot restructure a flow that assumes you can scan a page, compare two rows, or read a code before it expires. It is a translation layer over a fundamentally visual product.

The second is the one this challenge is about. **A blind Nigerian worker does not speak clean English.** They speak Pidgin, Yoruba, Igbo or Hausa mixed into English inside a single sentence, and every general-purpose recogniser fails at exactly the switch point. Our benchmark shows it fails in the worst available way: it does not fall silent, it invents fluent text. Whisper large-v3 repeated one nonsense word **136 times** on a Nigerian Pidgin consultation, filling 22.4% of its transcript with content nobody said.

For a sighted user that is a bad transcript they can see and correct. For a blind user driving an agent by voice, it is an agent acting on words that were never spoken. That is why speech quality here is a safety property, not a feature.
## The solution

Aide is a voice-native agent. The conversation is the product; the screen is an optional mirror for people who can use it.

It carries a job end to end, including the part most accessible tools stop short of. Getting paid is where an inaccessible interface stops being an inconvenience and starts being the reason the work was not worth taking, so Aide does that part too. The payments integration is evidence that this is a real product rather than a demo, not the pitch.

A worker asks Aide to find transcription jobs over a certain amount. Aide filters the board and reads the matches back, applies on their word, runs a spoken skill assessment, and when the employer pays, announces the money the moment it clears. Withdrawal is confirmed by a spoken security phrase rather than a code read off a screen.

### It is an agent, not a voice front end

This distinction matters, and it is easy to fake. Aide exposes **34 tools** to the model (`lib/agent/tools.ts`) and runs a genuine multi-step tool loop with `maxSteps: 6`. The model decides what to call and in what order; there is no scripted flow underneath.

The tool surface covers the whole workflow, not just search:

| Area | Tools |
|---|---|
| Navigation | `open_page`, `filter_jobs` |
| Identity | `create_account`, `switch_account`, `log_out`, `update_profile` |
| Finding work | `list_jobs`, `apply_to_job`, `get_applications`, `withdraw_application`, `scan_external_jobs`, `track_external_job` |
| Assessment | `start_assessment`, `submit_assessment`, `assessment_time_left`, `cancel_assessment` |
| Hiring (employer side) | `post_gig`, `review_applicants`, `hire_worker`, `reject_worker`, `mark_gig_paid`, `delete_gig` |
| Messaging | `read_messages`, `send_message`, `delete_message` |
| Money | `get_balance`, `register_payout_account`, `set_security_phrase`, `list_beneficiaries`, `save_beneficiary`, `prepare_withdrawal`, `confirm_withdrawal` |

A real turn chains several of these. *"Find me transcription jobs paying over twelve thousand and apply me to the first one"* runs `filter_jobs`, then `apply_to_job`, then `start_assessment` when the gig requires one, and moves the screen as it goes so the words and the display never disagree.

The agent also drives navigation **mid-reply rather than after it**. Waiting until the stream finished made Aide announce a page it had not moved to yet, which a user who cannot see the screen has no way to catch.

### Speaking the language people actually speak

Sahara v2.5 replaces the browser's English-only recogniser. `app/aide/sahara-recognizer.ts` implements the same interface `voice-engine.ts` already spoke to, so the echo defence, idle timers and restart backoff needed no changes at all. Because Sahara returns a transcript only for a complete utterance, the recogniser supplies its own voice activity detection using RMS over a Web Audio `AnalyserNode` in place of the interim events the browser API provides.

Sahara has no auto-detect: every request must declare a language or code-switch pair. Firing the same audio at several hints in parallel would slow every turn, so Aide asks once on first visit, remembers the answer in `localStorage`, and accepts *"Yoruba"*, *"Igbo"* or *"Hausa"* as a spoken command at any point in a conversation.

Supported pairs: English with Nigerian Pidgin, Yoruba, Igbo, Hausa or Swahili, plus English only.

### Accessibility beyond the voice loop

For the people who do use the screen, and for the low-vision users who are not blind:

- **Atkinson Hyperlegible** (Braille Institute, designed for low-vision readers), loaded via `next/font/google` in `app/layout.tsx`
- **18px base font size** (`html { font-size: 112.5% }` in `app/globals.css`)
- No status is ever signalled by colour alone
- **Interruptible**: the microphone stays open while Aide speaks, so a user never pays the tax of waiting for a machine to finish a paragraph
- **Onboarding survives the handoff**: getting hired usually returns you to email and chat. Here the first task and the login details arrive in the same voice channel and are read aloud on arrival

## Key technical decisions

**Unknown is not zero.** When the bank is unreachable, the balance comes back `null` and renders as a dash, never as a number. Zero is a fact about someone's money; not knowing is not. A worker told "zero" believes they were not paid and has nothing to check it against.

**Aide never speaks raw runtime text.** Errors are mapped to sentences a listener can act on (`lib/spoken-error.ts`, `spokenProviderError` in `lib/monnify.ts`). Before this, `AbortSignal.timeout`'s DOMException was read aloud verbatim as *"The operation was aborted due to timeout"* to someone with no retry button to look for.

**The money loop is verified server-side before it is spoken.** Webhooks are rejected unless the SHA-512 HMAC signature matches (`lib/monnify.ts:313`), and the payment is then re-fetched from the provider before Aide says a number. The agent is structurally unable to invent a balance.

**Assessments are graded on the server** and the answer key never leaves it. Assessments are deliberately **not proctored**: camera and lockdown proctoring excludes exactly the people this is built for. Integrity comes from accepted work and ratings instead.

**Speech synthesis stays on edge-tts, and that is a measured decision.** Our TTS benchmark found Sahara TTS gives no intelligibility advantage (59.8% round-trip WER against edge-tts's 58.8%) while averaging 10.2s per line against edge-tts's 3.0s, with a 64.3s first call. A ten-second pause before every reply, for a user with no screen to watch while waiting, is a broken product. `app/api/tts/sahara/route.ts` exists and works; it is not wired in, and now we can say why.

**The language model provider is swappable by environment variable.** A dead key or an empty balance should not be able to take the product down (`lib/agent/model.ts`).

## What the benchmark found

Four models from three vendors on four real code-switched clips from Intron's own AfriSwitchCare dataset. Full method, per-clip results and limitations in [`benchmark/report.md`](benchmark/report.md).

| Model | WER | Accuracy | Transcript loss | Segment loss | Insertion rate | Runaway loops |
|---|---|---|---|---|---|---|
| Sahara v2.5 | **46.1%** | **56.5%** | 20.6% | **25.9%** | 2.7% | **0 of 4** |
| OpenAI Whisper large-v3 | 68.6% | 38.1% | 27.2% | 53.0% | 6.7% | 2 of 4 |
| OpenAI Whisper large-v3-turbo | 63.7% | 39.1% | 21.4% | 52.9% | 2.8% | 0 of 4 |
| Qwen3-ASR-1.7B (Alibaba) | 55.6% | 50.2% | **7.0%** | 44.0% | 5.8% | 0 of 4 |

Segment loss separates the models far more sharply than WER does: Whisper drops roughly **half of every reference sentence set outright**. Sahara is the only model whose worst clip stays under 60% WER, against 85.2%, 87.1% and 93.9% for the others. For a product that reads a transcript aloud to someone who cannot check it against the screen, the worst case matters more than the average.

Sahara does not win everything, and the report says so: Qwen wins the Igbo clip outright on every metric, putting Sahara last of four there.

## Honest limitations

- Four clips from one dataset in one domain. Enough to surface reproducible failure patterns, not enough for a confident per-language WER estimate.
- Withdrawal returns `PENDING_AUTHORIZATION` in the payment sandbox, because third-party payouts sit behind full business activation and KYC. We show the real API response rather than a fake success screen.
- The TTS comparison uses one recogniser as judge, and that judge is itself weak on these languages. The comparison between systems is fair; the absolute figures are not a verdict on human intelligibility.
- Sahara offers no Nigerian Pidgin accent for synthesis.
