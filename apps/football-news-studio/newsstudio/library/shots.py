"""Videos: Shot-Erkennung (Szenenwechsel), Vorschaubilder, Proxy-Dateien."""

from __future__ import annotations

import re
import subprocess
from pathlib import Path


def detect(path: Path, duration: float, threshold: float = 12.0, min_len: float = 1.2) -> list[tuple[float, float]]:
    p = subprocess.run(
        ["ffmpeg", "-hide_banner", "-nostats", "-i", str(path), "-vf",
         f"scale=320:-2,scdet=threshold={threshold},metadata=print:file=-", "-an", "-f", "null", "-"],
        capture_output=True, text=True,
    )
    cuts = sorted({round(float(m), 3) for m in re.findall(r"lavfi\.scd\.time=([\d.]+)", p.stdout + p.stderr)})
    bounds = [0.0] + [c for c in cuts if 0 < c < duration] + [duration]
    shots: list[tuple[float, float]] = []
    for a, b in zip(bounds, bounds[1:]):
        if b - a < min_len and shots:
            shots[-1] = (shots[-1][0], b)  # sehr kurze Schnipsel an den Vorgänger hängen
        elif b - a >= 0.4:
            shots.append((a, b))
    return shots


def thumbnail(src: Path, at: float, out: Path, width: int = 360) -> Path:
    out.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", f"{max(0, at):.2f}", "-i", str(src), "-frames:v", "1",
                    "-vf", f"scale={width}:-2", "-q:v", "4", str(out)], check=True)
    return out


def image_thumbnail(src: Path, out: Path, width: int = 360) -> Path:
    from PIL import Image, ImageOps

    out.parent.mkdir(parents=True, exist_ok=True)
    with Image.open(src) as im:
        im = ImageOps.exif_transpose(im).convert("RGB")
        im.thumbnail((width, width * 2))
        im.save(out, "JPEG", quality=82)
    return out


def proxy(src: Path, out: Path) -> Path:
    """540p-Vorschaudatei für schnelles Abspielen im Dashboard."""
    out.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(src), "-vf", "scale=-2:540", "-c:v", "libx264",
                    "-preset", "veryfast", "-crf", "28", "-c:a", "aac", "-b:a", "96k", "-movflags", "+faststart", str(out)],
                   check=True)
    return out
