#!/usr/bin/env python3
"""Sprechpausen aus einem fertigen Clip schneiden (Jump-Cuts), damit jede Sekunde dicht ist.

Nutzer 22.11.: Clips über 1 min performen schlechter -> Leerlauf raus. Geschnitten wird das
fertige clip.mp4 (Untertitel + Hook sind eingebrannt und bleiben synchron). Die ersten
Sekunden (Hook) und ein geschützter Bereich um den Höhepunkt bleiben unangetastet, damit
sichtbare Action ohne Sprache nicht verloren geht. Es wird nie unter --min-len gekürzt.

  tools/tighten.py <clip-id> [--protect A B] [--min-len 61] [--gap 0.9] [--out clip_tight.mp4]
Zeiten bei --protect sind Rohschnitt-Zeiten (wie start_s/end_s/peak_s im Judgment).
"""
from __future__ import annotations

import argparse
import json
import sqlite3
import subprocess
from pathlib import Path

PAD = 0.25       # Luft vor/nach dem Wort
HOOK_KEEP = 4.0  # Anfang nie schneiden (roter Hook)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("cid", type=int)
    ap.add_argument("--protect", nargs=2, type=float, action="append", default=[])
    ap.add_argument("--min-len", type=float, default=61.0)
    ap.add_argument("--gap", type=float, default=0.9)
    ap.add_argument("--out", default="clip_tight.mp4")
    a = ap.parse_args()

    d = Path(f"data/clips/{a.cid}")
    j = json.loads(sqlite3.connect("data/pipeline.sqlite3").execute(
        "select judgment from clips where id=?", (a.cid,)).fetchone()[0])
    t0, t1 = float(j["start_s"]), float(j["end_s"])
    words = json.loads((d / "transcript.json").read_text("utf-8"))["words"]
    clip = d / "clip.mp4"
    dur = float(subprocess.check_output(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(clip)]))
    prot = [(p0 - t0, p1 - t0) for p0, p1 in a.protect]

    # Lücken zwischen Wörtern (Clip-Zeit) als Schnittkandidaten
    ws = sorted((w["start"] - t0, w["end"] - t0) for w in words if t0 <= w["start"] < t1)
    gaps = []
    prev_end = HOOK_KEEP
    for s, e in ws:
        gaps.append((prev_end + PAD, s - PAD))
        prev_end = max(prev_end, e)
    gaps.append((prev_end + PAD, dur))
    # geschützte Bereiche aus den Lücken herausnehmen
    cuts = []
    for c0, c1 in gaps:
        parts = [(c0, c1)]
        for p0, p1 in prot:
            parts = [q for a0, a1 in parts for q in ((a0, min(a1, p0)), (max(a0, p1), a1))]
        cuts += [(x0, x1) for x0, x1 in parts if x1 - x0 >= a.gap - 2 * PAD]

    # größte Lücken zuerst, solange Mindestlänge hält; die letzte passende wird mittig gekürzt
    budget = dur - a.min_len
    chosen = []
    for c0, c1 in sorted(cuts, key=lambda c: c[1] - c[0], reverse=True):
        if budget < 0.5:
            break
        length = c1 - c0
        if length > budget:
            mid = (c0 + c1) / 2
            c0, c1, length = mid - budget / 2, mid + budget / 2, budget
        chosen.append((c0, c1))
        budget -= length
    chosen.sort()
    keep, pos = [], 0.0
    for c0, c1 in chosen:
        keep.append((pos, c0))
        pos = c1
    if pos < dur:
        keep.append((pos, dur))
    removed = sum(c1 - c0 for c0, c1 in chosen)
    print(f"{len(chosen)} Schnitte, {removed:.1f} s raus, neu {dur - removed:.1f} s")
    if not chosen:
        return

    sel = "+".join(f"between(t,{s:.3f},{e:.3f})" for s, e in keep)
    out = d / a.out
    subprocess.run([
        "ffmpeg", "-v", "error", "-y", "-i", str(clip),
        "-vf", f"select='{sel}',setpts=N/FRAME_RATE/TB",
        "-af", f"aselect='{sel}',asetpts=N/SR/TB",
        "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", str(out)], check=True)
    print(out)


if __name__ == "__main__":
    main()
