"""Automatische Szenenzuordnung: passende LIZENZIERTE Medien je Sprechertext.

Bewertet jede verwendbare Datei (und bei Videos jeden Shot) nach Person, Verein im Kontext,
Medientyp, Aktualität und Vielfalt. Ohne passendes Material gibt es eine Warnung + Grafik.
"""

from __future__ import annotations

import datetime as dt
import re

from .. import db
from ..config import Settings
from ..library import entities, license

QUOTE = re.compile(r"\b(sagte|sagt|erklärte|erklärt|betonte|betont|so\b.*:|meinte|kündigte|verriet|stellte klar|"
                   r"äußerte|Interview|Pressekonferenz|PK)\b", re.I)
TRAINING = re.compile(r"\b(Training|trainiert|Trainingsgelände|Säbener)\w*", re.I)
ACTION = re.compile(r"\b(Tor|Tore|traf|trifft|Treffer|Spiel|Sieg|Niederlage|Assist|Elfmeter|Doppelpack|Hattrick|"
                    r"Torjäger|Stürmer|Saison|Partie|Comeback|verletzt|Verletzung)\w*", re.I)


def scene_context(text: str) -> dict:
    ents = entities.find(text)
    persons = [e for e in ents if e["kind"] in ("spieler", "trainer", "funktionaer")]
    clubs = [e for e in ents if e["kind"] == "verein"]
    comps = [e for e in ents if e["kind"] == "wettbewerb"]
    ctx_clubs = [c["name"] for c in clubs] or [p["club"] for p in persons[:1] if p.get("club")]
    if QUOTE.search(text):
        want = "interview"
    elif TRAINING.search(text):
        want = "training"
    elif ACTION.search(text):
        want = "spielszene"
    else:
        want = None
    return {"persons": persons, "clubs": clubs, "context_clubs": ctx_clubs, "competitions": comps, "want": want}


def _usable_media(settings: Settings) -> list[dict]:
    out = []
    for m in db.rows("SELECT * FROM media WHERE blocked=0"):
        chk = license.check(m, license.profile(m.get("license_profile_id")), settings)
        if chk["usable"]:
            m["credit_line"] = chk["license"]["credit"]
            m["entity_ids"] = {r["entity_id"]: r["confidence"] for r in
                               db.rows("SELECT entity_id, confidence FROM media_entity WHERE media_id=?", (m["id"],))}
            m["entity_names"] = {r["name"] for r in db.rows(
                "SELECT e.name FROM media_entity me JOIN entity e ON e.id=me.entity_id WHERE me.media_id=? AND e.kind='verein'",
                (m["id"],))}
            m["shots"] = db.rows("SELECT * FROM shot WHERE media_id=? AND enabled=1 ORDER BY start", (m["id"],))
            out.append(m)
    return out


def score(m: dict, ctx: dict, shot: dict | None, used_media: set, used_shots: set, today: dt.date) -> tuple[float, list[str]]:
    s, why = 0.0, []
    persons = ctx["persons"]
    if persons:
        main = persons[0]
        conf = m["entity_ids"].get(main["id"])
        if conf:
            s += 50 * conf
            why.append(f"zeigt {main['name']}")
        else:
            return -1e9, ["Hauptperson nicht abgebildet"]
        for p in persons[1:]:
            if p["id"] in m["entity_ids"]:
                s += 12
                why.append(f"+ {p['name']}")
    else:
        hit = [c for c in ctx["clubs"] if c["id"] in m["entity_ids"]]
        if not hit:
            return -1e9, ["kein Bezug"]
        s += 30
        why.append(f"Verein {hit[0]['name']}")
    # Verein im Kontext (Kane im Bayern-Trikot statt Tottenham)
    caption = f"{m.get('caption', '')} {m.get('title', '')} {m.get('keywords', '')}"
    clubs_in_media = set(m["entity_names"]) | {c["name"] for c in entities.find(caption) if c["kind"] == "verein"}
    if ctx["context_clubs"]:
        if clubs_in_media & set(ctx["context_clubs"]):
            s += 22
            why.append("richtiger Verein")
        elif clubs_in_media:
            s -= 30
            why.append(f"anderer Verein ({', '.join(sorted(clubs_in_media))})")
    # Medientyp
    if m["kind"] == "video":
        s += 10
        if shot and ctx["want"] and shot.get("kind") == ctx["want"]:
            s += 15
            why.append(f"passender Clip ({ctx['want']})")
        elif shot and ctx["want"] and shot.get("kind") != ctx["want"]:
            s -= 4
    # Aktualität
    if m.get("captured_at"):
        try:
            age = (today - dt.date.fromisoformat(m["captured_at"][:10])).days
            s += max(0.0, 12 - age / 30)
            if age > 365:
                why.append("ältere Aufnahme")
        except ValueError:
            pass
    # Vielfalt
    if m["id"] in used_media:
        s -= 35 if m["kind"] == "foto" else 15
    if shot and shot["id"] in used_shots:
        s -= 60
    # Technik
    if (m.get("width") or 0) >= 1080 or (m.get("height") or 0) >= 1080:
        s += 2
    return s, why


def candidates(text: str, settings: Settings | None = None, used_media: set | None = None, used_shots: set | None = None,
               media: list[dict] | None = None, today: dt.date | None = None) -> dict:
    settings = settings or Settings.load()
    ctx = scene_context(text)
    media = media if media is not None else _usable_media(settings)
    today = today or dt.date.today()
    used_media, used_shots = used_media or set(), used_shots or set()
    opts = []
    for m in media:
        for shot in (m["shots"] or [None]) if m["kind"] == "video" else [None]:
            sc, why = score(m, ctx, shot, used_media, used_shots, today)
            if sc <= -1e8:
                continue
            opts.append({"media_id": m["id"], "kind": m["kind"], "filename": m["filename"], "path": m["path"],
                         "shot": shot, "score": round(sc, 1), "why": why, "credit": m["credit_line"],
                         "focus_x": m.get("focus_x") or 0.5, "focus_y": m.get("focus_y") or 0.4,
                         "width": m.get("width"), "height": m.get("height"), "duration": m.get("duration")})
    opts.sort(key=lambda o: -o["score"])
    warnings = []
    if ctx["persons"] and not opts:
        name = ctx["persons"][0]["name"]
        total = db.one("""SELECT COUNT(*) n FROM media_entity me JOIN entity e ON e.id=me.entity_id WHERE e.id=?""",
                       (ctx["persons"][0]["id"],))["n"]
        warnings.append(f"Kein lizenziertes Material von {name}" + (f" ({total} Datei(en) vorhanden, aber nicht freigegeben)" if total else ""))
    elif ctx["persons"] and opts and not any(o["kind"] == "video" for o in opts):
        warnings.append(f"Keine lizenzierten Videos von {ctx['persons'][0]['name']} – nur Fotos")
    if not ctx["persons"] and ctx["clubs"] and not opts:
        warnings.append(f"Kein lizenziertes Material zu {ctx['clubs'][0]['name']}")
    if not ctx["persons"] and not ctx["clubs"]:
        warnings.append("Keine Person/kein Verein im Satz erkannt – Grafik wird verwendet")
    return {"context": {"persons": [p["name"] for p in ctx["persons"]], "clubs": ctx["context_clubs"], "want": ctx["want"]},
            "options": opts, "warnings": warnings}
