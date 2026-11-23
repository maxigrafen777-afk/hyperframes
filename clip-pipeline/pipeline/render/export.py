"""Fertiges 9:16-Video rendern: Schnitt, Layout, Untertitel, Lautheit, Export."""

from __future__ import annotations

import json
import re
import subprocess
from dataclasses import dataclass, replace
from pathlib import Path

from ..config import Rect
from ..judge.media import Word
from .layout import BlurLayout, SplitLayout, blur_layout, split_layout
from .letterbox import detect_game_area
from .subtitles import Placement, build_ass, shift_words

FONTS_DIR = Path(__file__).resolve().parents[2] / "assets" / "fonts"
TARGET_LUFS = -14.0  # üblich für TikTok/Reels/Shorts
MAX_BITRATE = "6M"   # hält 60 s unter dem 50-MB-Limit von Telegram-Bots


@dataclass(frozen=True)
class RenderJob:
    raw: Path
    out: Path
    start_s: float
    end_s: float
    subject_x: float
    layout: str                # "split" | "blur"
    facecam: Rect | None
    words: list[Word]          # Zeiten relativ zum Rohschnitt
    hook: str
    credit: str
    censor: tuple[str, ...] = ()
    audio: Path | None = None              # Stimmspur ohne Musik (gleiche Zeitachse wie raw)
    area: tuple[int, int] | None = None    # sichtbarer Gameplay-Bereich; None = erkennen


def _esc(path: Path) -> str:
    """Pfad für ffmpeg-Filteroptionen escapen."""
    return str(path).replace("\\", "\\\\").replace(":", "\\:").replace("'", "\\'")


def video_filter(job: RenderJob, ass: Path) -> str:
    base = "[0:v]scale=1920:1080:flags=lanczos,setsar=1,split=2[a][b];"
    subs = f"subtitles=filename='{_esc(ass)}':fontsdir='{_esc(FONTS_DIR)}'"
    lay = layout_for(job)
    if isinstance(lay, SplitLayout):
        return (base
                + f"[a]{lay.cam_src.crop()},scale=1080:{lay.cam_h}:flags=lanczos[cam];"
                + f"[b]{lay.game_src.crop()},scale=1080:{lay.game_h}:flags=lanczos,unsharp=5:5:0.7:5:5:0[game];"
                + f"[cam][game]vstack=inputs=2,{subs},format=yuv420p[v]")
    return (base
            + f"[a]scale=-2:1920,crop=1080:1920:{lay.bg_x}:0,boxblur=28:2,eq=brightness=-0.12:saturation=1.2[bg];"
            + f"[b]{lay.fg_src.crop()},scale=1080:{lay.fg_h}:flags=lanczos,unsharp=5:5:0.7:5:5:0[fg];"
            + f"[bg][fg]overlay=0:{lay.fg_y},{subs},format=yuv420p[v]")


def layout_for(job: RenderJob) -> SplitLayout | BlurLayout:
    area = job.area or (0, 1080)
    if job.layout == "split" and job.facecam is not None:
        return split_layout(job.facecam, job.subject_x, area)
    return blur_layout(job.subject_x, area)


def placement(lay: SplitLayout | BlurLayout) -> Placement:
    cx, cy = lay.credit_pos
    return Placement(caption_y=lay.caption_y, hook_y=lay.hook_y, credit_x=cx, credit_y=cy)


def measure_loudness(raw: Path, start: float, dur: float) -> dict[str, str] | None:
    """Erster loudnorm-Durchgang: Messwerte für den genauen zweiten Durchgang."""
    proc = subprocess.run(
        ["ffmpeg", "-hide_banner", "-nostats", "-ss", f"{start:.3f}", "-t", f"{dur:.3f}", "-i", str(raw),
         "-vn", "-af", f"loudnorm=I={TARGET_LUFS}:TP=-1.5:LRA=11:print_format=json", "-f", "null", "-"],
        capture_output=True, text=True,
    )
    m = re.search(r"\{[^{}]*\"input_i\"[^{}]*\}", proc.stderr)
    if not m:
        return None
    data = json.loads(m.group(0))
    if data.get("input_i") in (None, "-inf"):
        return None  # Stille
    return data


def audio_filter(measured: dict[str, str] | None) -> str:
    base = f"loudnorm=I={TARGET_LUFS}:TP=-1.5:LRA=11"
    if measured:
        base += (f":measured_I={measured['input_i']}:measured_TP={measured['input_tp']}"
                 f":measured_LRA={measured['input_lra']}:measured_thresh={measured['input_thresh']}"
                 f":offset={measured['target_offset']}:linear=true")
    return base + ",aresample=48000"


def render(job: RenderJob) -> Path:
    dur = job.end_s - job.start_s
    if dur <= 0.5:
        raise ValueError("Schnitt zu kurz")
    job.out.parent.mkdir(parents=True, exist_ok=True)
    if job.area is None:
        job = replace(job, area=detect_game_area(job.raw, job.start_s, dur))
    lay = layout_for(job)
    ass = job.out.with_suffix(".ass")
    words = shift_words(job.words, job.start_s, job.end_s)
    ass.write_text(build_ass(words, duration=dur, hook=job.hook, credit=job.credit, place=placement(lay),
                             censor=list(job.censor)),
                   encoding="utf-8")
    audio_src = job.audio or job.raw
    measured = measure_loudness(audio_src, job.start_s, dur)
    cmd = [
        "ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
        "-ss", f"{job.start_s:.3f}", "-t", f"{dur:.3f}", "-i", str(job.raw),
        *(["-ss", f"{job.start_s:.3f}", "-t", f"{dur:.3f}", "-i", str(job.audio)] if job.audio else []),
        "-filter_complex", video_filter(job, ass), "-map", "[v]",
        "-map", "1:a:0" if job.audio else "0:a:0?", "-af", audio_filter(measured),
        "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-maxrate", MAX_BITRATE, "-bufsize", "12M",
        "-profile:v", "high", "-fps_mode", "cfr",
        "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", str(job.out),
    ]
    subprocess.run(cmd, check=True, capture_output=True, text=True)
    return job.out
