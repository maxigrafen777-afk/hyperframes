"""Dashboard-API (FastAPI). Start: python -m newsstudio serve"""

from __future__ import annotations

import datetime as dt
import shutil
import time
from dataclasses import asdict
from pathlib import Path

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from . import db, pipeline, projects, voice
from .config import MEDIA_DIR, WEB_DIR, Settings, anthropic_available, ensure_dirs
from .library import entities, importer, license, metadata, search
from .news import research as researchmod
from .scenes import matcher
from .script import writer

app = FastAPI(title="Football News Studio")
_trend_cache: dict = {"at": 0, "data": None}


@app.on_event("startup")
def _startup():
    ensure_dirs()
    license.ensure_default_profiles()
    entities.seed_static()
    pipeline.jobs()
    if not db.get_meta("entities_synced"):
        pipeline.jobs().submit("entities", None, lambda j: entities.sync_wikidata(log=lambda m: None),
                               "Spieler-/Vereinsverzeichnis laden (Wikidata)")


def _p(pid: str) -> dict:
    try:
        return projects.load(pid)
    except (FileNotFoundError, ValueError):
        raise HTTPException(404, "Projekt nicht gefunden")


# ---- Status & Einstellungen ------------------------------------------------------


@app.get("/api/status")
def status():
    s = Settings.load()
    return {"claude": anthropic_available(), "script_engine": "claude" if anthropic_available() and s.script_engine != "briefing" else "briefing",
            "tts": voice.active_provider(s), "voices": voice.NEWS_VOICES, "providers": voice.PROVIDERS,
            "library": search.stats(s), "entities_synced": db.get_meta("entities_synced"),
            "jobs": pipeline.jobs().list()[:30]}


@app.get("/api/settings")
def get_settings():
    d = asdict(Settings.load())
    d.pop("target_seconds", None)
    return d


@app.put("/api/settings")
def put_settings(values: dict):
    Settings.load().update(values)
    return get_settings()


@app.get("/api/jobs")
def jobs():
    return pipeline.jobs().list()


# ---- Aktuelle Themen -------------------------------------------------------------


@app.get("/api/trending")
def trending(refresh: bool = False):
    if refresh or not _trend_cache["data"] or time.time() - _trend_cache["at"] > 1200:
        _trend_cache["data"] = researchmod.trending(Settings.load(), log=lambda m: None)
        _trend_cache["at"] = time.time()
    return {"at": dt.datetime.fromtimestamp(_trend_cache["at"]).isoformat(timespec="minutes"), "topics": _trend_cache["data"]}


# ---- Projekte --------------------------------------------------------------------


class NewVideo(BaseModel):
    topic: str
    auto: bool = True


@app.post("/api/projects")
def create(body: NewVideo):
    if len(body.topic.strip()) < 3:
        raise HTTPException(400, "Bitte ein Thema eingeben")
    p = projects.create(body.topic.strip())
    fn = (lambda j: pipeline.run_all(p["id"], j)) if body.auto else (lambda j: (pipeline.run_research(p["id"]), pipeline.run_script(p["id"])))
    pipeline.jobs().submit("all", p["id"], fn, f"Neues Video: {body.topic[:60]}")
    return p


@app.get("/api/projects")
def list_projects():
    return projects.list_all()


@app.get("/api/projects/{pid}")
def get_project(pid: str):
    return _p(pid)


@app.delete("/api/projects/{pid}")
def delete_project(pid: str):
    _p(pid)
    projects.delete(pid)
    return {"ok": True}


class ScriptBody(BaseModel):
    title: str
    caption: str = ""
    hashtags: list[str] = []
    scenes: list[dict]


@app.put("/api/projects/{pid}/script")
def put_script(pid: str, body: ScriptBody):
    p = _p(pid)
    scenes = [writer.Scene(**{k: v for k, v in sc.items() if k in writer.Scene.model_fields}) for sc in body.scenes if str(sc.get("text", "")).strip()]
    sc = writer.Script(title=body.title, caption=body.caption, hashtags=body.hashtags, scenes=scenes,
                       engine=(p.get("script") or {}).get("engine", "briefing").split("+")[0] + "+bearbeitet")
    sc = writer.finalize(sc, p["research"], Settings.load())

    def f(p):
        p["script"] = sc.model_dump()
        for s in ("media", "render", "export"):
            p["steps"][s] = {"status": "veraltet"}

    projects.update(pid, f)
    projects.log(pid, "Skript bearbeitet")
    pipeline.run_media(pid)
    return projects.load(pid)


