"""DASHBOARD-Backend (FastAPI). Start: ``python -m football_studio serve``."""

from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from . import db, pipeline, projects, script, topics, voice
from .config import HYPERFRAMES_VERSION, WEB_DIR, Settings, anthropic_available, elevenlabs_key, ensure_dirs
from .speech import count_words

app = FastAPI(title="Football Story Studio")


@app.on_event("startup")
def _startup() -> None:
    ensure_dirs()
    pipeline.jobs()
    pipeline.start_scheduler()


def _project(pid: str) -> dict:
    try:
        return projects.load(pid)
    except (FileNotFoundError, ValueError):
        raise HTTPException(404, "Projekt nicht gefunden")


# ---- Status / Einstellungen ------------------------------------------------


@app.get("/api/status")
def status():
    s = Settings.load()
    return {
        "providers": {"claude": anthropic_available(), "elevenlabs": bool(elevenlabs_key()),
                      "tts_active": voice.provider_for(s),
                      "script_active": "claude" if (s.script_engine != "regelbasiert" and anthropic_available()) else "regelbasiert"},
        "hyperframes": HYPERFRAMES_VERSION,
        "last_daily": db.get_meta("last_daily"),
        "automation": {"enabled": s.automation_enabled, "time": s.daily_run_time, "prepare": s.auto_prepare_count},
        "jobs": pipeline.jobs().list()[:30],
    }


@app.get("/api/settings")
def get_settings():
    from dataclasses import asdict

    return asdict(Settings.load())


@app.put("/api/settings")
def put_settings(values: dict):
    from dataclasses import asdict

    return asdict(Settings.load().update(values))


@app.get("/api/jobs")
def list_jobs():
    return pipeline.jobs().list()


# ---- Themen ------------------------------------------------------------------


@app.get("/api/topics/today")
def topics_today():
    return {"day": __import__("datetime").date.today().isoformat(), "topics": topics.daily(),
            "categories": topics.CATEGORIES}


@app.post("/api/topics/refresh")
def topics_refresh(force: bool = True):
    job = pipeline.jobs().submit("topics", None, lambda j: len(topics.generate_daily(force=force)), "Neue Themenideen suchen")
    return job.as_dict()


@app.post("/api/topics/{qid}/dismiss")
def topic_dismiss(qid: str):
    topics.mark(qid, "dismissed")
    return {"ok": True}


@app.get("/api/topics/search")
def topic_search(q: str):
    from .sources import wikidata as wd

    return wd.search(q, limit=8)


@app.get("/api/topics/history")
def topic_history():
    return topics.history()


# ---- Projekte -------------------------------------------------------------------


class NewProject(BaseModel):
    qid: str
    label: str | None = None
    category: str | None = None


@app.post("/api/projects")
def create_project(body: NewProject):
    t = topics.get(body.qid) or topics.add_manual(body.qid, body.label or body.qid, body.category or "legende")
    p = projects.create(t)
    topics.mark(body.qid, "used", p["id"])

    def run(job):
        pipeline.run_research(p["id"])
        pipeline.run_script(p["id"])

    pipeline.jobs().submit("prepare", p["id"], run, f"Recherche + Skript: {t['label']}")
    return projects.load(p["id"])


@app.get("/api/projects")
def list_projects():
    return projects.list_all()


@app.get("/api/projects/{pid}")
def get_project(pid: str):
    return _project(pid)


@app.delete("/api/projects/{pid}")
def delete_project(pid: str):
    _project(pid)
    projects.delete(pid)
    return {"ok": True}


class ScriptUpdate(BaseModel):
    title: str
    caption: str = ""
    hashtags: list[str] = []
    scenes: list[dict]


@app.put("/api/projects/{pid}/script")
def update_script(pid: str, body: ScriptUpdate):
    p = _project(pid)
    if not p.get("research"):
        raise HTTPException(400, "Noch keine Recherche vorhanden")
    old = p.get("script") or {}
    scenes = []
    for i, sc in enumerate(body.scenes):
        if not str(sc.get("text", "")).strip():
            continue
        scenes.append(script.Scene(id="", text=sc["text"], role=sc.get("role", "story"),
                                   sentence_ids=sc.get("sentence_ids", []), fact_ids=sc.get("fact_ids", []),
                                   visual=sc.get("visual") or {}))
    new = script.Script(title=body.title, caption=body.caption, hashtags=body.hashtags, scenes=scenes,
                        engine=(old.get("engine") or "regelbasiert") + "+bearbeitet")
    new = script.finalize(new, p["research"], Settings.load())

    def f(p):
        p["script"] = new.model_dump()
        p["status"] = "freigabe" if not p.get("approved") else p["status"]
        p["steps"]["video"] = {"status": "veraltet"}
        p["steps"]["preview"] = {"status": "veraltet"}

    projects.update(pid, f)
    projects.log(pid, "Skript manuell bearbeitet")
    return projects.load(pid)


