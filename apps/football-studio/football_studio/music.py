"""HINTERGRUNDMUSIK: wird lokal algorithmisch komponiert – dadurch eigene Rechte, keine Lizenzfragen.

Alternativ können eigene, lizenzierte Titel in ``data/music-library/`` abgelegt werden
(mit gleichnamiger ``.txt``-Datei, die Lizenz/Herkunft beschreibt).
"""

from __future__ import annotations

import hashlib
from pathlib import Path

import numpy as np

from . import audio

SR = audio.SR

MOODS = {
    # Akkordfolgen in MIDI-Grundtönen (Moll-lastig für Storytelling)
    "dramatisch": {"bpm": 84, "chords": [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]], "drums": True},
    "episch": {"bpm": 96, "chords": [[50, 53, 57], [46, 50, 53], [53, 57, 60], [48, 52, 55]], "drums": True},
    "melancholisch": {"bpm": 72, "chords": [[52, 55, 59], [48, 52, 55], [55, 59, 62], [50, 54, 57]], "drums": False},
}
CATEGORY_MOOD = {"tragik": "melancholisch", "absturz": "dramatisch", "vergessen": "melancholisch",
                 "legende": "episch", "transfer": "episch", "historisch": "dramatisch"}


def _hz(m: float) -> float:
    return 440.0 * 2 ** ((m - 69) / 12)


def _lowpass(x: np.ndarray, cutoff: float) -> np.ndarray:
    """Zweifacher einpoliger Tiefpass (12 dB/Okt): y[n] = (1-a)·x[n] + a·y[n-1]."""
    a = float(np.exp(-2 * np.pi * cutoff / SR))
    for _ in range(2):
        x = _recursive(x * (1 - a), a)
    return x


def _recursive(xb: np.ndarray, a: float, step: int = 64) -> np.ndarray:
    # exakte Rekursion blockweise vektorisiert: innerhalb eines Blocks a^-j·cumsum, Übertrag zwischen Blöcken
    out = np.empty_like(xb)
    p = a ** np.arange(step)
    acc = 0.0
    for s in range(0, len(xb), step):
        seg = xb[s:s + step]
        m = len(seg)
        pm = p[:m]
        y = np.cumsum(seg / pm) * pm + acc * a * pm
        out[s:s + m] = y
        acc = y[-1]
    return out


