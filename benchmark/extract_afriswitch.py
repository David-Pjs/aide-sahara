"""
Stages short, genuinely code-switched clips from Intron AfriSwitch for the benchmark.

AfriSwitch is the dataset that matches what Aide actually hears: short natural
utterances, not long clinical consultations. Selection is deterministic and
stated here so it can be checked rather than trusted:

  1. duration (dataset field) between 4 and 20 seconds
  2. at least 2 switch points, so the clip actually switches language
  3. at most one clip per source recording (the filename prefix before _chunk),
     so a single speaker or broadcast cannot dominate a language
  4. ranked by code-mix index, highest first, then the first N taken

Usage: python benchmark/extract_afriswitch.py <lang> <N>
"""
import sys, io, json, wave, os, re
import pyarrow.parquet as pq
from wav_rate import repair_rate

# Speaker labels are transcriber annotation, not speech. The source spells
# them inconsistently ("[Spaeker 1]"), so the match tolerates typos. Left in,
# every model is charged for failing to say words nobody said.
SPEAKER = re.compile(r"\[\s*sp[a-z]{1,3}ker\s*\d*\s*\]", re.I)

lang, N = sys.argv[1], int(sys.argv[2])
src = f"benchmark/raw/afriswitch/{lang}.parquet"
out_dir = "benchmark/samples/afriswitch"
os.makedirs(out_dir, exist_ok=True)

rows = pq.read_table(src).to_pylist()

def wav_params(b):
    try:
        w = wave.open(io.BytesIO(b))
        return dict(ch=w.getnchannels(), sw=w.getsampwidth(), sr=w.getframerate(), secs=round(w.getnframes() / w.getframerate(), 2))
    except Exception as e:
        return dict(error=str(e))

eligible = [r for r in rows if 4 <= (r["duration"] or 0) <= 20 and (r["num_switch_points"] or 0) >= 2]
eligible.sort(key=lambda r: -(r["cmi"] or 0))
seen, picked = set(), []
for r in eligible:
    source = r["filename"].split("_chunk")[0]
    if source in seen:
        continue
    seen.add(source)
    picked.append(r)
    if len(picked) == N:
        break

print(f"{lang}: {len(rows)} rows, {len(eligible)} eligible, {len(seen)} unique sources used, picked {len(picked)}")
entries = []
for i, r in enumerate(picked, 1):
    b, repair = repair_rate(r["audio"]["bytes"], r["duration"])
    wp = wav_params(b)
    name = f"{lang}-{i}.wav"
    with open(f"{out_dir}/{name}", "wb") as f:
        f.write(b)
    ref = re.sub(r"\s{2,}", " ", r["transcription"]).strip()
    cleaned = re.sub(r"\s{2,}", " ", SPEAKER.sub(" ", ref)).strip()
    cleaning = "removed speaker labels, which are not spoken content" if cleaned != ref else None
    ref = cleaned
    entries.append({
        "id": f"afriswitch-{lang}-{i}",
        "dataset": "AfriSwitch",
        "audioPath": f"afriswitch/{name}",
        "reference": ref,
        "referenceTagged": re.sub(r"\s{2,}", " ", SPEAKER.sub(" ", r["transcription_tagged"])).strip(),
        "referenceCleaning": cleaning,
        "languagePair": {"hausa": "Hausa-English", "igbo": "Igbo-English", "pidgin": "Nigerian Pidgin-English", "yoruba": "Yoruba-English"}[lang],
        "saharaLanguageHint": {"hausa": "ha", "igbo": "ig", "pidgin": "pcm", "yoruba": "yo"}[lang],
        "domain": "natural speech (broadcast and conversation)",
        "source": f"Intron AfriSwitch (huggingface.co/datasets/intronhealth/AfriSwitch), {r['filename']}",
        "durationSeconds": r["duration"],
        "codeMixIndex": r["cmi"],
        "numSwitchPoints": r["num_switch_points"],
        "wav": wp,
        "sampleRateRepair": repair,
    })
    print(f"  {'REPAIRED ' if repair else ''}{name}: dataset {r['duration']:.1f}s | header {wp} | cmi {r['cmi']:.1f} | switches {r['num_switch_points']} | {ref[:60]}")

man = "benchmark/afriswitch_manifest.json"
existing = json.load(open(man, encoding="utf-8")) if os.path.exists(man) else []
existing = [e for e in existing if not e["id"].startswith(f"afriswitch-{lang}-")] + entries
json.dump(existing, open(man, "w", encoding="utf-8"), indent=2, ensure_ascii=False)
print(f"  staged {len(entries)} in {man} (total {len(existing)})")
