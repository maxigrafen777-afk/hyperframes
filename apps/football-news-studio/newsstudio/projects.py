"""Lokale Projektablage: data/projects/<id>/project.json + alle Dateien des Videos."""

from __future__ import annotations

import datetime as dt
import json
import re
import shutil
import threading
import unicodedata
from pathlib import Path

from .config import ensure_dirs, paths

_lock = threading.RLock()
STATUS = {"neu": "Neu", "recherche": "Recherche", "skript": "Skript", "stimme": "Voice-over", "schnitt": "Schnitt",
          "kontrolle": "Bereit zur Kontrolle", "export": "Export läuft", "fertig": "Exportiert", "fehler": "Fehler"}
STEPS = ["research", "script", "media", "voice", "render", "export"]


def slugify(text: str) -> str:
    s = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-")[:48] or "video"


def pdir(pid: str) -> Path:
    if not re.fullmatch(r"[a-z0-9-]+", pid):
        raise ValueError("ungültige Projekt-ID")
    return paths()["projects"] / pid


def create(topic: str) -> dict:
    ensure_dirs()
    base = f"{dt.datetime.now():%Y-%m-%d-%H%M}-{slugify(topic)}"
    pid, n = base, 2
    while pdir(pid).exists():
        pid, n = f"{base}-{n}", n + 1
    pdir(pid).mkdir(parents=True)
    p = {"id": pid, "topic": topic, "status": "neu", "created_at": dt.datetime.now().isoformat(timespec="seconds"),
         "steps": {s: {"status": "offen"} for s in STEPS}, "overrides": {}, "log": []}
    return save(p)


def load(pid: str) -> dict:
    with _lock:
        return json.loads((pdir(pid) / "project.json").read_text("utf-8"))


def save(p: dict) -> dict:
    with _lock:
        p["updated_at"] = dt.datetime.now().isoformat(timespec="seconds")
        f = pdir(p["id"]) / "project.json"
        tmp = f.with_suffix(".tmp")
        tmp.write_text(json.dumps(p, ensure_ascii=False, indent=1), "utf-8")
        tmp.replace(f)
        return p


def update(pid: str, fn) -> dict:
    with _lock:
        p = load(pid)
        fn(p)
        return save(p)


def log(pid: str, msg: str, level: str = "info") -> None:
    def f(p):
        p["log"] = (p["log"] + [{"at": dt.datetime.now().isoformat(timespec="seconds"), "level": level, "message": msg}])[-400:]

    update(pid, f)


def step(pid: str, name: str, status: str, **extra) -> None:
    update(pid, lambda p: p["steps"].__setitem__(name, {"status": status, "at": dt.datetime.now().isoformat(timespec="seconds"), **extra}))


def list_all() -> list[dict]:
    ensure_dirs()
    out = []
    for d in sorted(paths()["projects"].iterdir(), reverse=True):
        f = d / "project.json"
        if not f.exists():
            continue
        p = json.loads(f.read_text("utf-8"))
        out.append({"id": p["id"], "topic": p["topic"], "title": (p.get("script") or {}).get("title") or p["topic"],
                    "status": p["status"], "status_label": STATUS.get(p["status"], p["status"]),
                    "created_at": p["created_at"], "duration": (p.get("voice") or {}).get("duration"),
                    "poster": (p.get("outputs") or {}).get("poster"), "warnings": len((p.get("timeline") or {}).get("warnings", [])),
                    "exported": bool((p.get("outputs") or {}).get("final"))})
    return out


def delete(pid: str) -> None:
    shutil.rmtree(pdir(pid))
