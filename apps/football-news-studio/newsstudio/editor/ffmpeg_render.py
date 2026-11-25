"""FFmpeg-Videoeditor: Segmente (Foto-Zoom/Schwenk, Video-Clips, Grafiken + Overlays) → Übergänge →
Untertitel → Audio-Mix (Stimme + Musik mit Ducking, −14 LUFS) → MP4 1080×1920 / 30 fps."""

from __future__ import annotations

import json
import shutil
import subprocess
from pathlib import Path

from PIL import Image

from .. import audio as audiolib
from ..config import Settings
from ..library import license
from ..scenes import graphics
from . import captions, timeline

W, H = 1080, 1920
FONT_DIR = Path(__file__).resolve().parent.parent / "assets" / "fonts"


class RenderError(RuntimeError):
    pass


def _run(cmd: list[str]) -> None:
    p = subprocess.run(cmd, capture_output=True, text=True)
    if p.returncode != 0:
        raise RenderError(f"ffmpeg fehlgeschlagen: {' '.join(cmd[:6])} …\n{p.stderr[-1500:]}")


def _zoom_expr(motion: str, d: float) -> tuple[str, str, str]:
    """(z(t), fx-Offset(t), fy-Offset(t)) als ffmpeg-Ausdrücke."""
    if motion == "zoom_in":
        return f"(1+0.11*t/{d:.3f})", "0", "0"
    if motion == "zoom_out":
        return f"(1.11-0.11*t/{d:.3f})", "0", "0"
    if motion == "pan_right":
        return "1.12", f"(-0.18+0.36*t/{d:.3f})", "0"
    if motion == "pan_left":
        return "1.12", f"(0.18-0.36*t/{d:.3f})", "0"
    return "1.0", "0", "0"


def _cover_filter(sw: int, sh: int, motion: str, d: float, fx: float, fy: float) -> str:
    s0 = max(W / sw, H / sh)
    w0, h0 = sw * s0, sh * s0
    z, ox, oy = _zoom_expr(motion, d)
    return (f"scale=w='trunc({w0:.1f}*{z}/2)*2':h='trunc({h0:.1f}*{z}/2)*2':eval=frame,"
            f"crop={W}:{H}:x='max(0,min(iw-{W},(iw-{W})*({fx:.3f}+{ox})))':y='max(0,min(ih-{H},(ih-{H})*({fy:.3f}+{oy})))',setsar=1")


def _probe_size(path: str) -> tuple[int, int]:
    p = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height",
                        "-of", "json", path], capture_output=True, text=True)
    s = json.loads(p.stdout)["streams"][0]
    return int(s["width"]), int(s["height"])


def render_segment(cut: dict, out: Path, work: Path, settings: Settings, preview: bool, extra: float = 0.0) -> Path:
    d = cut["duration"] + extra
    ov = work / f"ov_{cut['scene']}_{cut['index']}.png"
    g = dict(cut["graphic"])
    if cut["kind"] == "grafik" and g.get("type") == "headline":
        g["type"] = "none"  # Text steht bereits groß auf der Titelkarte
    graphics.overlay(g, brand=settings.brand_name, brand_color=settings.brand_color,
                     accent=settings.accent_color, credit=cut.get("credit", ""), sources=cut.get("sources")).save(ov)
    fade = "fade=in:st=0:d=0.18:alpha=1," if cut["index"] == 0 else ""
    enc = ["-c:v", "libx264", "-preset", "ultrafast" if preview else "fast", "-crf", "24" if preview else "17",
           "-pix_fmt", "yuv420p", "-r", str(settings.fps), "-an"]
    if cut["kind"] == "video":
        sw, sh = _probe_size(cut["path"])
        pad = max(0.0, d - cut["src_len"])
        base = _cover_filter(sw, sh, "zoom_in" if cut["motion"] in ("zoom_in", "zoom_out") else "static", d,
                             cut.get("focus_x", 0.5), 0.5)
        vf = (f"[0:v]setpts=PTS-STARTPTS,fps={settings.fps},{base}"
              + (f",tpad=stop_mode=clone:stop_duration={pad:.3f}" if pad > 0.01 else "")
              + f",format=yuv420p[b];[1:v]format=rgba,{fade}null[o];[b][o]overlay=0:0:format=auto,format=yuv420p")
        cmd = ["ffmpeg", "-v", "error", "-y", "-ss", f"{cut['src_in']:.3f}", "-t", f"{min(d, cut['src_len']):.3f}",
               "-i", cut["path"], "-loop", "1", "-t", f"{d:.3f}", "-i", str(ov), "-filter_complex", vf, "-t", f"{d:.3f}"] + enc + [str(out)]
    else:
        if cut["kind"] == "grafik":
            img = work / f"card_{cut['scene']}_{cut['index']}.jpg"
            title = (cut["graphic"].get("title") or cut.get("card_text") or settings.brand_name)
            graphics.title_card(title, settings.brand_color, settings.accent_color).save(img, quality=92)
            src = str(img)
        else:
            src = cut["path"]
        with Image.open(src) as im:
            sw, sh = im.size
        vf = (f"[0:v]fps={settings.fps},{_cover_filter(sw, sh, cut['motion'], d, cut.get('focus_x', 0.5), cut.get('focus_y', 0.4))},"
              f"format=yuv420p[b];[1:v]format=rgba,{fade}null[o];[b][o]overlay=0:0:format=auto,format=yuv420p")
        cmd = ["ffmpeg", "-v", "error", "-y", "-loop", "1", "-framerate", str(settings.fps), "-t", f"{d:.3f}", "-i", src,
               "-loop", "1", "-t", f"{d:.3f}", "-i", str(ov), "-filter_complex", vf, "-t", f"{d:.3f}"] + enc + [str(out)]
    _run(cmd)
    return out