@app.get("/api/projects/{pid}/candidates")
def candidates(pid: str):
    p = _project(pid)
    used = {sid for sc in (p.get("script") or {}).get("scenes", []) for sid in sc.get("sentence_ids", [])}
    out = []
    for s in p["research"]["sentences"]:
        if s["id"] in used or script.PRIVATE.search(s["text"]):
            continue
        txt = script.simplify(s["text"])
        out.append({"id": s["id"], "section": s["section"], "text": txt, "words": count_words(txt),
                    "score": round(script._score(txt, s["section"]), 1), "cites": s["cites"]})
    return out


class SwapBody(BaseModel):
    sentence_id: str | None = None
    visual_type: str | None = None


@app.post("/api/projects/{pid}/scenes/{sid}/swap")
def swap_scene(pid: str, sid: str, body: SwapBody):
    p = _project(pid)
    sc_list = p["script"]["scenes"]
    idx = next((i for i, s in enumerate(sc_list) if s["id"] == sid), None)
    if idx is None:
        raise HTTPException(404, "Szene nicht gefunden")
    scene = script.Scene(**sc_list[idx])
    if body.sentence_id:
        sent = next((s for s in p["research"]["sentences"] if s["id"] == body.sentence_id), None)
        if not sent:
            raise HTTPException(404, "Satz nicht gefunden")
        scene.text = script.simplify(sent["text"])
        scene.sentence_ids = [sent["id"]]
        scene.role = "story"
        scene.visual = {}
    if body.visual_type:
        if body.visual_type not in script.VISUAL_TYPES:
            raise HTTPException(400, "Unbekannter Bildtyp")
        auto = script.auto_visual(scene, p["research"], idx)
        v = auto if auto.get("type") == body.visual_type else {"type": body.visual_type}
        if v["type"] in ("keyword", "pitch") and not v.get("text"):
            v["text"] = script._keyword(scene.text) or script._short_phrase(scene.text)
        if v["type"] in ("stat", "year", "score") and not v.get("value"):
            import re

            m = re.search(r"\d+(?:[,:]\d+)?", scene.text)
            v["value"] = m.group(0) if m else "?"
            v.setdefault("sub", script._keyword(scene.text) or "")
        if v["type"] == "quote" and not v.get("text"):
            v["text"] = script._keyword(scene.text) or script._short_phrase(scene.text)
        v["bg"] = (sc_list[idx].get("visual") or {}).get("bg", "floodlight")
        scene.visual = v
    sc_list[idx] = scene.model_dump()
    body_scenes = sc_list
    return update_script(pid, ScriptUpdate(title=p["script"]["title"], caption=p["script"]["caption"],
                                           hashtags=p["script"]["hashtags"], scenes=body_scenes))


class Regenerate(BaseModel):
    step: str


@app.post("/api/projects/{pid}/regenerate")
def regenerate(pid: str, body: Regenerate):
    _project(pid)
    step = body.step
    if step == "research":
        fn = lambda j: (pipeline.run_research(pid), pipeline.run_script(pid))  # noqa: E731
    elif step == "script":
        fn = lambda j: pipeline.run_script(pid)  # noqa: E731
    elif step == "voice":
        fn = lambda j: (pipeline.run_voice(pid, force=True), pipeline.run_music(pid), pipeline.run_video(pid), pipeline.run_preview(pid, j))  # noqa: E731
    elif step == "video":
        fn = lambda j: pipeline.produce(pid, j)  # noqa: E731
    else:
        raise HTTPException(400, "Unbekannter Schritt")
    job = pipeline.jobs().submit(f"regen-{step}", pid, fn, f"Neu generieren: {step}")
    return job.as_dict()


@app.post("/api/projects/{pid}/approve")
def approve(pid: str):
    p = _project(pid)
    if not p.get("script"):
        raise HTTPException(400, "Kein Skript vorhanden")
    if not p["script"]["validation"]["ok"]:
        raise HTTPException(400, "Das Skript enthält unbelegte Fakten – bitte zuerst korrigieren.")
    projects.update(pid, lambda p: p.update(approved=True))
    projects.log(pid, "Skript freigegeben")
    job = pipeline.jobs().submit("produce", pid, lambda j: pipeline.produce(pid, j, Settings.load().render_preview_after_approval),
                                 f"Produktion: {p['script']['title']}")
    return job.as_dict()


@app.post("/api/projects/{pid}/export")
def export(pid: str):
    p = _project(pid)
    if not p.get("approved"):
        raise HTTPException(400, "Bitte zuerst freigeben")
    job = pipeline.jobs().submit("export", pid, lambda j: pipeline.run_export(pid, j), f"Export MP4: {p['script']['title']}")
    return job.as_dict()


@app.post("/api/automation/run")
def automation_run():
    job = pipeline.jobs().submit("daily", None, lambda j: pipeline.daily_run(), "Tägliche Themenrecherche (manuell)")
    return job.as_dict()


@app.get("/files/{pid}/{path:path}")
def files(pid: str, path: str):
    base = projects.project_dir(pid).resolve()
    f = (base / path).resolve()
    if base not in f.parents or not f.is_file():
        raise HTTPException(404)
    return FileResponse(f)


@app.get("/")
def index():
    return FileResponse(WEB_DIR / "index.html")


app.mount("/static", StaticFiles(directory=str(WEB_DIR)), name="static")