def compose(duration: float, mood: str, seed: str, out: Path) -> dict:
    cfg = MOODS.get(mood, MOODS["dramatisch"])
    rng = np.random.default_rng(int(hashlib.sha256(seed.encode()).hexdigest()[:8], 16))
    n = int((duration + 2) * SR)
    t = np.arange(n) / SR
    beat = 60 / cfg["bpm"]
    bar = beat * 4
    chord_len = bar * 2
    L = np.zeros(n)
    R = np.zeros(n)
    # Pad: verstimmte Sägezähne je Akkord, weicher Ein-/Ausblend
    for ci in range(int(np.ceil(duration / chord_len)) + 1):
        chord = cfg["chords"][ci % len(cfg["chords"])]
        a = int(ci * chord_len * SR)
        b = min(n, int((ci + 1) * chord_len * SR) + int(0.5 * SR))
        if a >= n:
            break
        tt = t[a:b] - t[a]
        env = np.minimum(1, tt / 0.8) * np.minimum(1, np.maximum(0, (chord_len + 0.5 - tt) / 0.9))
        for j, note in enumerate(chord + [chord[0] + 12]):
            f = _hz(note)
            for det, pan in ((-0.07, 0.3), (0.07, 0.7)):
                ph = rng.uniform(0, 1)
                saw = 2 * ((tt * f * (1 + det / 100) + ph) % 1) - 1
                v = saw * env * (0.05 if j < 3 else 0.03)
                L[a:b] += v * (1 - pan)
                R[a:b] += v * pan
        # Bass: Grundton im Achtelpuls
        f = _hz(chord[0] - 24)
        pulse = (tt % (beat / 2)) / (beat / 2)
        benv = np.exp(-pulse * 5) * env
        bass = np.sin(2 * np.pi * f * tt) * benv * 0.22
        L[a:b] += bass
        R[a:b] += bass
        # Arpeggio-Glocke
        arp_step = beat / 2
        for k in range(int(chord_len / arp_step)):
            st = a + int(k * arp_step * SR)
            if st >= n or rng.random() < 0.35:
                continue
            note = chord[[0, 1, 2, 1][k % 4]] + 12
            ln = min(n - st, int(0.6 * SR))
            tk = np.arange(ln) / SR
            tone = np.sin(2 * np.pi * _hz(note) * tk) * np.exp(-tk * 6) * 0.05
            pan = 0.35 if k % 2 else 0.65
            L[st:st + ln] += tone * (1 - pan)
            R[st:st + ln] += tone * pan
    pads = _lowpass(L, 1800), _lowpass(R, 1800)
    L, R = pads
    if cfg["drums"]:
        nbeats = int(duration / beat) + 1
        for k in range(nbeats):
            st = int(k * beat * SR)
            if st >= n:
                break
            if k % 4 in (0, 2) and k > 7:  # Kick erst nach dem Intro
                ln = min(n - st, int(0.35 * SR))
                tk = np.arange(ln) / SR
                kick = np.sin(2 * np.pi * (45 + 90 * np.exp(-tk * 25)) * tk) * np.exp(-tk * 9) * 0.5
                L[st:st + ln] += kick
                R[st:st + ln] += kick
            if k > 15:  # Hi-Hats auf den Achteln
                for off in (0, beat / 2):
                    s2 = st + int(off * SR)
                    ln = min(n - s2, int(0.05 * SR))
                    if ln <= 0:
                        continue
                    hat = rng.standard_normal(ln) * np.exp(-np.arange(ln) / SR * 80) * 0.03
                    hat = np.diff(np.concatenate([[0], hat]))  # Hochpass
                    L[s2:s2 + ln] += hat * 0.8
                    R[s2:s2 + ln] += hat * 1.2
    # Ein-/Ausblenden, normalisieren
    fade = np.minimum(1, t / 1.5) * np.minimum(1, np.maximum(0, (duration + 1.5 - t) / 2.5))
    L *= fade
    R *= fade
    peak = max(np.abs(L).max(), np.abs(R).max(), 1e-6)
    stereo = np.stack([L, R], axis=1) / peak * 0.8
    audio.write_wav(out, stereo.reshape(-1), channels=2)
    return {"file": out.name, "mood": mood, "bpm": cfg["bpm"], "source": "generated",
            "license": "Eigenkomposition (algorithmisch erzeugt von Football Story Studio) – uneingeschränkt nutzbar"}


def from_library(duration: float, seed: str, out: Path) -> dict | None:
    from .config import MUSIC_LIBRARY_DIR

    tracks = sorted(p for p in MUSIC_LIBRARY_DIR.glob("*") if p.suffix.lower() in (".mp3", ".wav", ".m4a", ".ogg"))
    tracks = [p for p in tracks if p.with_suffix(".txt").exists()]  # nur mit dokumentierter Lizenz
    if not tracks:
        return None
    pick = tracks[int(hashlib.sha256(seed.encode()).hexdigest(), 16) % len(tracks)]
    x = audio.decode(pick)
    need = int((duration + 2) * SR)
    reps = int(np.ceil(need / len(x)))
    x = np.tile(x, reps)[:need]
    fade = np.minimum(1, np.arange(need) / SR / 1.0) * np.minimum(1, (need - np.arange(need)) / SR / 2.5)
    audio.write_wav(out, x * fade)
    return {"file": out.name, "mood": "bibliothek", "source": "library", "track": pick.name,
            "license": pick.with_suffix(".txt").read_text("utf-8").strip()[:500]}
