"""
Extracts a whole, guaranteed-correctly-paired conversation (audio + full
human transcript) from an AfriSwitchCare shard for the benchmark.

Earlier attempt trimmed clips using the transcript's leading timestamp as an
offset anchor -- live-tested and DISPROVED: Sahara transcribed completely
different content than the trimmed reference expected, meaning that
timestamp is not a reliable audio-offset marker in this dataset. Rather than
ship a wrong reference transcript, this extracts the FULL conversation
instead: audio and transcription are paired 1:1 by the dataset's own
construction, so there is zero alignment risk. Sahara's async Upload File
endpoint (not Sync) has no documented duration cap and was live-tested
successfully on a 376s file, so the 120s Sync limit doesn't apply here.

Usage: python extract_full.py <parquet_path> <row_index> <out_wav> <out_txt> <out_meta_json>
"""
import sys
import re
import json
import pyarrow.parquet as pq

parquet_path, row_index, out_wav, out_txt, out_meta = sys.argv[1:6]
row_index = int(row_index)

table = pq.read_table(parquet_path)
row = table.slice(row_index, 1).to_pylist()[0]

with open(out_wav, "wb") as f:
    f.write(row["audio"]["bytes"])

# Strip the dataset's own transcript-formatting artifacts: a single leading
# timestamp marker, and " : " speaker-turn separators (speaker labels are
# already removed, so these read as if they were spoken words otherwise).
text = re.sub(r"^\s*\d{2}:\d{2}:\d{2}\]?\s*", "", row["transcription"])
text = re.sub(r"\s*:\s*", " ", text)
text = re.sub(r"\s{2,}", " ", text).strip()

with open(out_txt, "w", encoding="utf-8") as f:
    f.write(text)

meta = {
    "language": row["language"],
    "diagnosis": row["diagnosis"],
    "durationSeconds": row["duration"],
    "numTurns": row["num_turns"],
    "cmi": row["cmi"],
    "numSwitchPoints": row["num_switch_points"],
}
with open(out_meta, "w", encoding="utf-8") as f:
    json.dump(meta, f, indent=2)

print(json.dumps(meta, indent=2))
print(f"transcript length: {len(text)} chars, {len(text.split())} words")
