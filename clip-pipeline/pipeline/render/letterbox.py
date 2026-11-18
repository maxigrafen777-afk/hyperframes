"""Feste schwarze Balken oben/unten im Stream erkennen (z. B. Zarbex: 60 px oben)."""

from __future__ import annotations

import subprocess
from pathlib import Path

import numpy as np

from .layout import SRC_H, SRC_W

DARK = 20          # 75. Perzentil einer Zeile darunter = (fast) schwarz; Schrift im Balken (<25 % Breite) stört nicht
MAX_BAR = 0.15     # nie mehr als 15 % der Höhe abschneiden


def _gray_frame(path: Path, t: float) -> np.ndarray | None:
    out = subprocess.run(
        ["ffmpeg", "-v", "error", "-ss", f"{t:.2f}", "-i", str(path), "-frames:v", "1",
         "-vf", f"scale={SRC_W}:{SRC_H},format=gray", "-f", "rawvideo", "pipe:1"],
        capture_output=True,
    ).stdout
    if len(out) != SRC_W * SRC_H:
        return None
    return np.frombuffer(out, dtype=np.uint8).reshape(SRC_H, SRC_W)


def bars_in_frame(gray: np.ndarray) -> tuple[int, int]:
    dark = np.percentile(gray, 75, axis=1) < DARK
    top = int(np.argmin(dark)) if not dark.all() else 0
    bottom = SRC_H - int(np.argmin(dark[::-1])) if not dark.all() else SRC_H
    return top, bottom


def detect_game_area(path: Path, start: float, dur: float, samples: int = 8) -> tuple[int, int]:
    """Sichtbarer Bereich (y0, y1). Über mehrere Bilder das Minimum der Balken:
    dunkle Szenen täuschen nur größere Balken vor, nie kleinere."""
    tops, bottoms = [], []
    for i in range(samples):
        g = _gray_frame(path, start + dur * (i + 0.5) / samples)
        if g is not None:
            t, b = bars_in_frame(g)
            tops.append(t)
            bottoms.append(b)
    if not tops:
        return 0, SRC_H

    def stable(values: list[int], pick) -> int | None:
        """Echte Balken sind in den meisten Bildern gleich hoch, dunkle Szenen schwanken."""
        # kleinster (oben) bzw. größter (unten) Wert, der in >= 1/3 der Bilder gleich auftaucht
        for cand in sorted(set(values), reverse=pick is max):
            if sum(abs(v - cand) <= 4 for v in values) * 3 >= len(values) and sum(
                    abs(v - cand) <= 4 for v in values) >= 2:
                return cand
        return None

    y0 = stable(tops, min) or 0
    y1 = stable(bottoms, max) or SRC_H
    y0 = y0 if 8 <= y0 <= SRC_H * MAX_BAR else 0
    y1 = y1 if 8 <= SRC_H - y1 <= SRC_H * MAX_BAR else SRC_H
    return y0 + (2 if y0 else 0), y1 - (2 if y1 < SRC_H else 0)  # Kante mit Kompressionssaum mitnehmen
