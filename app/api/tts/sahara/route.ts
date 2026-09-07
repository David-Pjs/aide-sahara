import { saharaSynthesize } from "@/lib/sahara";

export const runtime = "nodejs";

// Same GET-with-?text= contract as /api/tts (edge-tts), so voice-engine.ts's
// fetchSpeech() works unchanged — pointing NEXT_PUBLIC_TTS_PATH at this route
// is the only switch needed to make Aide speak through Sahara's neural voices
// (Nigerian Pidgin accent by default) instead of Microsoft Edge's.
const audioCache = new Map<string, Buffer>();
const CACHE_MAX = 50;

export async function GET(req: Request) {
  const text = new URL(req.url).searchParams.get("text");
  return synthesize(text);
}

export async function POST(req: Request) {
  const { text } = (await req.json().catch(() => ({}))) as { text?: string };
  return synthesize(text);
}

async function synthesize(text: string | null | undefined) {
  if (!text) return Response.json({ error: "text is required" }, { status: 400 });

  const cacheKey = text;
  const cached = audioCache.get(cacheKey);
  if (cached) return new Response(new Uint8Array(cached), { headers: { "Content-Type": "audio/wav" } });

  try {
    const { audio, contentType } = await saharaSynthesize(text);
    if (audioCache.size >= CACHE_MAX) {
      const oldest = audioCache.keys().next().value;
      if (oldest) audioCache.delete(oldest);
    }
    audioCache.set(cacheKey, audio);
    return new Response(new Uint8Array(audio), { headers: { "Content-Type": contentType } });
  } catch (err) {
    console.error("Sahara TTS route failed:", err);
    return Response.json({ error: (err as Error).message }, { status: 502 });
  }
}