@app.get("/api/projects/{pid}/scenes/{sid}/candidates")
def scene_candidates(pid: str, sid: str):
    p = _p(pid)
    sc = next((s for s in p["script"]["scenes"] if s["id"] == sid), None)
    if not sc:
        raise HTTPException(404)
    r = matcher.candidates(sc["text"], Settings.load())
    r["options"] = r["options"][:40]
    return r


class Override(BaseModel):
    key: str  # "<scene>#<index>"
    media_id: int | None = None
    shot_id: int | None = None


@app.put("/api/projects/{pid}/overrides")
def set_override(pid: str, body: Override):
    _p(pid)

    def f(p):
        if body.media_id is None:
            p["overrides"].pop(body.key, None)
        else:
            p["overrides"][body.key] = {"media_id": body.media_id, "shot_id": body.shot_id}
        p["steps"]["render"] = {"status": "veraltet"}

    projects.update(pid, f)
    pipeline.run_media(pid)
    return projects.load(pid)


class Step(BaseModel):
    step: str


@app.post("/api/projects/{pid}/run")
def run_step(pid: str, body: Step):
    _p(pid)
    fns = {
        "research": lambda j: (pipeline.run_research(pid), pipeline.run_script(pid), pipeline.run_media(pid)),
        "script": lambda j: (pipeline.run_script(pid), pipeline.run_media(pid)),
        "media": lambda j: pipeline.run_media(pid),
        "voice": lambda j: pipeline.run_voice(pid, force=True),
        "preview": lambda j: (pipeline.run_voice(pid), pipeline.run_media(pid), pipeline.run_render(pid, j)),
        "export": lambda j: (pipeline.run_voice(pid), pipeline.run_render(pid, j, final=True)),
    }
    if body.step not in fns:
        raise HTTPException(400, "unbekannter Schritt")
    labels = {"research": "Neu recherchieren", "script": "Skript neu", "media": "Medien neu zuordnen", "voice": "Voice-over neu",
              "preview": "Vorschau rendern", "export": "Export MP4"}
    return pipeline.jobs().submit(body.step, pid, fns[body.step], labels[body.step]).as_dict()


@app.get("/files/{pid}/{path:path}")
def files(pid: str, path: str):
    base = projects.pdir(pid).resolve()
    f = (base / path).resolve()
    if base not in f.parents or not f.is_file():
        raise HTTPException(404)
    return FileResponse(f)


# ---- Medienbibliothek -----------------------------------------------------------


@app.get("/api/media")
def media_list(q: str = "", kind: str | None = None, source: str | None = None, only_usable: bool = False,
               status: str | None = None, limit: int = 300):
    res = search.search(q, kind or None, source or None, only_usable=only_usable, limit=limit)
    if status:
        res = [m for m in res if m["license_status"] == status]
    return res


@app.get("/api/media/stats")
def media_stats():
    return search.stats()


@app.get("/api/media/{mid}")
def media_get(mid: int):
    m = db.one("SELECT * FROM media WHERE id=?", (mid,))
    if not m:
        raise HTTPException(404)
    return search.enrich(m)


MEDIA_EDITABLE = {"title", "caption", "competition", "captured_at", "license_profile_id", "lic_platforms", "lic_commercial",
                  "lic_valid_until", "lic_credit", "blocked", "focus_x", "focus_y", "notes", "byline"}


