"""Aus einem Rohschnitt holen, was die KI braucht: Ton, Lautstärke, Transkript, Standbilder."""

from __future__ import annotations

import json
import re
import subprocess
from functools import lru_cache
from pathlib import Path

import numpy as np
from pydantic import BaseModel

from ..config import WhisperCfg

SAMPLE_RATE = 16_000


class Word(BaseModel):
    start: float
    end: float
    word: str


class Transcript(BaseModel):
    language: str
    words: list[Word]
    loudness_db: list[float]  # ein Wert pro Sekunde (RMS in dBFS)

    @property
    def text(self) -> str:
        return "".join(w.word for w in self.words).strip()


def probe_duration(path: Path) -> float:
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "json", str(path)],
        capture_output=True, text=True, check=True,
    )
    return float(json.loads(out.stdout)["format"]["duration"])


def load_audio(path: Path) -> np.ndarray:
    """Ton als 16-kHz-Mono-float32. Ohne Tonspur: leeres Array."""
    out = subprocess.run(
        ["ffmpeg", "-hide_banner", "-loglevel", "error", "-i", str(path),
         "-vn", "-ac", "1", "-ar", str(SAMPLE_RATE), "-f", "f32le", "pipe:1"],
        capture_output=True, check=True,
    )
    return np.frombuffer(out.stdout, dtype=np.float32)


def loudness_per_second(audio: np.ndarray) -> list[float]:
    """RMS-Lautstärke je Sekunde in dBFS (Stille = -90)."""
    n = len(audio) // SAMPLE_RATE
    if n == 0:
        return []
    chunks = audio[: n * SAMPLE_RATE].reshape(n, SAMPLE_RATE).astype(np.float64)
    rms = np.sqrt(np.mean(chunks**2, axis=1))
    return [round(float(v), 1) for v in np.maximum(20 * np.log10(np.maximum(rms, 1e-12)), -90)]


def loud_spikes(loudness: list[float], jump_db: float = 9.0) -> list[int]:
    """Sekunden, in denen es deutlich lauter ist als üblich (Schrei, Explosion)."""
    if len(loudness) < 3:
        return []
    med = float(np.median(loudness))
    return [i for i, v in enumerate(loudness) if v - med >= jump_db]


@lru_cache(maxsize=2)
def _whisper(model: str, compute_type: str, threads: int):
    from faster_whisper import WhisperModel  # schwerer Import, erst bei Bedarf

    return WhisperModel(model, device="cpu", compute_type=compute_type, cpu_threads=threads)


def correct(word: str, fixes: dict[str, str]) -> str:
    """' schockst,' -> ' zockst,' (Satzzeichen und Leerzeichen bleiben)."""
    m = re.match(r"^(\W*)(.*?)(\W*)$", word)
    if not m or m.group(2).casefold() not in fixes:
        return word
    return m.group(1) + fixes[m.group(2).casefold()] + m.group(3)


def transcribe(path: Path, language: str, cfg: WhisperCfg) -> Transcript:
    audio = load_audio(path)
    words: list[Word] = []
    if len(audio):
        segments, _ = _whisper(cfg.model, cfg.compute_type, cfg.threads).transcribe(
            audio, language=language, word_timestamps=True, vad_filter=True,
            condition_on_previous_text=False,
            initial_prompt=", ".join(cfg.vocabulary) or None,
        )
        fixes = {k.casefold(): v for k, v in cfg.corrections.items()}
        for seg in segments:
            for w in seg.words or []:
                words.append(Word(start=round(w.start, 2), end=round(w.end, 2), word=correct(w.word, fixes)))
    return Transcript(language=language, words=words, loudness_db=loudness_per_second(audio))


def extract_frames(path: Path, out_dir: Path, count: int, width: int) -> list[tuple[float, Path]]:
    """`count` Standbilder gleichmäßig über den Clip verteilt (nicht ganz am Rand)."""
    duration = probe_duration(path)
    out_dir.mkdir(parents=True, exist_ok=True)
    frames = []
    for i in range(count):
        t = round(duration * (i + 0.5) / count, 2)
        out = out_dir / f"frame_{i:02d}.jpg"
        subprocess.run(
            ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-ss", str(t), "-i", str(path),
             "-frames:v", "1", "-vf", f"scale={width}:-2", "-q:v", "4", str(out)],
            check=True, capture_output=True,
        )
        frames.append((t, out))
    return frames
