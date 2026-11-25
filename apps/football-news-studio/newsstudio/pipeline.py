"""Workflow: Thema → Recherche → Skript → Medien → Voice-over → Schnitt (Vorschau) → Kontrolle → Export."""

from __future__ import annotations

import datetime as dt
import json
import queue
import subprocess
import threading
import traceback
import uuid

from . import projects, voice
from .config import Settings
from .editor import ffmpeg_render, timeline
from .news import research as researchmod
from .script import writer


def _status(pid, s):
    projects.update(pid, lambda p: p.__setitem__("status", s))


def run_research(pid: str) -> None:
    p = projects.load(pid)
    _status(pid, "recherche")
    projects.step(pid, "research", "läuft")
    r = researchmod.research(p["topic"], Settings.load(), log=lambda m: projects.log(pid, m))
    d = projects.pdir(pid) / "research"
    d.mkdir(exist_ok=True)
    (d / "research.json").write_text(json.dumps(r, ensure_ascii=False, indent=1), "utf-8")
    projects.update(pid, lambda p: p.update(research=r))
    projects.step(pid, "research", "fertig")


def run_script(pid: str) -> None:
    p = projects.load(pid)
    _status(pid, "skript")
    projects.step(pid, "script", "läuft")
    sc = writer.generate(p["research"], Settings.load(), log=lambda m: projects.log(pid, m))
    projects.update(pid, lambda p: p.update(script=sc.model_dump()))
    projects.step(pid, "script", "fertig")


def estimate_voice(script: dict) -> dict:
    """Grobe Zeiten aus Wortzahl – für die Medienvorschau vor dem Voice-over."""
    from .speech import count_words

    t, times, words = 0.15, [], []
    for sc in script["scenes"]:
        d = count_words(sc["text"]) / writer.WPS + 0.3
        times.append({"id": sc["id"], "start": round(t, 2), "end": round(t + d, 2)})
        t += d
    return {"duration": t + 0.3, "scene_times": times, "words": words}


def run_media(pid: str) -> dict:
    p = projects.load(pid)
    projects.step(pid, "media", "läuft")
    v = p.get("voice") if p.get("voice") and p["voice"].get("text_hash") == voice.engine.text_hash(p["script"]["scenes"]) \
        else estimate_voice(p["script"])
    tl = timeline.plan(p["script"], v, Settings.load(), p.get("overrides"))
    projects.update(pid, lambda p: p.update(timeline=tl))
    for w in tl["warnings"]:
        projects.log(pid, f"Warnung {w['scene']}: {w['message']}", "warn")
    projects.log(pid, f"Medienzuordnung: {len(tl['cuts'])} Schnitte, Videoanteil {int(tl['video_share'] * 100)} %")
    projects.step(pid, "media", "fertig", warnings=len(tl["warnings"]))
    return tl


def run_voice(pid: str, force: bool = False) -> None:
    p = projects.load(pid)
    if not force and p.get("voice") and p["voice"].get("text_hash") == voice.engine.text_hash(p["script"]["scenes"]):
        projects.log(pid, "Voice-over unverändert – wiederverwendet")
        return
    _status(pid, "stimme")
    projects.step(pid, "voice", "läuft")
    v = voice.synthesize(p["script"]["scenes"], projects.pdir(pid) / "voice", Settings.load(), log=lambda m: projects.log(pid, m))
    projects.update(pid, lambda p: p.update(voice=v))
    projects.step(pid, "voice", "fertig")


def _poster(pid: str, video) -> None:
    out = projects.pdir(pid) / "exports" / "poster.jpg"
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", "0.6", "-i", str(video), "-frames:v", "1", "-vf", "scale=360:-2", str(out)], check=True)
    projects.update(pid, lambda p: p.setdefault("outputs", {}).__setitem__("poster", "exports/poster.jpg"))


def run_render(pid: str, job=None, final: bool = False) -> None:
    p = projects.load(pid)
    _status(pid, "export" if final else "schnitt")
    step = "export" if final else "render"
    projects.step(pid, step, "läuft")
    res = ffmpeg_render.render(projects.pdir(pid), p["script"], p["voice"], Settings.load(), preview=not final,
                               overrides=p.get("overrides"), log=lambda m: projects.log(pid, m),
                               progress=(job.progress if job else None))
    rel = "exports/final.mp4" if final else "exports/preview.mp4"

    def f(p):
        p.setdefault("outputs", {})["final" if final else "preview"] = rel
        p["outputs"][("final" if final else "preview") + "_at"] = dt.datetime.now().isoformat(timespec="seconds")
        p["timeline"] = res["timeline"]
        p["status"] = "fertig" if final else "kontrolle"

    projects.update(pid, f)
    _poster(pid, projects.pdir(pid) / rel)
    projects.step(pid, step, "fertig")


def run_all(pid: str, job=None) -> None:
    """Kompletter Ablauf bis zur Vorschau (danach kontrollierst du und exportierst)."""
    run_research(pid)
    run_script(pid)
    run_media(pid)
    run_voice(pid)
    run_render(pid, job)


# ---- Jobs -------------------------------------------------------------------------


class Job:
    def __init__(self, kind, pid, fn, label):
        self.id, self.kind, self.pid, self.fn, self.label = uuid.uuid4().hex[:10], kind, pid, fn, label
        self.status, self.pct, self.error, self.finished = "wartend", 0.0, None, None
        self.created = dt.datetime.now().isoformat(timespec="seconds")

    def progress(self, pct):
        self.pct = float(pct)

    def as_dict(self):
        return {k: getattr(self, k) for k in ("id", "kind", "pid", "label", "status", "pct", "error", "created", "finished")}


class JobQueue:
    def __init__(self):
        self.q, self.jobs = queue.Queue(), []
        threading.Thread(target=self._work, daemon=True).start()

    def submit(self, kind, pid, fn, label):
        for j in self.jobs:
            if j.kind == kind and j.pid == pid and j.status in ("wartend", "läuft"):
                return j
        j = Job(kind, pid, fn, label)
        self.jobs = (self.jobs + [j])[-100:]
        self.q.put(j)
        return j

    def _work(self):
        while True:
            j = self.q.get()
            j.status = "läuft"
            try:
                j.fn(j)
                j.status, j.pct = "fertig", 100
            except Exception as e:
                j.status, j.error = "fehler", f"{e}"[:600]
                traceback.print_exc()
                if j.pid:
                    try:
                        projects.log(j.pid, f"{j.label} fehlgeschlagen: {e}", "error")
                        _status(j.pid, "fehler")
                    except Exception:
                        pass
            j.finished = dt.datetime.now().isoformat(timespec="seconds")

    def list(self):
        return [j.as_dict() for j in reversed(self.jobs)]


_q = None


def jobs() -> JobQueue:
    global _q
    if _q is None:
        _q = JobQueue()
    return _q
