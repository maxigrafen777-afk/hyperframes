"""Lokale Projektablage: ``data/projects/<id>/project.json`` + alle erzeugten Dateien."""

from __future__ import annotations

import datetime as dt
import json
import re
import shutil
import threading
import unicodedata
from pathlib import Path

from .config import PROJECTS_DIR, ensure_dirs

_lock = threading.RLock()

STATUS_LABELS = {
    "neu": "Neu",
    "recherche": "Recherche läuft",
    "skript": "Skript wird erstellt",
    "freigabe": "Wartet auf Freigabe",
    "produktion": "In Produktion",
    "vorschau": "Vorschau bereit",
    "export": "Export läuft",
    "fertig": "Exportiert",
    "fehler": "Fehler",
}

STEPS = ["research", "script", "voice", "music", "video", "preview", "export"]


def slugify(text: str) -> str:
    s = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-")[:50] or "projekt"


def project_dir(pid: str) -> Path:
    if not re.fullmatch(r"[a-z0-9-]+", pid):
        raise ValueError("Ungültige Projekt-ID")
    return PROJECTS_DIR / pid


def create(topic: dict) -> dict:
    ensure_dirs()
    base = f"{dt.date.today().isoformat()}-{slugify(topic['label'])}"
    pid, n = base, 2
    while (PROJECTS_DIR / pid).exists():
        pid, n = f"{base}-{n}", n + 1
    p = {
        "id": pid,
        "created_at": dt.datetime.now().isoformat(timespec="seconds"),
        "updated_at": dt.datetime.now().isoformat(timespec="seconds"),
        "status": "neu",
        "approved": False,
        "topic": {k: topic.get(k) for k in ("qid", "label", "title", "category", "teaser")},
        "steps": {s: {"status": "offen"} for s in STEPS},
        "log": [],
    }
    project_dir(pid).mkdir(parents=True)
    save(p)
    return p


def load(pid: str) -> dict:
    with _lock:
        return json.loads((project_dir(pid) / "project.json").read_text("utf-8"))


def save(p: dict) -> dict:
    with _lock:
        p["updated_at"] = dt.datetime.now().isoformat(timespec="seconds")
        path = project_dir(p["id"]) / "project.json"
        tmp = path.with_suffix(".tmp")
        tmp.write_text(json.dumps(p, ensure_ascii=False, indent=1), "utf-8")
        tmp.replace(path)
        return p


def update(pid: str, fn) -> dict:
    with _lock:
        p = load(pid)
        fn(p)
        return save(p)


def log(pid: str, message: str, level: str = "info") -> None:
    def f(p):
        p["log"].append({"at": dt.datetime.now().isoformat(timespec="seconds"), "level": level, "message": message})
        p["log"] = p["log"][-300:]

    update(pid, f)


def list_all() -> list[dict]:
    ensure_dirs()
    out = []
    for d in sorted(PROJECTS_DIR.iterdir(), reverse=True):
        f = d / "project.json"
        if not f.exists():
            continue
        try:
            p = json.loads(f.read_text("utf-8"))
        except json.JSONDecodeError:
            continue
        out.append({
            "id": p["id"],
            "title": (p.get("script") or {}).get("title") or p["topic"].get("title") or p["topic"]["label"],
            "label": p["topic"]["label"],
            "category": p["topic"].get("category"),
            "status": p["status"],
            "status_label": STATUS_LABELS.get(p["status"], p["status"]),
            "created_at": p["created_at"],
            "updated_at": p["updated_at"],
            "duration": (p.get("voice") or {}).get("duration"),
            "has_preview": bool((p.get("outputs") or {}).get("preview")),
            "has_export": bool((p.get("outputs") or {}).get("export")),
            "poster": (p.get("outputs") or {}).get("poster"),
            "approved": p.get("approved", False),
        })
    return out


def delete(pid: str) -> None:
    shutil.rmtree(project_dir(pid))
