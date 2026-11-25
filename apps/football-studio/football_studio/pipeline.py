"""Produktionspipeline + Job-Warteschlange (ein Worker-Thread, Renders laufen nacheinander)."""

from __future__ import annotations

import datetime as dt
import queue
import threading
import traceback
import uuid

from . import audio, composer, music, projects, render, research, script, topics, voice
from .config import Settings

# ---- Einzelschritte ----------------------------------------------------------


def _step(pid: str, step: str, status: str, **extra) -> None:
    def f(p):
        p["steps"][step] = {"status": status, "at": dt.datetime.now().isoformat(timespec="seconds"), **extra}

    projects.update(pid, f)


def _set_status(pid: str, status: str) -> None:
    projects.update(pid, lambda p: p.__setitem__("status", status))


def run_research(pid: str) -> None:
    p = projects.load(pid)
    _set_status(pid, "recherche")
    _step(pid, "research", "läuft")
    res = research.research(p["topic"]["qid"], projects.project_dir(pid), Settings.load(), log=lambda m: projects.log(pid, m))
    projects.update(pid, lambda p: p.update(research=res))
    _step(pid, "research", "fertig")


def run_script(pid: str) -> None:
    p = projects.load(pid)
    if not p.get("research"):
        run_research(pid)
        p = projects.load(pid)
    _set_status(pid, "skript")
    _step(pid, "script", "läuft")
    sc = script.generate(p["research"], p["topic"].get("category") or "legende", Settings.load(),
                         p["topic"].get("title"), log=lambda m: projects.log(pid, m))

    def f(p):
        p["script"] = sc.model_dump()
        p["status"] = "freigabe"
        p["approved"] = False
        for s in ("voice", "music", "video", "preview", "export"):
            p["steps"][s] = {"status": "offen"}

    projects.update(pid, f)
    _step(pid, "script", "fertig")


def run_voice(pid: str, force: bool = False) -> None:
    p = projects.load(pid)
    scenes = p["script"]["scenes"]
    if not force and p.get("voice") and p["voice"].get("text_hash") == voice.text_hash(scenes) \
            and (projects.project_dir(pid) / "voice" / "voiceover.wav").exists():
        projects.log(pid, "Voice-over unverändert – wird wiederverwendet")
        return
    _step(pid, "voice", "läuft")
    v = voice.synthesize(scenes, projects.project_dir(pid) / "voice", Settings.load(), log=lambda m: projects.log(pid, m))
    projects.update(pid, lambda p: p.update(voice=v))
    _step(pid, "voice", "fertig")


def run_music(pid: str) -> None:
    p = projects.load(pid)
    s = Settings.load()
    _step(pid, "music", "läuft")
    d = projects.project_dir(pid) / "music"
    d.mkdir(exist_ok=True)
    dur = p["voice"]["duration"] + 1.5
    info = None
    if s.music_source == "library":
        info = music.from_library(dur, pid, d / "music.wav")
        if not info:
            projects.log(pid, "Keine lizenzierte Musik in data/music-library – nutze Eigenkomposition")
    if not info:
        mood = (p.get("music") or {}).get("mood") or music.CATEGORY_MOOD.get(p["topic"].get("category"), "dramatisch")
        info = music.compose(dur, mood, pid, d / "music.wav")
    audio.duck_music(d / "music.wav", projects.project_dir(pid) / "voice" / "voiceover.wav", d / "music_ducked.wav", s.music_volume_db)
    projects.update(pid, lambda p: p.update(music=info))
    projects.log(pid, f"Musik: {info['license']}")
    _step(pid, "music", "fertig")


