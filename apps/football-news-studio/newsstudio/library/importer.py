"""Import aus lokalen Ordnern (MAXPPP, PressBox, Eigene) – keine Downloads, keine Logins."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

from .. import db
from ..config import MEDIA_DIR, paths
from . import entities, license, metadata, shots

SOURCE_BY_FOLDER = {"maxppp": "MAXPPP", "pressbox": "PressBox", "eigene": "Eigene"}


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def guess_source(path: Path, meta: dict) -> str:
    for part in path.parts[::-1]:
        if part.lower() in SOURCE_BY_FOLDER:
            return SOURCE_BY_FOLDER[part.lower()]
    blob = " ".join(str(meta.get(k, "")) for k in ("credit", "copyright", "byline", "source_field")).lower()
    if "maxppp" in blob:
        return "MAXPPP"
    if "stats perform" in blob or "pressbox" in blob or "perform" in blob:
        return "PressBox"
    return "Eigene"


def default_profile_id(source: str) -> int | None:
    r = db.one("SELECT id FROM license_profile WHERE source=? ORDER BY confirmed DESC, id LIMIT 1", (source,))
    return r["id"] if r else None


def _link(media_id: int, ent: dict, origin: str, conf: float) -> None:
    db.execute("""INSERT INTO media_entity(media_id, entity_id, origin, confidence) VALUES(?,?,?,?)
                  ON CONFLICT(media_id, entity_id) DO UPDATE SET confidence=MAX(confidence, excluded.confidence)""",
               (media_id, ent["id"], origin, conf))


def link_entities(media_id: int, meta: dict) -> list[dict]:
    linked = []
    for person in meta.get("persons") or []:
        hits = [e for e in entities.find(person) if e["kind"] in ("spieler", "trainer", "funktionaer")]
        if hits:
            ent = hits[0]
        else:  # unbekannte, aber in den Metadaten ausdrücklich genannte Person -> ins Verzeichnis aufnehmen
            eid = entities.upsert("spieler", person.strip())
            ent = db.one("SELECT * FROM entity WHERE id=?", (eid,))
        _link(media_id, ent, "metadaten", 1.0)
        linked.append(ent)
    for team in meta.get("teams") or []:
        for e in entities.find(team)[:1]:
            _link(media_id, e, "metadaten", 1.0)
            linked.append(e)
    text_sources = [
        (" ".join(filter(None, [meta.get("title", ""), meta.get("headline", ""), meta.get("caption", ""),
                                " ".join(meta.get("keywords") or [])])), "metadaten", 0.85),
        (meta.get("filename_text", ""), "dateiname", 0.6),
    ]
    for text, origin, conf in text_sources:
        for e in entities.find(text):
            _link(media_id, e, origin, conf)
            linked.append(e)
    return linked


def import_file(path: Path, source: str | None = None, profile_id: int | None = None, is_test: bool = False,
                log=print) -> dict:
    path = path.resolve()
    digest = sha256(path)
    existing = db.one("SELECT * FROM media WHERE path=?", (str(path),))
    if existing and existing["sha256"] == digest:
        return {"status": "unverändert", "id": existing["id"]}
    dup = db.one("SELECT id, path FROM media WHERE sha256=? AND path<>?", (digest, str(path)))
    if dup:
        return {"status": "duplikat", "id": dup["id"], "of": dup["path"]}
    meta = metadata.read_any(path)
    src = source or guess_source(path, meta)
    pid = profile_id or (existing or {}).get("license_profile_id") or default_profile_id(src)
    comp = meta.get("competition") or ""
    if not comp:
        comps = [e["name"] for e in entities.find(" ".join([meta.get("caption", ""), meta.get("title", ""),
                                                             meta.get("filename_text", "")])) if e["kind"] == "wettbewerb"]
        comp = comps[0] if comps else ""
    row = {
        "path": str(path), "sha256": digest, "kind": meta["kind"], "source": src, "filename": path.name,
        "title": meta.get("headline") or meta.get("title") or "", "caption": meta.get("caption", ""),
        "keywords": ", ".join(meta.get("keywords") or []), "byline": meta.get("byline", ""),
        "credit": meta.get("credit", ""), "copyright": meta.get("copyright", ""), "captured_at": meta.get("captured_at"),
        "competition": comp, "location": " ".join(filter(None, [meta.get("city", ""), meta.get("country", "")])),
        "width": meta.get("width"), "height": meta.get("height"), "duration": meta.get("duration"),
        "license_profile_id": pid, "is_test": int(is_test),
        "raw_meta": json.dumps({k: v for k, v in meta.items() if k != "kind"}, ensure_ascii=False, default=str)[:20000],
    }
    if existing:
        sets = ", ".join(f"{k}=?" for k in row)
        db.execute(f"UPDATE media SET {sets} WHERE id=?", (*row.values(), existing["id"]))
        mid = existing["id"]
        db.execute("DELETE FROM media_entity WHERE media_id=? AND origin<>'manuell'", (mid,))
        db.execute("DELETE FROM shot WHERE media_id=?", (mid,))
    else:
        cols = ", ".join(row)
        mid = db.execute(f"INSERT INTO media({cols}) VALUES({', '.join('?' for _ in row)})", tuple(row.values()))
    linked = link_entities(mid, meta)
    thumbs = paths()["proxies"] / str(mid)
    if meta["kind"] == "video":
        kind = meta.get("clip_type") or "spielszene"
        for i, (a, b) in enumerate(shots.detect(path, meta["duration"] or 0)):
            t = shots.thumbnail(path, (a + b) / 2, thumbs / f"shot{i}.jpg")
            db.execute("INSERT INTO shot(media_id,start,end,kind,thumb) VALUES(?,?,?,?,?)", (mid, a, b, kind, str(t)))
        shots.thumbnail(path, min(1.0, (meta["duration"] or 2) / 2), thumbs / "thumb.jpg")
        shots.proxy(path, thumbs / "proxy.mp4")
    else:
        shots.image_thumbnail(path, thumbs / "thumb.jpg")
    names = sorted({e["name"] for e in linked})
    log(f"Importiert: {path.name} [{src}] – {', '.join(names) or 'keine Personen erkannt'}")
    return {"status": "aktualisiert" if existing else "neu", "id": mid, "entities": names}


def scan(folder: Path | None = None, log=print, is_test: bool = False) -> dict:
    license.ensure_default_profiles()
    entities.seed_static()
    root = folder or MEDIA_DIR
    stats = {"neu": 0, "aktualisiert": 0, "unverändert": 0, "duplikat": 0, "fehler": 0, "fehlerliste": []}
    for p in sorted(root.rglob("*")):
        if not p.is_file() or p.suffix.lower() not in metadata.IMAGE_EXT | metadata.VIDEO_EXT:
            continue
        try:
            r = import_file(p, is_test=is_test, log=log)
            stats[r["status"]] += 1
        except Exception as e:
            stats["fehler"] += 1
            stats["fehlerliste"].append(f"{p.name}: {e}")
            log(f"Fehler bei {p.name}: {e}")
    # Dateien, die nicht mehr existieren, als gesperrt markieren
    for m in db.rows("SELECT id, path FROM media"):
        if not Path(m["path"]).exists():
            db.execute("UPDATE media SET blocked=1, notes='Datei nicht mehr vorhanden' WHERE id=?", (m["id"],))
    return stats
