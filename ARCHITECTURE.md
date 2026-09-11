# Architecture

How Aide is put together, and the rules that keep it trustworthy about money. Read this
before extending the app.

## The one hard rule

**The language model never decides a financial fact.** It only narrates what a tool
returned *this turn*. Balances, payment statuses, account names, and transfer results all
come from real Monnify API calls. This is enforced in two places, the system prompt
(`lib/agent/system.ts`) tells the model never to invent a number, and the tools
(`lib/agent/tools.ts`) are the only path to a money value. Keep both in sync when you add
capabilities.

## Request flow

A spoken command travels through the system like this:

```
Browser (app/page.tsx + app/aide/*)
  │  speech → text: record in the browser, POST /api/stt  (app/aide/voice-engine.ts)
  ▼
POST /api/agent   (app/api/agent/route.ts), streams NDJSON back
  │  full message history + system prompt
  ▼
DeepSeek (Vercel AI SDK, streamText, maxSteps: 6)
  │  chooses tools, streams reply text sentence-by-sentence
  ▼
Aide tools (lib/agent/tools.ts)
  │  domain reads/writes go through lib/store/* ; every money fact through…
  ▼
Monnify client (lib/monnify.ts)  ──►  Monnify sandbox API
  │
  ▼
streamed reply → browser speaks each sentence as it lands (edge_tts, app/api/tts)
```

The agent route streams the reply as newline-delimited JSON (`delta` / `done` / `error`),
so the browser starts speaking the first sentence while the rest is still generating
(`app/aide/agent-stream.ts`). The `done` frame carries navigation and account-switch
metadata, since cookies can't be set mid-stream.

## Layers

| Layer | File(s) | Responsibility |
|---|---|---|
| Voice I/O | `app/aide/voice-engine.ts`, `app/aide/sahara-recognizer.ts` | Always-on listening and speaking. Picks the recognizer this browser can run and switches if it fails. |
| Speech recognition | `app/api/stt/route.ts`, `lib/speech/*` | One utterance in, one transcript out. Sahara first, Groq Whisper when Sahara cannot answer; same-origin, size and rate guards. |
| Aide provider | `app/aide/index.tsx` | Global always-listening Aide, mounted in the root layout; follows the user across pages, speaks reactive alerts. |
| Agent client | `app/aide/agent-stream.ts` | Consumes the NDJSON stream; sentence splitter that decides when a chunk is ready to speak. |
| UI | `app/page.tsx`, `app/jobs/*`, `app/payments/*`, `app/profile/*`, `app/employer/*` | Screens the voice flow mirrors. Everything doable by voice is also doable here. |
| Agent endpoint | `app/api/agent/route.ts` | Runs the model with the system prompt + tools; streams reply + emits navigation/account metadata. |
| Agent brain | `lib/agent/system.ts`, `lib/agent/tools.ts` | Persona/rules + the tool surface. |
| Domain store | `lib/store/*` | Accounts, jobs, applications, wallets, events, and post-hire messages, Convex-backed. `state.ts` holds the in-memory seeded demo worker + static seed gigs. |
| Datastore | `convex/*.ts` | The shared, reactive datastore (see below). |
| Payments | `lib/monnify.ts`, `lib/payments.ts` | Auth (cached bearer), reserved accounts, verify, name enquiry, transfer, webhook HMAC, voice-confirmed withdrawals. |
| Speech synth | `app/api/tts/route.ts`, `scripts/tts_worker.py`, `api/speak.py` | Neural Nigerian-English voice via edge_tts (long-lived Python worker locally; a Vercel Python function in production). |
| Config | `lib/env.ts` | Validates required env vars at boot; fails loudly if missing. |
| Proof CLIs | `src/*.ts` | Standalone scripts that proved the Monnify loop; `src/monnify.ts` and `src/env.ts` re-export `lib/`. |

## Why Convex

On Vercel serverless, instances don't share memory, the webhook that records a payment and
the browser's live subscription land on different machines. Convex tables + reactive queries
make cross-instance delivery work by construction: writing a row reaches every subscribed
browser, wherever it's served. This powers three live features:

- **Payment alerts**, `convex/events.ts`. The webhook (or local poller) inserts an event
  row; the browser's `useQuery` speaks it aloud the moment it lands.
- **The apply → hire → pay loop**, `convex/applications.ts`. Both worker and employer see
  the same application state regardless of which instance served them.
- **Post-hire onboarding messages**, `convex/messages.ts`. Once an employer hires an
  applicant, a private channel opens between the two parties (`lib/store/messages.ts`,
  `app/api/messages/route.ts`, the `send_message` / `read_messages` voice tools, and the
  reactive `app/jobs/message-thread.tsx`). Each message is also announced to the other
  party's event feed, so their Aide reads it aloud, the accessible equivalent of a
  notification. The channel is gated: it only opens after hiring.

Our own string ids (`demo-worker`, `u-xxxx`, `aide-<id>`) are kept as plain fields, separate
from Convex's `_id`, so cookies, wallet references, and Monnify customer records keep working.

## Monnify integration notes

- **Auth** is Basic `base64(apiKey:secretKey)` → a bearer token (~1h), cached in
  `lib/monnify.ts` until 60s before expiry.
- **Never trust a webhook payload.** `isValidWebhook` checks the SHA-512 HMAC of the raw
  body, and the handler re-fetches the transaction via `verifyTransaction` before acting.
- **Balance** is computed, not read from a wallet endpoint, it's the sum of confirmed
  `PAID` reserved-account transactions.
- **Withdrawal** is two steps, voice-confirmed (a spoken security phrase for workers, a
  random confirm word for employers), and hits `/disbursements/single`. Sandbox returns
  `PENDING_AUTHORIZATION` because third-party disbursement needs full business KYC.

