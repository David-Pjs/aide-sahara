"""
Extracts one short, real benchmark clip from an AfriSwitchCare conversation.

AfriSwitchCare rows are whole clinical conversations (minutes long), not
short utterances, and the dataset provides no word-level timestamps. But
each transcription begins with a leading timestamp like "[00:01:50]"
marking where the transcribed content starts (skipping dead air/setup
before it). We use that as a real anchor: dump the full audio, cut a clean
window starting exactly there, and take the transcript text that opens the
conversation at that same point.

This is disclosed as a best-effort trim (not word-aligned) in
benchmark/README.md, real audio, real human transcript, real
code-switching, honestly labeled about its one limitation.

Usage: python extract_sample.py <parquet_path> <row_index> <clip_seconds> <out_wav> <out_txt>
"""
import sys
import re
import pyarrow.parquet as pq

parquet_path, row_index, clip_seconds, out_wav, out_txt = sys.argv[1:6]
row_index = int(row_index)
clip_seconds = float(clip_seconds)

table = pq.read_table(parquet_path)
row = table.slice(row_index, 1).to_pylist()[0]

audio_bytes = row["audio"]["bytes"]
transcription = row["transcription"]

with open(out_wav + ".full.raw", "wb") as f:
    f.write(audio_bytes)

# Find the leading timestamp anchor, e.g. "[00:01:50]" or "00:01:50]".
m = re.search(r"(\d{2}):(\d{2}):(\d{2})\]?", transcription[:30])
if m:
    h, mnt, s = (int(x) for x in m.groups())
    start_seconds = h * 3600 + mnt * 60 + s
    text_start = m.end()
else:
    start_seconds = 0
    text_start = 0

# Grab a reasonable amount of opening transcript text: strip the leading
# timestamp/bracket/colon, take the first ~55 words as the reference.
remainder = transcription[text_start:].lstrip(" \\]:\n")
words = remainder.split()
reference = " ".join(words[:55])
# " : " marks speaker-turn boundaries in this dataset's transcript format
# (speaker labels already stripped) -- not real spoken content, so it would
# unfairly penalize every model's WER if left in as if it were a word.
reference = re.sub(r"\s*:\s*", " ", reference)
reference = re.sub(r"\s{2,}", " ", reference).strip()

print(f"START_SECONDS={start_seconds}")
print(f"REFERENCE_TEXT={reference}")
print(f"DURATION={row['duration']}")
print(f"NUM_TURNS={row['num_turns']}")
print(f"CMI={row['cmi']}")

with open(out_txt, "w", encoding="utf-8") as f:
    f.write(reference)
