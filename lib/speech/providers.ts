// The server half of Aide's hearing. One finished utterance arrives from the
// browser and is transcribed by the first speech provider that can do it.
//
// Why a chain rather than one provider: this runs in a live conversation with
// someone who cannot see an error message. Sahara is the model this product is
// built around and benchmarked on, so it goes first. When its credit runs out,
// or its service stops answering, the utterance falls through to the next
// provider inside the same request, instead of the user hearing nothing.
//
// A provider that failed for a reason that will not fix itself in seconds (no
// credit, a rejected key) is skipped for a while, so every later utterance does
// not pay for a request that is certain to fail. A rate limit gets a short
// pause. A timeout gets no pause at all: the next utterance tries it again.

export type SpeechProviderName = "sahara" | "groq";

export type Transcriber = (audio: Blob, filename: string, language: string | undefined) => Promise<string>;

export type FailureReason = "no-key" | "cooling-down" | "credit-or-auth" | "rate-limited" | "timeout" | "error";

export type ProviderAttempt = {
  provider: SpeechProviderName;
  outcome: "ok" | "failed" | "skipped";
  reason?: FailureReason;
  ms?: number;
};

export type ChainResult = { transcript: string; provider: SpeechProviderName; attempts: ProviderAttempt[] };

export class SpeechUnavailableError extends Error {
  readonly attempts: ProviderAttempt[];
  constructor(attempts: ProviderAttempt[]) {
    super("No speech provider could transcribe the audio");
    this.name = "SpeechUnavailableError";
    this.attempts = attempts;
  }
}

export const LONG_COOLDOWN_MS = 10 * 60_000;
export const SHORT_COOLDOWN_MS = 20_000;
// A live turn cannot wait on a provider that has stopped answering. Groq
// usually returns in well under a second; Sahara with LLM corrections off in
// about two. Twelve seconds is generous for both and still short enough that
// falling through to the next provider is worth it.
export const PROVIDER_TIMEOUT_MS = 12_000;

const cooldownUntil = new Map<SpeechProviderName, number>();

export function resetCooldowns(): void {
  cooldownUntil.clear();
}

export function classifyFailure(message: string): Exclude<FailureReason, "no-key" | "cooling-down"> {
  if (/timed out|timeout|aborted/i.test(message)) return "timeout";
  if (/\b429\b|rate.?limit|too many requests/i.test(message)) return "rate-limited";
  if (/insufficient balance|insufficient_quota|depleted|out of credit|\b402\b|\b401\b|\b403\b|unauthori[sz]ed|invalid api key|api key is not set|_API_KEY is not set/i.test(message)) {
    return "credit-or-auth";
  }
  return "error";
}

/** Provider order from configuration, "sahara,groq" unless told otherwise.
 *  Unknown names and duplicates are dropped rather than failing the request. */
export function providerOrder(value: string | undefined): SpeechProviderName[] {
  const names = (value ?? "sahara,groq").split(",").map((s) => s.trim().toLowerCase());
  const known = names.filter((n): n is SpeechProviderName => n === "sahara" || n === "groq");
  return [...new Set(known)];
}

function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`timed out after ${ms}ms`)), ms);
  });
  return Promise.race([work, deadline]).finally(() => clearTimeout(timer));
}

export type ChainDeps = {
  order: SpeechProviderName[];
  transcribers: Record<SpeechProviderName, Transcriber>;
  hasKey: (provider: SpeechProviderName) => boolean;
  now?: () => number;
  timeoutMs?: number;
};

export async function transcribeWithFallback(
  audio: Blob,
  filename: string,
  language: string | undefined,
  deps: ChainDeps,
): Promise<ChainResult> {
  const now = deps.now ?? (() => Date.now());
  const attempts: ProviderAttempt[] = [];

  for (const provider of deps.order) {
    if (!deps.hasKey(provider)) {
      attempts.push({ provider, outcome: "skipped", reason: "no-key" });
      continue;
    }
    if ((cooldownUntil.get(provider) ?? 0) > now()) {
      attempts.push({ provider, outcome: "skipped", reason: "cooling-down" });
      continue;
    }

    const started = now();
    try {
      // An empty transcript is a real answer (the user said nothing that could
      // be heard), so it returns rather than falling through.
      const transcript = await withTimeout(
        deps.transcribers[provider](audio, filename, language),
        deps.timeoutMs ?? PROVIDER_TIMEOUT_MS,
      );
      cooldownUntil.delete(provider);
      attempts.push({ provider, outcome: "ok", ms: now() - started });
      return { transcript, provider, attempts };
    } catch (err) {
      const reason = classifyFailure(err instanceof Error ? err.message : String(err));
      if (reason === "credit-or-auth") cooldownUntil.set(provider, now() + LONG_COOLDOWN_MS);
      if (reason === "rate-limited") cooldownUntil.set(provider, now() + SHORT_COOLDOWN_MS);
      attempts.push({ provider, outcome: "failed", reason, ms: now() - started });
    }
  }

  throw new SpeechUnavailableError(attempts);
}
