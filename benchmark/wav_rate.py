"""
Detects and repairs WAV files whose header states the wrong sample rate.

Found in Intron AfriSwitch (Hausa, test-00003-of-00004): headers declare
16000 Hz, but four of the five clips staged here hold 48000 Hz audio and one
holds 44100 Hz audio. Played as labelled, speech runs roughly 3x slow and far
too low. Verified two independent ways before repairing: speaking rate is
about 1 word/sec at the header length against 2 to 3 words/sec at the
dataset's listed duration, and median voice pitch is 45 to 86 Hz as labelled
against 131 to 246 Hz once read at the true rate. Every recogniser would score
badly on those files for reasons unrelated to the recogniser.

The true rate is not assumed to be an integer multiple. It is implied by the
dataset's own duration field (header_rate * header_secs / dataset_secs),
snapped to the nearest standard audio rate only when it lands within 3% of
one, and the samples are resampled by that exact rational ratio back to the
header rate. An earlier version decimated by a whole-number factor, which is
right for 48 kHz and made the 44.1 kHz clip play 9% fast.
"""
import io, wave
from math import gcd
import numpy as np

STANDARD_RATES = (22050, 24000, 32000, 44100, 48000)

def _resample(x, up, down):
    try:
        from scipy.signal import resample_poly
        return resample_poly(x, up, down)
    except Exception:
        target = int(round(len(x) * up / down))
        X = np.fft.rfft(x)
        keep = min(len(X), target // 2 + 1)
        Y = np.zeros(target // 2 + 1, dtype=complex)
        Y[:keep] = X[:keep]
        return np.fft.irfft(Y, target) * (target / len(x))

def repair_rate(wav_bytes, dataset_secs, tolerance=0.03):
    w = wave.open(io.BytesIO(wav_bytes))
    ch, sw, sr, n = w.getnchannels(), w.getsampwidth(), w.getframerate(), w.getnframes()
    raw = w.readframes(n)
    w.close()
    header_secs = n / sr
    if not dataset_secs or sw != 2 or ch != 1:
        return wav_bytes, None
    implied = sr * header_secs / dataset_secs
    if implied < sr * 1.3:
        return wav_bytes, None
    true_sr = min(STANDARD_RATES, key=lambda r: abs(r - implied))
    if abs(true_sr - implied) / true_sr > tolerance:
        return wav_bytes, None
    g = gcd(sr, true_sr)
    x = np.frombuffer(raw, dtype=np.int16).astype(np.float64)
    y = np.clip(np.round(_resample(x, sr // g, true_sr // g)), -32768, 32767).astype(np.int16)
    buf = io.BytesIO()
    out = wave.open(buf, "wb")
    out.setnchannels(1); out.setsampwidth(2); out.setframerate(sr)
    out.writeframes(y.tobytes())
    out.close()
    note = (f"header declared {sr} Hz but audio is {true_sr} Hz "
            f"(header length {header_secs:.2f}s vs dataset {dataset_secs:.2f}s, implied {implied:.0f} Hz); "
            f"resampled {true_sr} to {sr} Hz")
    return buf.getvalue(), note