## Adding a capability

1. Add the underlying call to `lib/monnify.ts` (money) or a `lib/store/*` module (domain).
2. If it must be visible across instances or reactive, back it with a `convex/*.ts` table
   and function, then run `npx convex dev` (or `codegen`) to regenerate `convex/_generated`.
3. Expose it as a tool in `lib/agent/tools.ts` with a clear `description` and Zod params.
4. If it touches money, add a read-back/confirmation rule to `lib/agent/system.ts`.
5. If the UI should reflect it, add or extend a screen, and keep it operable by voice.

## The speech pipeline

```
                      microphone (always open, interruptible)
                               |
                               v
        +----------------------------------------------+
        |  app/aide/sahara-recognizer.ts               |
        |  drop-in for browser SpeechRecognition        |
        |  own VAD: RMS over Web Audio AnalyserNode     |
        +----------------------------------------------+
                               |  complete utterance
                               v
        POST /api/stt  (same-origin, 3 MB cap, 12/min per client)
                               |
                 Sahara v2.5 ASR (Intron)
                               |  no credit, timeout, error?
                               v
                 Groq whisper-large-v3-turbo
                               |  transcript
                               v
        POST /api/agent  ---> model + 34 tools, maxSteps 6
                               |
              +----------------+----------------+
              |                |                |
              v                v                v
          Convex           Monnify         navigation
       (state, jobs,      (accounts,       (screen moves
        messages)          payments)        mid-reply)
              |
              v  sentence by sentence, as the model streams
        GET /api/tts ---> edge-tts ---> speaker
```

Four details in that diagram are load-bearing.

**The recogniser is a drop-in.** `sahara-recognizer.ts` implements the same surface `voice-engine.ts` already spoke to (`onaudiostart`, `onresult`, `onend`, `start()`, `abort()`), so swapping Chrome's English-only recogniser for Sahara required no change to the echo defence, idle timers or restart backoff.

**Recording happens in the browser, recognition on the server.** The built-in Web Speech recogniser only works where the browser can reach its vendor's speech service, which in practice means Google Chrome. Brave, Firefox, Opera and every browser on an iPhone either lack it or fail with a network error. Every one of them can record audio, so Aide records (Opus in WebM on desktop and Android, AAC in MP4 on iPhone, named with the right extension so the provider decodes it) and sends each finished utterance to `/api/stt`.

**Each path is a fallback for the other.** The engine starts on the configured path when the browser can run it. If the built-in recogniser reports `network` or dies instantly three times, it moves to server recognition. If the server fails to transcribe twice in a row with no success between, and the browser has a working built-in recogniser, it moves there. It never moves back to a path that has already failed in that tab, so it cannot oscillate.

**A provider failure costs one attempt, not every utterance.** `lib/speech/providers.ts` tries providers in order inside the same request. A provider that reports no credit or a rejected key is skipped for 10 minutes; a rate limit gets 20 seconds; a timeout (12 seconds) gets no pause. Groq's Whisper output is cleaned of its known silence hallucinations ("Thank you for watching") and runaway repetition loops, with spoken digits exempt so an account number is never shortened.

**Speech is queued per sentence, not per reply.** The agent streams newline-delimited JSON, and each finished sentence is spoken while the rest is still generating. Waiting for the whole reply added seconds of silence to every turn, which a user with no screen cannot distinguish from a dead app.

## Latency

Measured, not estimated.

| Stage | Time |
|---|---|
| Agent first token | ~950ms |
| Agent full turn (stream + tools + snapshot) | ~1.2s |
| Speech synthesis, edge-tts (in production) | ~3.0s per line |
| Speech synthesis, Sahara TTS (benchmarked, not wired in) | ~10.2s warm, 64.3s first call |
| Sahara ASR, multi-minute conversation | ~17.4s |

The TTS row is why `app/api/tts/sahara/route.ts` exists but is not connected. See [`benchmark/tts/report.md`](benchmark/tts/report.md).

Every route that talks to the bank sets `maxDuration = 30`, because provisioning a reserved account and then reading its transactions is several sequential calls and the platform default was short enough to kill the request before our own 8s per-call timeout could report why.

## Security

| Concern | Mechanism | Where |
|---|---|---|
| Webhook forgery | SHA-512 HMAC over the raw body, then the payment is re-fetched from the provider before anything is spoken | `lib/monnify.ts:313` |
| Session forgery | HMAC SHA-256 signed session cookie | `lib/session.ts` |
| Password and security phrase storage | salted scrypt, constant-time comparison | `lib/auth.ts` |
| Identity spoofing | the signed-in user is taken from the session, never from anything the client sends | `lib/session.ts`, `app/api/*` |
| Assessment cheating | graded server-side; the answer key never leaves the server | `lib/grading.ts` |
| Wrong-destination payout | name enquiry against the bank, and the verified account name is read back before the spoken confirmation | `lib/payments.ts` |
| Inventing money | balances are confirmed inbound minus withdrawals; an unverifiable balance is null, never zero | `lib/store/payments.ts` |
| Speech quota abuse | same-origin check, 3 MB upload cap, 12 requests a minute per client; provider error bodies never leave the server | `lib/speech/guard.ts`, `app/api/stt/route.ts` |

Secrets live in the environment and never in the repository. `.env` is gitignored; `.env.example` documents the variable names only.
## Known limits

- Single seeded demo worker; applications belong to that worker.
- The in-memory `state.ts` (demo worker + seed gigs) resets on server restart; Convex data
  persists.
- Outbound payouts are gated behind Monnify business activation (see the sandbox note above).
- Recognition needs a network connection on every path. With no connection Aide says it cannot hear, and typing still works.
- The per-client rate limit is held in memory per server instance, so it limits one visitor, not the whole deployment.
