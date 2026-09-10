# Synthesises the benchmark sentences with the two Python-side TTS systems:
# edge-tts (what Aide actually speaks through in production) and gTTS (Google).
# Sahara TTS is driven from src/tts-benchmark.ts instead, because it goes
# through the same lib/sahara.ts client the product uses.
#
#   python benchmark/tts/synth.py
#
# Writes benchmark/tts/audio/<system>-<id>.mp3 and a latency record per file.

import asyncio
import json
import time
from pathlib import Path

import edge_tts
from gtts import gTTS

HERE = Path(__file__).parent
AUDIO = HERE / "audio"
AUDIO.mkdir(exist_ok=True)

sentences = json.loads((HERE / "sentences.json").read_text(encoding="utf-8"))
timings: dict[str, dict[str, float]] = {}


async def synth_edge(entry: dict) -> None:
    out = AUDIO / f"edge-{entry['id']}.mp3"
    started = time.time()
    communicate = edge_tts.Communicate(entry["text"], entry["edgeVoice"])
    await communicate.save(str(out))
    elapsed = (time.time() - started) * 1000
    timings.setdefault(entry["id"], {})["edge"] = round(elapsed)
    print(f"edge  {entry['id']:<8} {out.stat().st_size:>8} bytes  {elapsed:>7.0f}ms  {entry['edgeVoice']}")


def synth_gtts(entry: dict) -> None:
    out = AUDIO / f"gtts-{entry['id']}.mp3"
    started = time.time()
    gTTS(text=entry["text"], lang=entry["gttsLang"]).save(str(out))
    elapsed = (time.time() - started) * 1000
    timings.setdefault(entry["id"], {})["gtts"] = round(elapsed)
    print(f"gtts  {entry['id']:<8} {out.stat().st_size:>8} bytes  {elapsed:>7.0f}ms  lang={entry['gttsLang']}")


async def main() -> None:
    for entry in sentences:
        await synth_edge(entry)
        synth_gtts(entry)
    (HERE / "timings.json").write_text(json.dumps(timings, indent=2), encoding="utf-8")
    print(f"\nwrote {len(sentences) * 2} files to {AUDIO}")


if __name__ == "__main__":
    asyncio.run(main())
