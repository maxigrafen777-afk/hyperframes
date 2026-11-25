"""Rendern mit der HyperFrames-CLI (lint → check → render) inkl. Fortschritt."""

from __future__ import annotations

import json
import os
import re
import subprocess
from pathlib import Path

from .config import HYPERFRAMES_VERSION


def _cli() -> list[str]:
    return ["npx", "-y", f"hyperframes@{HYPERFRAMES_VERSION}"]


def _env() -> dict:
    env = dict(os.environ)
    env.setdefault("HYPERFRAMES_SKIP_SKILLS", "1")
    env.setdefault("HYPERFRAMES_NO_TELEMETRY", "1")
    env.setdefault("DO_NOT_TRACK", "1")
    return env


def _run_json(args: list[str], cwd: Path, timeout: int = 600) -> tuple[int, dict | None, str]:
    p = subprocess.run(_cli() + args, cwd=cwd, capture_output=True, text=True, timeout=timeout, env=_env())
    out = p.stdout.strip()
    data = None
    start = out.find("{")
    if start >= 0:
        try:
            data = json.loads(out[start:])
        except json.JSONDecodeError:
            data = None
    return p.returncode, data, (p.stdout + p.stderr)[-6000:]


def lint(video_dir: Path) -> dict:
    code, data, raw = _run_json(["lint", "--json"], video_dir)
    return {"ok": code == 0, "result": data, "raw": raw if data is None else ""}


def check(video_dir: Path) -> dict:
    code, data, raw = _run_json(["check", "--json"], video_dir, timeout=900)
    return {"ok": code == 0, "result": data, "raw": raw if data is None else ""}


def render(video_dir: Path, out_file: Path, quality: str = "draft", fps: int = 30, progress=None) -> Path:
    out_file.parent.mkdir(parents=True, exist_ok=True)
    args = _cli() + ["render", "-o", str(out_file), "-q", quality, "--fps", str(fps)]
    p = subprocess.Popen(args, cwd=video_dir, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, env=_env())
    tail: list[str] = []
    assert p.stdout
    for line in p.stdout:
        tail = (tail + [line])[-60:]
        m = re.match(r"@hf-progress (\{.*\})", line.strip())
        if m and progress:
            try:
                progress(json.loads(m.group(1)).get("pct", 0))
            except json.JSONDecodeError:
                pass
    p.wait()
    if p.returncode != 0 or not out_file.exists():
        raise RuntimeError("Render fehlgeschlagen:\n" + "".join(tail[-25:]))
    return out_file


def thumbnail(video: Path, at: float, out: Path) -> Path:
    out.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", f"{at:.2f}", "-i", str(video), "-frames:v", "1",
                    "-vf", "scale=360:-1", str(out)], check=True)
    return out
