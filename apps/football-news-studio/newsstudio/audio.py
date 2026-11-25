"""Audio-Hilfen (ffmpeg/numpy): Dekodieren, Zusammenfügen, Ducking, Lautheit."""

from __future__ import annotations

import subprocess
import wave
from pathlib import Path

import numpy as np

SR = 44100


def decode(path: Path | str, sr: int = SR) -> np.ndarray:
    out = subprocess.run(
        ["ffmpeg", "-v", "error", "-i", str(path), "-f", "f32le", "-ac", "1", "-ar", str(sr), "-"],
        check=True, capture_output=True,
    ).stdout
    return np.frombuffer(out, dtype=np.float32).copy()


def write_wav(path: Path, data: np.ndarray, sr: int = SR, channels: int = 1) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    pcm = (np.clip(data, -1, 1) * 32767).astype("<i2")
    with wave.open(str(path), "wb") as w:
        w.setnchannels(channels)
        w.setsampwidth(2)
        w.setframerate(sr)
        w.writeframes(pcm.tobytes())


def duration(path: Path | str) -> float:
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)],
        check=True, capture_output=True, text=True,
    ).stdout.strip()
    return float(out)


def trim_silence(x: np.ndarray, thresh: float = 0.008, pad: float = 0.04, sr: int = SR) -> tuple[np.ndarray, float]:
    """Schneidet Stille am Anfang/Ende ab. Liefert (Signal, abgeschnittene Sekunden am Anfang)."""
    idx = np.where(np.abs(x) > thresh)[0]
    if len(idx) == 0:
        return x, 0.0
    a = max(0, idx[0] - int(pad * sr))
    b = min(len(x), idx[-1] + int(pad * sr))
    return x[a:b], a / sr


def loudnorm(src: Path, dst: Path, target_lufs: float = -16.0) -> None:
    subprocess.run(
        ["ffmpeg", "-v", "error", "-y", "-i", str(src), "-af", f"loudnorm=I={target_lufs}:TP=-1.5:LRA=11",
         "-ar", str(SR), str(dst)],
        check=True,
    )


def duck_music(music: Path, voice: Path, dst: Path, music_db: float = -17.0) -> None:
    """Musik unter die Stimme legen und bei Sprache automatisch absenken (Sidechain)."""
    subprocess.run(
        ["ffmpeg", "-v", "error", "-y", "-i", str(music), "-i", str(voice), "-filter_complex",
         f"[0:a]volume={music_db}dB[m];[1:a]aformat=channel_layouts=mono,asplit=1[sc];"
         "[m][sc]sidechaincompress=threshold=0.03:ratio=6:attack=20:release=400:makeup=1[out]",
         "-map", "[out]", "-ar", str(SR), "-ac", "2", str(dst)],
        check=True,
    )