@app.put("/api/media/{mid}")
def media_put(mid: int, values: dict):
    vals = {k: (None if v == "" else v) for k, v in values.items() if k in MEDIA_EDITABLE}
    if vals:
        db.execute(f"UPDATE media SET {', '.join(f'{k}=?' for k in vals)} WHERE id=?", (*vals.values(), mid))
    for name in values.get("add_entities", []) or []:
        hits = entities.find(name)
        eid = hits[0]["id"] if hits else entities.upsert(values.get("entity_kind", "spieler"), name.strip())
        db.execute("INSERT OR REPLACE INTO media_entity(media_id, entity_id, origin, confidence) VALUES(?,?,?,1.0)",
                   (mid, eid, "manuell"))
    for eid in values.get("remove_entities", []) or []:
        db.execute("DELETE FROM media_entity WHERE media_id=? AND entity_id=?", (mid, int(eid)))
    for sh in values.get("shots", []) or []:
        db.execute("UPDATE shot SET kind=?, enabled=?, start=?, end=? WHERE id=? AND media_id=?",
                   (sh["kind"], int(sh.get("enabled", 1)), float(sh["start"]), float(sh["end"]), int(sh["id"]), mid))
    return media_get(mid)


@app.post("/api/media/scan")
def media_scan():
    return pipeline.jobs().submit("scan", None, lambda j: importer.scan(log=lambda m: None), "Medienordner einlesen").as_dict()


@app.post("/api/media/upload")
async def media_upload(source: str = Form(...), files: list[UploadFile] = File(...)):
    folder = {"MAXPPP": "maxppp", "PressBox": "pressbox"}.get(source, "eigene")
    target = MEDIA_DIR / folder
    target.mkdir(parents=True, exist_ok=True)
    saved = []
    for f in files:
        name = Path(f.filename or "datei").name
        if Path(name).suffix.lower() not in metadata.IMAGE_EXT | metadata.VIDEO_EXT | {".xml", ".json", ".csv", ".txt"}:
            continue
        with open(target / name, "wb") as out:
            shutil.copyfileobj(f.file, out)
        saved.append(name)
    job = pipeline.jobs().submit("scan", None, lambda j: importer.scan(log=lambda m: None), "Hochgeladene Medien importieren")
    return {"saved": saved, "job": job.as_dict()}


@app.get("/media-files/{mid}/{what}")
def media_file(mid: int, what: str, shot: int | None = None):
    from .config import paths

    m = db.one("SELECT path FROM media WHERE id=?", (mid,))
    if not m:
        raise HTTPException(404)
    base = paths()["proxies"] / str(mid)
    f = {"thumb": base / "thumb.jpg", "proxy": base / "proxy.mp4", "shot": base / f"shot{shot or 0}.jpg"}.get(what)
    if what == "original":
        f = Path(m["path"])
    if not f or not f.exists():
        raise HTTPException(404)
    return FileResponse(f)


@app.get("/api/shots/{shot_id}/thumb")
def shot_thumb(shot_id: int):
    s = db.one("SELECT thumb FROM shot WHERE id=?", (shot_id,))
    if not s or not s["thumb"] or not Path(s["thumb"]).exists():
        raise HTTPException(404)
    return FileResponse(s["thumb"])


# ---- Lizenzen & Entities ------------------------------------------------------------


@app.get("/api/licenses")
def licenses():
    out = []
    for p in db.rows("SELECT * FROM license_profile ORDER BY id"):
        p["files"] = db.one("SELECT COUNT(*) n FROM media WHERE license_profile_id=?", (p["id"],))["n"]
        out.append(p)
    return out


@app.post("/api/licenses")
def license_new(values: dict):
    return {"id": license.save_profile(values)}


@app.put("/api/licenses/{lid}")
def license_put(lid: int, values: dict):
    license.save_profile(values, lid)
    return {"ok": True}


@app.get("/api/entities")
def entity_list(q: str = "", kind: str | None = None, limit: int = 100):
    like = f"%{q}%"
    sql = "SELECT e.*, (SELECT COUNT(*) FROM media_entity me WHERE me.entity_id=e.id) AS media FROM entity e WHERE (name LIKE ? OR aliases LIKE ?)"
    args: list = [like, like]
    if kind:
        sql += " AND kind=?"
        args.append(kind)
    return db.rows(sql + " ORDER BY media DESC, name LIMIT ?", (*args, limit))


@app.post("/api/entities/sync")
def entity_sync():
    return pipeline.jobs().submit("entities", None, lambda j: entities.sync_wikidata(log=lambda m: None),
                                  "Spieler-/Vereinsverzeichnis aktualisieren").as_dict()


@app.get("/")
def index():
    return FileResponse(WEB_DIR / "index.html")


app.mount("/static", StaticFiles(directory=str(WEB_DIR)), name="static")
