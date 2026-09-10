"""Applies wav_rate.repair_rate to clips already extracted, using the manifest's dataset durations."""
import json
from wav_rate import repair_rate
man_path = "benchmark/afriswitch_manifest.json"
man = json.load(open(man_path, encoding="utf-8"))
for e in man:
    path = f"benchmark/samples/{e['audioPath']}"
    b = open(path, "rb").read()
    fixed, note = repair_rate(b, e["durationSeconds"])
    if note:
        open(path, "wb").write(fixed)
        e["sampleRateRepair"] = note
        print("repaired", e["id"], "::", note)
json.dump(man, open(man_path, "w", encoding="utf-8"), indent=2, ensure_ascii=False)
