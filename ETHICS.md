# Ethics, safety and inclusion

Aide handles two things that are dangerous to get wrong: a disabled person's income, and speech in languages that most models handle badly. This note states what we do about both, and where we are still exposed.

## Consent and data provenance

**Benchmark audio.** Every clip used for evaluation comes from [Intron AfriSwitchCare](https://huggingface.co/datasets/intronhealth/AfriSwitchCare), the dataset authors' own published corpus. The consultations are **simulated, with no real patient data**, which the dataset authors disclose explicitly. We recorded nothing ourselves and used no audio from any real user.

The dataset is distributed under **CC BY-NC-SA 4.0** and is used strictly as permitted: non-commercial hackathon benchmarking, content unmodified, with attribution in `benchmark/report.md`, in `benchmark/manifest.json`, and here. The four clips shipped in `benchmark/samples/` are Intron's published data, not ours.

**TTS benchmark sentences** are reference transcripts from those same clips rather than text we wrote, so the synthesis test uses genuine code-switched speech and inherits the same consent basis.

## What Aide does with a user's voice

- **Nothing said to Aide is written to storage.** The conversation lives in React state for as long as the page is open and is gone when it reloads. There is no transcript on disk to leak, subpoena, inspect or restore.
- Audio is sent to the speech provider for the length of one utterance and is not retained by us.
- The only thing that persists is what a user explicitly asks Aide to remember, saved against their account as a stated preference.
- The remembered language choice lives in that browser's `localStorage`. It never reaches our servers.

## Safety around money

The failure mode we treat as unacceptable is Aide stating something confident and wrong about a person's money, because a blind user cannot glance at the screen to check it.

- **Aide cannot invent a balance.** Payments are verified server-side against the provider before any number is spoken, and webhooks are rejected unless the SHA-512 HMAC signature matches.
- **Unknown is never rendered as zero.** When the bank is unreachable the balance is `null` and reads as a dash. Telling someone they have zero naira when the truth is that we could not check is a different and much worse claim.
- **Never an empty list presented as "no payments."** That reads as *nobody paid you*.
- **Withdrawal is two-step and spoken.** Aide reads back the amount and the bank-verified destination name, then requires a spoken security phrase. Phrases and passwords are hashed with salted scrypt and compared in constant time (`lib/auth.ts`).
- **We do not fake success.** Third-party payouts return `PENDING_AUTHORIZATION` in the sandbox and we show that real response.

## Bias, and what our own benchmark says about it

Our benchmark is, incidentally, a bias measurement, and we think it should be read that way.

Two general-purpose models trained overwhelmingly on English and other high-resource languages lose roughly **half of every sentence** in Nigerian-language conversations (52.9% and 53.0% segment loss) and produce **runaway hallucination loops** on 2 of 4 clips, once repeating a single nonsense token 136 times. A third, Qwen3-ASR, collapses entirely on Hausa at 96.2% WER, rendering it as Swahili-like text.

None of these are obscure systems. They are among the most widely deployed speech models in the world. If a Nigerian speaking Hausa is transcribed as a Swahili speaker by default, that is a distributional bias with direct consequences for anyone building on top of it.

**A hallucinating recogniser is an accessibility hazard specifically.** A sighted user reads a garbled transcript and notices. A blind user driving an agent by voice has an agent acting on invented words. This is why our report weights hallucination and segment loss alongside WER rather than reporting WER alone, and why a model that stays silent when unsure is preferable to one that stays fluent.

We also report Sahara's own weaknesses: it loses the Igbo clip to all three competitors, and has a 4.8% insertion rate on Pidgin. A benchmark that only flattered the host's model would not be worth reading.

## Dignity, and one decision it cost us

**Assessments are not proctored.** No camera, no screen lockdown, no eye tracking. Every one of those mechanisms assumes a sighted user in a controlled environment, and deploying them would exclude exactly the people this is built for. We accept that this makes the assessment easier to cheat, and we get integrity from accepted work and employer ratings instead. Excluding blind workers to protect a quiz would be the wrong trade.

Beyond that:

- Aide is **interruptible**. The microphone stays open while it speaks. Forcing someone to wait out a paragraph before they can correct you is a small daily indignity.
- Errors are spoken as sentences a person can act on, never as raw runtime text.
- The screen is designed for the low-vision users who are not blind: Atkinson Hyperlegible at an 18px base, and no status signalled by colour alone.
- Aide reads the amount and the **bank-verified account name** back before moving money, so the confirmation is something you can hear rather than something you have to see.

## Where we are still exposed

Stating these plainly is part of the point.

- **Speech data leaves the device.** Audio goes to a third-party API. We do not retain it, but we cannot make a claim about what a provider does with it beyond their own terms. An on-device option would be materially better for privacy and we do not have one.
- **The language preference is a guess about a person.** Asking once and remembering is a latency decision, and it will occasionally be wrong for a multilingual user. It is changeable by voice at any time, which mitigates but does not remove this.
- **Our benchmark is four clips.** It is enough to expose reproducible failure patterns and not enough to make confident per-language claims. We have said so in the report rather than rounding it up.
- **Simulated clinical audio is not our users' audio.** AfriSwitchCare is doctor-patient consultations. Aide's real utterances are short job and payment commands. The failure modes should transfer; the exact numbers may not.
- **No human evaluation.** Whether a Nigerian listener finds a synthesised voice acceptable, or trusts it with money, is not something round-trip WER can answer, and we have not asked them.