def run_video(pid: str) -> dict:
    p = projects.load(pid)
    _step(pid, "video", "läuft")
    vd = composer.build(projects.project_dir(pid), p, Settings.load())
    lint = render.lint(vd)
    chk = render.check(vd)
    findings = []
    for sec in ("lint", "runtime", "layout", "motion", "contrast", "craft", "audio"):
        for f in ((chk.get("result") or {}).get(sec) or {}).get("findings") or []:
            if f.get("severity") in ("error", "warning"):
                findings.append({"section": sec, "severity": f["severity"], "code": f.get("code"),
                                 "message": (f.get("message") or "")[:240], "file": f.get("sourceFile")})
    ok = lint["ok"] and chk["ok"]
    projects.log(pid, f"HyperFrames lint {'ok' if lint['ok'] else 'FEHLER'}, check {'ok' if chk['ok'] else 'FEHLER'} "
                      f"({sum(1 for f in findings if f['severity'] == 'error')} Fehler, {sum(1 for f in findings if f['severity'] == 'warning')} Warnungen)")
    projects.update(pid, lambda p: p.update(checks={"ok": ok, "findings": findings[:60]}))
    if not ok:
        _step(pid, "video", "fehler")
        raise RuntimeError("HyperFrames-Prüfung fehlgeschlagen – Details im Reiter „Prüfung“.")
    _step(pid, "video", "fertig")
    return {"ok": ok}


def _thumbs(pid: str, video_file) -> None:
    p = projects.load(pid)
    d = projects.project_dir(pid)
    thumbs = {}
    for t in p["voice"]["scene_times"]:
        mid = t["start"] + min(1.6, (t["end"] - t["start"]) * 0.6)
        out = render.thumbnail(video_file, mid, d / "thumbs" / f"{t['id']}.jpg")
        thumbs[t["id"]] = str(out.relative_to(d))
    poster = render.thumbnail(video_file, 0.0, d / "thumbs" / "poster.jpg")

    def f(p):
        p.setdefault("outputs", {})["thumbs"] = thumbs
        p["outputs"]["poster"] = str(poster.relative_to(d))

    projects.update(pid, f)


def run_preview(pid: str, job=None) -> None:
    _step(pid, "preview", "läuft")
    d = projects.project_dir(pid)
    out = d / "exports" / "preview.mp4"
    render.render(d / "video", out, quality="draft", fps=Settings.load().fps,
                  progress=(lambda pct: job.progress(pct)) if job else None)
    _thumbs(pid, out)

    def f(p):
        p.setdefault("outputs", {})["preview"] = str(out.relative_to(d))
        p["outputs"]["preview_at"] = dt.datetime.now().isoformat(timespec="seconds")
        p["status"] = "vorschau"

    projects.update(pid, f)
    _step(pid, "preview", "fertig")
    projects.log(pid, "Vorschau gerendert")


def run_export(pid: str, job=None) -> None:
    p = projects.load(pid)
    _set_status(pid, "export")
    _step(pid, "export", "läuft")
    d = projects.project_dir(pid)
    if not (d / "video" / "index.html").exists():
        run_video(pid)
    out = d / "exports" / f"{projects.slugify(p['script']['title'])}.mp4"
    render.render(d / "video", out, quality="delivery", fps=Settings.load().fps,
                  progress=(lambda pct: job.progress(pct)) if job else None)

    def f(p):
        p.setdefault("outputs", {})["export"] = str(out.relative_to(d))
        p["outputs"]["export_at"] = dt.datetime.now().isoformat(timespec="seconds")
        p["status"] = "fertig"

    projects.update(pid, f)
    _step(pid, "export", "fertig")
    topics.mark(p["topic"]["qid"], "used", pid)
    projects.log(pid, f"Export fertig: {out.name}")


def produce(pid: str, job=None, preview: bool = True) -> None:
    """Voice-over → Musik → Video → Prüfung → (Vorschau)."""
    _set_status(pid, "produktion")
    run_voice(pid)
    run_music(pid)
    run_video(pid)
    if preview:
        run_preview(pid, job)
    else:
        _set_status(pid, "vorschau")


