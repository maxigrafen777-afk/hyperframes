"""Suche in der Medienbibliothek (inkl. Lizenzstatus, Entities, Shots)."""

from __future__ import annotations

from .. import db
from ..config import Settings
from . import entities, license


def enrich(m: dict, settings: Settings | None = None) -> dict:
    m = dict(m)
    m["entities"] = db.rows("""SELECT e.id, e.kind, e.name, e.club, me.origin, me.confidence FROM media_entity me
                               JOIN entity e ON e.id=me.entity_id WHERE me.media_id=? ORDER BY me.confidence DESC""", (m["id"],))
    m["shots"] = db.rows("SELECT * FROM shot WHERE media_id=? ORDER BY start", (m["id"],)) if m["kind"] == "video" else []
    chk = license.check(m, license.profile(m.get("license_profile_id")), settings)
    m["license_status"] = chk["status"]
    m["usable"] = chk["usable"]
    m["license_reasons"] = chk["reasons"]
    m["credit_line"] = chk["license"].get("credit", "")
    m.pop("raw_meta", None)
    return m


def search(q: str = "", kind: str | None = None, source: str | None = None, entity_ids: list[int] | None = None,
           only_usable: bool = False, date_from: str | None = None, date_to: str | None = None,
           competition: str | None = None, limit: int = 300, settings: Settings | None = None) -> list[dict]:
    where, args = ["1=1"], []
    ids = list(entity_ids or [])
    if q:
        hits = entities.find(q)
        if hits:
            ids += [e["id"] for e in hits if e["kind"] != "wettbewerb"]
            comps = [e["name"] for e in hits if e["kind"] == "wettbewerb"]
            if comps and not competition:
                competition = comps[0]
        else:
            like = f"%{q}%"
            where.append("(m.filename LIKE ? OR m.title LIKE ? OR m.caption LIKE ? OR m.keywords LIKE ?)")
            args += [like] * 4
    for eid in ids:
        where.append("EXISTS (SELECT 1 FROM media_entity me WHERE me.media_id=m.id AND me.entity_id=?)")
        args.append(eid)
    if kind:
        where.append("m.kind=?")
        args.append(kind)
    if source:
        where.append("m.source=?")
        args.append(source)
    if competition:
        where.append("m.competition=?")
        args.append(competition)
    if date_from:
        where.append("m.captured_at>=?")
        args.append(date_from)
    if date_to:
        where.append("m.captured_at<=?")
        args.append(date_to)
    rows = db.rows(f"SELECT m.* FROM media m WHERE {' AND '.join(where)} ORDER BY m.captured_at DESC, m.id DESC LIMIT ?",
                   (*args, limit))
    out = [enrich(r, settings) for r in rows]
    if only_usable:
        out = [r for r in out if r["usable"]]
    return out


def stats(settings: Settings | None = None) -> dict:
    allm = [enrich(m, settings) for m in db.rows("SELECT * FROM media")]
    by: dict[str, int] = {}
    for m in allm:
        by[m["license_status"]] = by.get(m["license_status"], 0) + 1
    return {"total": len(allm), "fotos": sum(m["kind"] == "foto" for m in allm),
            "videos": sum(m["kind"] == "video" for m in allm), "status": by,
            "expiring": [{"id": m["id"], "filename": m["filename"], "reasons": m["license_reasons"]}
                         for m in allm if m["license_status"] == "läuft_bald_ab"]}