def license_recheck(cuts: list[dict], settings: Settings) -> list[str]:
    bad = []
    for mid in sorted({c["media_id"] for c in cuts if c.get("media_id")}):
        chk = license.check_media(mid, settings)
        if not chk["usable"]:
            bad.append(f"Datei {mid}: {chk['status']} ({'; '.join(chk['reasons'])})")
    return bad


def render(project_dir: Path, script: dict, voice: dict, settings: Settings | None = None, preview: bool = False,
           overrides: dict | None = None, music_file: Path | None = None, log=print, progress=None) -> dict:
    s = settings or Settings.load()
    tl = timeline.plan(script, voice, s, overrides)
    bad = license_recheck(tl["cuts"], s)
    if bad:
        raise RenderError("Abbruch – nicht freigegebene Medien im Schnitt: " + "; ".join(bad))
    work = project_dir / "render_work"
    if work.exists():
        shutil.rmtree(work)
    work.mkdir(parents=True)
    cuts = tl["cuts"]
    # Übergänge brauchen Überlappung: vorheriges Segment um die Übergangsdauer verlängern
    segs = []
    for i, c in enumerate(cuts):
        nxt = cuts[i + 1] if i + 1 < len(cuts) else None
        extra = timeline.TRANS_DUR if nxt and nxt["transition_in"] in timeline.XFADE else 0.0
        if nxt is None:
            extra = 0.25
        seg = render_segment(c, work / f"seg{i:03d}.mp4", work, s, preview, extra)
        segs.append((seg, c["duration"] + extra, nxt["transition_in"] if nxt else None))
        if progress:
            progress(70 * (i + 1) / len(cuts))
    # Verketten mit xfade bzw. hartem Schnitt
    inputs, fc, cur, length = [], [], "[n0]", segs[0][1]
    for i, (seg, d, _) in enumerate(segs):
        inputs += ["-i", str(seg)]
        fc.append(f"[{i}:v]setpts=PTS-STARTPTS,fps={s.fps},settb=1/{s.fps},setsar=1,format=yuv420p[n{i}]")
    for i in range(1, len(segs)):
        trans = segs[i - 1][2]
        out = f"[v{i}]"
        if trans in timeline.XFADE:
            off = length - timeline.TRANS_DUR
            fc.append(f"{cur}[n{i}]xfade=transition={timeline.XFADE[trans]}:duration={timeline.TRANS_DUR}:offset={off:.3f},settb=1/{s.fps}{out}")
            length = off + segs[i][1]
        else:
            fc.append(f"{cur}[n{i}]concat=n=2:v=1:a=0,settb=1/{s.fps}{out}")
            length += segs[i][1]
        cur = out
    joined = work / "joined.mp4"
    if len(segs) > 1:
        _run(["ffmpeg", "-v", "error", "-y"] + inputs + ["-filter_complex", ";".join(fc), "-map", cur,
              "-c:v", "libx264", "-preset", "ultrafast" if preview else "fast", "-crf", "16", "-pix_fmt", "yuv420p", str(joined)])
    else:
        shutil.copy(segs[0][0], joined)
    if progress:
        progress(82)
    # Untertitel
    emph = {sc["id"]: sc.get("emphasis", []) for sc in script["scenes"]}
    ass = work / "captions.ass"
    ass.write_text(captions.build_ass(voice["words"], emph, s.accent_color), "utf-8")
    # Musik
    vo = Path(voice["file_abs"])
    music = music_file
    if music is None:
        from .. import music as musiclib

        music = work / "music.wav"
        musiclib.compose(voice["duration"] + 1.5, "dramatisch", script["title"], music)
    ducked = work / "music_ducked.wav"
    audiolib.duck_music(music, vo, ducked, s.music_volume_db)
    out_name = "preview.mp4" if preview else "final.mp4"
    out = project_dir / "exports" / out_name
    out.parent.mkdir(parents=True, exist_ok=True)
    vf = f"subtitles=filename='{ass.as_posix()}':fontsdir='{FONT_DIR.as_posix()}'"
    if preview:
        vf += ",scale=540:960"
    total = voice["duration"] + 0.2
    _run(["ffmpeg", "-v", "error", "-y", "-i", str(joined), "-i", str(vo), "-i", str(ducked), "-filter_complex",
          f"[0:v]{vf},format=yuv420p[v];[1:a]aformat=sample_rates=48000:channel_layouts=stereo[vo];"
          f"[2:a]aformat=sample_rates=48000:channel_layouts=stereo[mu];"
          f"[vo][mu]amix=inputs=2:normalize=0:duration=first,loudnorm=I=-14:TP=-1.5:LRA=11,aresample=48000[a]",
          "-map", "[v]", "-map", "[a]", "-t", f"{total:.3f}", "-c:v", "libx264", "-preset", "veryfast" if preview else "medium",
          "-crf", "26" if preview else "18", "-profile:v", "high", "-pix_fmt", "yuv420p", "-r", str(s.fps),
          "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-movflags", "+faststart", str(out)])
    if progress:
        progress(100)
    (project_dir / "exports" / ("timeline_preview.json" if preview else "timeline_final.json")).write_text(
        json.dumps(tl, ensure_ascii=False, indent=1), "utf-8")
    if not preview:
        shutil.rmtree(work, ignore_errors=True)
    log(f"{'Vorschau' if preview else 'Export'} fertig: {out.name} ({len(cuts)} Schnitte, Videoanteil {int(tl['video_share'] * 100)} %)")
    return {"file": str(out), "timeline": tl}