def prepare(qid: str, label: str | None = None, category: str | None = None) -> str:
    """Neues Projekt aus Thema anlegen, recherchieren und Skript vorbereiten (wartet dann auf Freigabe)."""
    t = topics.get(qid)
    if not t:
        t = topics.add_manual(qid, label or qid, category or "legende")
    p = projects.create(t)
    topics.mark(qid, "used", p["id"])
    run_research(p["id"])
    run_script(p["id"])
    return p["id"]


def daily_run() -> dict:
    s = Settings.load()
    ideas = topics.generate_daily()
    prepared = []
    seen_cats = set()
    for idea in ideas:
        if len(prepared) >= s.auto_prepare_count:
            break
        if idea["status"] == "used" or idea["category"] in seen_cats:
            continue
        try:
            prepared.append(prepare(idea["qid"]))
            seen_cats.add(idea["category"])
        except Exception as e:  # nächstes Thema versuchen
            print(f"Automatisierung: {idea['label']} übersprungen: {e}")
    from . import db

    db.set_meta("last_daily", dt.date.today().isoformat())
    return {"ideas": len(ideas), "prepared": prepared}


# ---- Jobs --------------------------------------------------------------------


class Job:
    def __init__(self, kind: str, pid: str | None, fn, label: str):
        self.id = uuid.uuid4().hex[:10]
        self.kind, self.pid, self.fn, self.label = kind, pid, fn, label
        self.status = "wartend"
        self.pct = 0.0
        self.error: str | None = None
        self.result = None
        self.created = dt.datetime.now().isoformat(timespec="seconds")
        self.finished: str | None = None

    def progress(self, pct: float) -> None:
        self.pct = float(pct)

    def as_dict(self) -> dict:
        return {k: getattr(self, k) for k in ("id", "kind", "pid", "label", "status", "pct", "error", "created", "finished")}


class JobQueue:
    def __init__(self):
        self.q: queue.Queue[Job] = queue.Queue()
        self.jobs: list[Job] = []
        self._t = threading.Thread(target=self._worker, daemon=True, name="fss-worker")
        self._t.start()

    def submit(self, kind: str, pid: str | None, fn, label: str) -> Job:
        for j in self.jobs:
            if j.kind == kind and j.pid == pid and j.status in ("wartend", "läuft"):
                return j  # identischer Job ist schon unterwegs
        job = Job(kind, pid, fn, label)
        self.jobs = (self.jobs + [job])[-100:]
        self.q.put(job)
        return job

    def _worker(self):
        while True:
            job = self.q.get()
            job.status = "läuft"
            try:
                job.result = job.fn(job)
                job.status = "fertig"
                job.pct = 100
            except Exception as e:
                job.status = "fehler"
                job.error = f"{e.__class__.__name__}: {e}"
                traceback.print_exc()
                if job.pid:
                    try:
                        projects.log(job.pid, f"{job.label} fehlgeschlagen: {e}", "error")
                        _set_status(job.pid, "fehler")
                    except Exception:
                        pass
            job.finished = dt.datetime.now().isoformat(timespec="seconds")

    def list(self) -> list[dict]:
        return [j.as_dict() for j in reversed(self.jobs)]


_queue: JobQueue | None = None


def jobs() -> JobQueue:
    global _queue
    if _queue is None:
        _queue = JobQueue()
    return _queue


# ---- Zeitplan ---------------------------------------------------------------


def start_scheduler() -> threading.Thread:
    def loop():
        import time

        from . import db

        while True:
            try:
                s = Settings.load()
                now = dt.datetime.now()
                hh, mm = (int(x) for x in s.daily_run_time.split(":"))
                today = now.date().isoformat()
                if s.automation_enabled and (now.hour, now.minute) >= (hh, mm) and db.get_meta("last_daily") != today:
                    db.set_meta("last_daily", today)  # vor dem Lauf setzen: kein Doppelstart
                    jobs().submit("daily", None, lambda job: daily_run(), "Tägliche Themenrecherche")
            except Exception:
                traceback.print_exc()
            time.sleep(30)

    t = threading.Thread(target=loop, daemon=True, name="fss-scheduler")
    t.start()
    return t
