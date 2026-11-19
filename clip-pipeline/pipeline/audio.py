"""Musik entfernen: Stimmen per Demucs von Musik und Geräuschen trennen.

Veröffentlicht wird nur die Stimmspur. Musik (GTA-Radio, Hintergrundmusik des
Streamers) landet in den anderen Spuren und wird verworfen. Wo deutlich Musik
lief, wird das gemeldet: Dort kann gesungener Text in der Stimmspur stecken.
"""

from __future__ import annotations

import subprocess
from functools import lru_cache
from pathlib import Path

import numpy as np

SR = 44_100            # Demucs arbeitet mit 44,1 kHz
MUSIC_DB = -38.0       # Begleitspur lauter als das -> in dieser Sekunde lief Musik/Geräusch


@lru_cache(maxsize=1)
def _model():
    from demucs.pretrained import get_model  # schwer, erst bei Bedarf laden

    m = get_model("htdemucs")
    m.eval()
    return m


def _decode(path: Path) -> np.ndarray:
    raw = subprocess.run(
        ["ffmpeg", "-v", "error", "-i", str(path), "-vn", "-af", "aresample=async=1:first_pts=0",  # Lücken mit Stille füllen: gleiche Zeitachse wie das Video
         "-ac", "2", "-ar", str(SR), "-f", "f32le", "pipe:1"],
        capture_output=True, check=True,
    ).stdout
    return np.frombuffer(raw, dtype=np.float32).reshape(-1, 2).T.copy()


def _write_wav(path: Path, stereo: np.ndarray) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(
        ["ffmpeg", "-v", "error", "-y", "-f", "f32le", "-ar", str(SR), "-ac", "2", "-i", "pipe:0",
         "-c:a", "pcm_s16le", str(path)],
        input=np.ascontiguousarray(stereo.T, dtype=np.float32).tobytes(), check=True,
    )


def per_second_db(mono: np.ndarray) -> np.ndarray:
    n = len(mono) // SR
    if n == 0:
        return np.zeros(0)
    rms = np.sqrt(np.mean(mono[: n * SR].reshape(n, SR).astype(np.float64) ** 2, axis=1))
    return 20 * np.log10(np.maximum(rms, 1e-9))


def separate_vocals(src: Path, out_wav: Path) -> list[int]:
    """Schreibt nur die Stimmen nach `out_wav`. Gibt die Sekunden zurück, in denen
    in der Begleitspur deutlich Musik/Geräusche liefen."""
    import torch
    from demucs.apply import apply_model

    audio = _decode(src)
    if audio.shape[1] == 0:
        _write_wav(out_wav, np.zeros((2, SR), dtype=np.float32))
        return []
    model = _model()
    x = torch.from_numpy(audio)
    ref = x.mean(0)
    mean, std = ref.mean(), ref.std() + 1e-8
    with torch.no_grad():
        stems = apply_model(model, ((x - mean) / std)[None], device="cpu", shifts=0, split=True,
                            overlap=0.25, progress=False)[0]
    stems = stems * std + mean
    vi = model.sources.index("vocals")
    vocals = stems[vi].numpy()
    rest = (stems.sum(0) - stems[vi]).numpy()
    _write_wav(out_wav, vocals)
    rest_db = per_second_db(rest.mean(0))
    return [int(i) for i in np.nonzero(rest_db > MUSIC_DB)[0]]
