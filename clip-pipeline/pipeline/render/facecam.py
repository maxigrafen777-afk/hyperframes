"""Facecam im Clip finden. Streamer verschieben ihre Cam während des Streams
(Zarbex: erst unten rechts, später rechts in der Mitte). Größe bleibt meist gleich.

Idee: Der Cam-Rahmen ist über die Zeit unbewegt, das Spiel nicht. Das Minimum der
Kantenstärke über mehrere Bilder lässt nur feste Kanten übrig. Darin wird das
Rechteck in Cam-Größe gesucht, dessen Rand am stärksten ist.
"""

from __future__ import annotations

import subprocess
from pathlib import Path

import numpy as np

from ..config import Rect

W, H = 960, 540  # halbe Auflösung reicht und ist schnell


def _frames(path: Path, start: float, dur: float, n: int) -> list[np.ndarray]:
    out = []
    for i in range(n):
        t = start + dur * (i + 0.5) / n
        raw = subprocess.run(
            ["ffmpeg", "-v", "error", "-ss", f"{t:.2f}", "-i", str(path), "-frames:v", "1",
             "-vf", f"scale={W}:{H},format=gray", "-f", "rawvideo", "pipe:1"],
            capture_output=True,
        ).stdout
        if len(raw) == W * H:
            out.append(np.frombuffer(raw, np.uint8).reshape(H, W).astype(np.float32))
    return out


def static_edges(frames: list[np.ndarray]) -> tuple[np.ndarray, np.ndarray]:
    """Waagrechte und senkrechte Kanten, die in allen Bildern vorhanden sind."""
    gy = np.percentile([np.abs(np.diff(f, axis=0, append=f[-1:])) for f in frames], 25, axis=0)
    gx = np.percentile([np.abs(np.diff(f, axis=1, append=f[:, -1:])) for f in frames], 25, axis=0)
    return _dilate(gy, axis=0), _dilate(gx, axis=1)


def _dilate(a: np.ndarray, axis: int, r: int = 2) -> np.ndarray:
    """Kanten ±r Pixel verbreitern: Cam-Größe weicht oft ein paar Pixel von der Config ab."""
    out = a.copy()
    for d in range(1, r + 1):
        out = np.maximum(out, np.roll(a, d, axis=axis))
        out = np.maximum(out, np.roll(a, -d, axis=axis))
    return out


def locate(gy: np.ndarray, gx: np.ndarray, w: int, h: int) -> tuple[int, int, float]:
    """Bestes Rechteck w*h (halbe Auflösung). Gibt (x, y, score) zurück; score = mittlere Randkante."""
    # Zeilen-/Spalten-Präfixsummen für schnelle Rand-Summen
    rows = np.cumsum(np.pad(gy, ((0, 0), (1, 0))), axis=1)   # Summe gy[y, x0:x1]
    cols = np.cumsum(np.pad(gx, ((1, 0), (0, 0))), axis=0)   # Summe gx[y0:y1, x]
    best = (0, 0, -1.0)
    for y in range(0, H - h, 2):
        top = rows[y, w:] - rows[y, :-w]                       # für alle x
        bottom = rows[min(y + h, H - 1), w:] - rows[min(y + h, H - 1), :-w]
        left = cols[y + h, :] - cols[y, :]
        right_idx = np.minimum(np.arange(len(top)) + w, W - 1)
        lft = left[: len(top)]
        rgt = left[right_idx]
        sides = [top / w, bottom / w, lft / h, rgt / h]
        # Ränder am Bildrand haben keine Kante: nicht werten (durch +inf aus dem Minimum nehmen)
        at_right = (np.arange(len(top)) + w) >= W - 2
        sides[3] = np.where(at_right, np.inf, sides[3])
        if y + h >= H - 2:
            sides[1] = np.full_like(sides[1], np.inf)
        if y <= 1:
            sides[0] = np.full_like(sides[0], np.inf)
        at_left = np.arange(len(top)) <= 1
        sides[2] = np.where(at_left, np.inf, sides[2])
        score = np.min(sides, axis=0)  # alle (sichtbaren) Seiten müssen Kante haben
        x = int(np.argmax(score))
        if score[x] > best[2]:
            best = (x, y, float(score[x]))
    return best


SCALES = (1.0, 0.95, 0.9, 0.85)  # leichte Größenänderung der Cam (xRohat, 18.11.); kleiner findet Minimap & Co.


def rect_score(gy: np.ndarray, gx: np.ndarray, r: Rect) -> float:
    """Mittlere Randkante des Rechtecks r (1920x1080) – wie locate(), aber an fester Stelle."""
    x, y, w, h = r.x // 2, r.y // 2, r.w // 2, r.h // 2
    x2, y2 = min(x + w, W - 1), min(y + h, H - 1)
    sides = []
    if y > 1:
        sides.append(gy[y, x:x2].mean())
    if y2 < H - 2:
        sides.append(gy[y2, x:x2].mean())
    if x > 1:
        sides.append(gx[y:y2, x].mean())
    if x2 < W - 2:
        sides.append(gx[y:y2, x2].mean())
    return float(min(sides)) if sides else 0.0


def check_facecam(path: Path, start: float, dur: float, known: Rect, samples: int = 6) -> tuple[Rect, float, float]:
    """(bestes Rechteck, dessen Score, Score an der Config-Stelle)."""
    frames = _frames(path, start, dur, samples)
    if len(frames) < 3:
        return known, 0.0, 0.0
    gy, gx = static_edges(frames)
    best, score = _search(gy, gx, known)
    return best, score, rect_score(gy, gx, known)


def find_facecam(path: Path, start: float, dur: float, known: Rect, samples: int = 6) -> tuple[Rect, float]:
    """Cam im Clip suchen: bekannte Größe zuerst, dann kleinere Größen bei gleichem
    Seitenverhältnis. Gibt (Rect in 1920x1080, Score)."""
    frames = _frames(path, start, dur, samples)
    if len(frames) < 3:
        return known, 0.0
    gy, gx = static_edges(frames)
    return _search(gy, gx, known)


def _search(gy: np.ndarray, gx: np.ndarray, known: Rect) -> tuple[Rect, float]:
    best: tuple[Rect, float] = (known, 0.0)
    for scale in SCALES:
        w, h = int(known.w * scale) // 2, int(known.h * scale) // 2
        x, y, score = locate(gy, gx, w, h)
        if score > best[1] * 1.15:  # kleinere Größe nur bei deutlich besserem Rand
            best = (Rect(x=x * 2, y=y * 2, w=min(w * 2, 1920 - x * 2), h=min(h * 2, 1080 - y * 2)), score)
    return best
