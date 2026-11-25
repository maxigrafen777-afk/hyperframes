"""RECHERCHE: sammelt Fakten aus seriösen Quellen, gleicht sie ab und speichert Belege.

Quellen
  * Wikidata (strukturierte Daten, Revisions-ID wird gespeichert)
  * deutschsprachige Wikipedia (Fließtext + Infobox + Einzelnachweise je Satz)
  * englischsprachige Wikipedia (Gegenprüfung von Daten)
Jeder Rohtext wird als Schnappschuss mit SHA-256 im Projekt abgelegt, damit
jede Aussage später nachprüfbar bleibt.
"""

from __future__ import annotations

import datetime as dt
import hashlib
import json
import re
import unicodedata
from pathlib import Path

from .config import Settings
from .sources import commons
from .sources import wikidata as wd
from .sources import wikipedia as wp

MONTHS_DE = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September",
             "Oktober", "November", "Dezember"]


def format_date_de(iso: str | None) -> str | None:
    if not iso:
        return None
    parts = iso.split("-")
    if len(parts) == 3:
        return f"{int(parts[2])}. {MONTHS_DE[int(parts[1]) - 1]} {parts[0]}"
    if len(parts) == 2:
        return f"{MONTHS_DE[int(parts[1]) - 1]} {parts[0]}"
    return parts[0]


def _norm(s: str | None) -> str:
    s = unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", " ", s).strip()


def _snapshot(project_dir: Path, name: str, content: str, url: str, title: str, kind: str, extra: dict | None = None) -> dict:
    src_dir = project_dir / "research" / "sources"
    src_dir.mkdir(parents=True, exist_ok=True)
    path = src_dir / name
    path.write_text(content, "utf-8")
    return {
        "id": name.split(".")[0],
        "kind": kind,
        "title": title,
        "url": url,
        "retrieved_at": dt.datetime.now().isoformat(timespec="seconds"),
        "sha256": hashlib.sha256(content.encode()).hexdigest(),
        "file": str(path.relative_to(project_dir)),
        **(extra or {}),
    }


def _compare(values: dict[str, str | None], key: str, label: str, display=None, match=None) -> dict | None:
    """Vergleicht einen Wert über mehrere Quellen. Status: verifiziert | einzelquelle | widerspruch."""
    present = {k: v for k, v in values.items() if v}
    if not present:
        return None
    match = match or (lambda a, b: a == b)
    items = list(present.items())
    ref_src, ref_val = items[0]
    # Bevorzugt den Wert, den die meisten Quellen bestätigen
    best, best_agree = ref_val, []
    for _, v in items:
        agree = [s for s, w in items if match(v, w)]
        if len(agree) > len(best_agree):
            best, best_agree = v, agree
    disagree = [s for s, w in items if not match(best, w)]
    status = "verifiziert" if len(best_agree) >= 2 and not disagree else (
        "widerspruch" if disagree else "einzelquelle")
    return {
        "id": key,
        "label": label,
        "value": best,
        "display": display(best) if display else best,
        "sources": best_agree,
        "conflicts": {s: present[s] for s in disagree},
        "status": status,
    }


def _date_match(a: str, b: str) -> bool:
    # Jahr-genaue Angaben bestätigen ein volles Datum nicht – nur gleiche Präzision zählt
    return a == b


def _place_match(a: str, b: str) -> bool:
    na, nb = _norm(a), _norm(b)
    return bool(na and nb and (na == nb or na in nb or nb in na))


def _team_key(name: str) -> str:
    n = _norm(name)
    n = re.sub(r"\b(fc|sv|vfl|vfb|tsv|bv|ac|as|ssc|sc|fk|cf|afc|1|04|09|05)\b", " ", n)
    return re.sub(r"\s+", " ", n).strip()


def _team_match(a: str, b: str) -> bool:
    ka, kb = _team_key(a), _team_key(b)
    return bool(ka and kb and (ka == kb or ka in kb or kb in ka))


def research(qid: str, project_dir: Path, settings: Settings | None = None, log=print) -> dict:
    settings = settings or Settings.load()
    ent, ent_meta = wd.entity(qid)
    qid = ent.get("id", qid)
    sources: list[dict] = []
    sources.append(_snapshot(
        project_dir, f"wikidata_{qid}.json", json.dumps(ent, ensure_ascii=False, indent=1),
        f"https://www.wikidata.org/wiki/{qid}", f"Wikidata {qid}", "wikidata",
        {"revision": ent.get("lastrevid"), "permalink": f"https://www.wikidata.org/w/index.php?oldid={ent.get('lastrevid')}"},
    ))
    log(f"Wikidata {qid} geladen (Revision {ent.get('lastrevid')})")

    label = (ent.get("labels", {}).get("de") or ent.get("labels", {}).get("en") or {}).get("value", qid)
    description = (ent.get("descriptions", {}).get("de") or {}).get("value", "")
    is_person = "Q5" in wd.items(ent, "P31")

    de_title = wd.sitelink_title(ent, "dewiki")
    if not de_title:
        raise RuntimeError(f"{label} hat keinen deutschen Wikipedia-Artikel – zu wenig belastbare Quellen.")
    de_text, de_meta = wp.fetch_raw(de_title, "de")
    sources.append(_snapshot(project_dir, "dewiki.wikitext", de_text, de_meta["page_url"],
                             f"Wikipedia (de): {de_meta['title']}", "wikipedia"))
    log(f"Wikipedia-Artikel „{de_meta['title']}“ geladen ({len(de_text)} Zeichen)")
    box = wp.infobox(de_text)
    art = wp.article(de_text)

    en_box: dict = {}
    en_title = wd.sitelink_title(ent, "enwiki")
    if en_title:
        try:
            en_text, en_meta = wp.fetch_raw(en_title, "en")
            sources.append(_snapshot(project_dir, "enwiki.wikitext", en_text, en_meta["page_url"],
                                     f"Wikipedia (en): {en_meta['title']}", "wikipedia"))
            en_box = wp.infobox(en_text)
        except Exception as e:  # Gegenprüfung optional
            log(f"Englische Wikipedia nicht erreichbar: {e}")

    # Belege aus dem Artikel (Einzelnachweise) als zusätzliche Quellen
    for i, c in enumerate(art["citations"]):
        sources.append({"id": f"ref{i}", "kind": "einzelnachweis", "title": c["title"], "url": c["url"],
                        "work": c.get("work"), "via": "dewiki"})

    # Labels referenzierter Entitäten
    stints = wd.team_stints(ent)
    ref_ids = [s["team_qid"] for s in stints]
    for p in ("P19", "P20", "P413", "P27", "P1532"):
        ref_ids += wd.items(ent, p)
    labels = wd.labels(ref_ids) if ref_ids else {}

    facts: list[dict] = []

    def add(f):
        if f:
            facts.append(f)

    if is_person:
        wd_birth = wd.first_time(ent, "P569")
        add(_compare({
            "wikidata": wd_birth["iso"] if wd_birth else None,
            "dewiki": wp.parse_german_date(box.get("geburtstag", "")) if box.get("geburtstag") else None,
            "enwiki": wp.parse_en_date(en_box.get("birth_date", "")) if en_box.get("birth_date") else None,
        }, "geburtsdatum", "Geburtsdatum", format_date_de, _date_match))
        wd_death = wd.first_time(ent, "P570")
        add(_compare({
            "wikidata": wd_death["iso"] if wd_death else None,
            "dewiki": wp.parse_german_date(box.get("sterbedatum", "")) if wp.parse_german_date(box.get("sterbedatum", "") or "") else None,
            "enwiki": wp.parse_en_date(en_box.get("death_date", "")) if en_box.get("death_date") else None,
        }, "sterbedatum", "Sterbedatum", format_date_de, _date_match))
        bp = wd.first_item(ent, "P19")
        add(_compare({
            "wikidata": labels.get(bp) if bp else None,
            "dewiki": wp._wikilink_text(box["geburtsort"]) if box.get("geburtsort") else None,
        }, "geburtsort", "Geburtsort", match=_place_match))
        dp = wd.first_item(ent, "P20")
        add(_compare({
            "wikidata": labels.get(dp) if dp else None,
            "dewiki": wp._wikilink_text(box["sterbeort"]) if box.get("sterbeort") else None,
        }, "sterbeort", "Sterbeort", match=_place_match))
        # Position: Bezeichnungen unterscheiden sich je Sprache stark -> nur Wikipedia, Wikidata als Zusatz
        pos = wd.first_item(ent, "P413")
        if box.get("position"):
            add({"id": "position", "label": "Position", "value": wp._plain(box["position"]),
                 "display": wp._plain(box["position"]), "sources": ["dewiki"], "conflicts": {},
                 "status": "einzelquelle", "note": f"Wikidata: {labels.get(pos)}" if pos else ""})
        if box.get("größe"):
            add({"id": "groesse", "label": "Größe", "value": wp._plain(box["größe"]), "display": wp._plain(box["größe"]),
                 "sources": ["dewiki"], "conflicts": {}, "status": "einzelquelle"})

        # Vereinsstationen: Wikipedia-Infobox gegen Wikidata P54
        club_rows = [s for s in wp.stations(box, "vereine") if s["team"]]
        wd_club_stints = [s | {"team": labels.get(s["team_qid"], s["team_qid"])} for s in stints
                          if labels.get(s["team_qid"] + "#P31", "") not in wd.NATIONAL_TEAM_CLASSES]
        career = []
        for row in club_rows:
            match = next((w for w in wd_club_stints if _team_match(row["team"], w["team"]) and w["start"] == row["start"]), None)
            status = "verifiziert" if match and (match["end"] in (row["end"], None) or row["end"] is None) else (
                "einzelquelle" if not match else "widerspruch")
            career.append(row | {"status": status, "sources": ["dewiki"] + (["wikidata"] if match else [])})
        if not club_rows and wd_club_stints:
            career = [{"years": f"{s['start'] or '?'}–{s['end'] or ''}", "start": s["start"], "end": s["end"],
                       "team": s["team"], "matches": s["matches"], "goals": s["goals"],
                       "status": "einzelquelle", "sources": ["wikidata"]} for s in wd_club_stints]
        # Nationalmannschaft (A-Team = ohne U-Kennung)
        national = [s for s in wp.stations(box, "national") if s["team"] and not re.search(r"\bU-?\d{2}|olymp|B-|Amateur", s["team"], re.I)]
        national_fact = None
        if national:
            n = national[-1]
            wd_nt = next((s for s in stints if labels.get(s["team_qid"] + "#P31", "") in wd.NATIONAL_TEAM_CLASSES
                          and s["start"] == n["start"]), None)
            ok = wd_nt and wd_nt.get("matches") is not None and wd_nt["matches"] == n["matches"]
            conflict = wd_nt and wd_nt.get("matches") is not None and wd_nt["matches"] != n["matches"]
            national_fact = {
                "id": "laenderspiele", "label": f"Länderspiele ({n['team']})",
                "value": {"matches": n["matches"], "goals": n["goals"], "years": n["years"], "team": n["team"]},
                "display": f"{n['matches']} Spiele, {n['goals']} Tore ({n['years']})" if n["matches"] is not None else n["years"],
                "sources": ["dewiki"] + (["wikidata"] if ok else []),
                "conflicts": {"wikidata": wd_nt["matches"]} if conflict else {},
                "status": "verifiziert" if ok else ("widerspruch" if conflict else "einzelquelle"),
            }
            add(national_fact)
    else:
        career, national = [], []
        pdate = wd.first_time(ent, "P585")
        lead = " ".join(s["text"] for s in (art["sections"][0]["sentences"] if art["sections"] else []))
        if pdate:
            disp = format_date_de(pdate["iso"])
            in_text = bool(disp and disp in de_text.replace("[[", "").replace("]]", ""))
            facts.append({"id": "datum", "label": "Datum", "value": pdate["iso"], "display": disp,
                          "sources": ["wikidata"] + (["dewiki"] if in_text else []), "conflicts": {},
                          "status": "verifiziert" if in_text else "einzelquelle"})
        loc = wd.first_item(ent, "P276")
        if loc:
            labels.update(wd.labels([loc]))
            facts.append({"id": "ort", "label": "Ort", "value": labels.get(loc), "display": labels.get(loc),
                          "sources": ["wikidata"] + (["dewiki"] if labels.get(loc, "") in lead else []), "conflicts": {},
                          "status": "verifiziert" if labels.get(loc, "") in lead else "einzelquelle"})

    # Abgeleitete Fakten (nur aus verifizierten Daten)
    fmap = {f["id"]: f for f in facts}
    b, d = fmap.get("geburtsdatum"), fmap.get("sterbedatum")
    if b and d and b["status"] == d["status"] == "verifiziert" and len(b["value"]) == len(d["value"]) == 10:
        bd, dd = dt.date.fromisoformat(b["value"]), dt.date.fromisoformat(d["value"])
        age = dd.year - bd.year - ((dd.month, dd.day) < (bd.month, bd.day))
        facts.append({"id": "alter_tod", "label": "Alter beim Tod", "value": age, "display": f"{age} Jahre",
                      "sources": ["berechnet"], "conflicts": {}, "status": "verifiziert"})
    lead_text = art["sections"][0]["sentences"][0]["text"] if art["sections"] and art["sections"][0]["sentences"] else ""
    retired = bool(re.search(r"ehemalig|war ein", lead_text)) or bool(d)
    senior = [c for c in career if not re.search(r"Amateur|II\b|U-?\d{2}|Reserve|Jugend", c["team"])]
    if retired and senior and all(c.get("end") for c in senior):
        last = max(c["end"] for c in senior)
        facts.append({"id": "karriereende", "label": "Letzte Profisaison (Jahr)", "value": last, "display": str(last),
                      "sources": senior[-1]["sources"], "conflicts": {},
                      "status": "verifiziert" if any(c["status"] == "verifiziert" for c in senior if c["end"] == last) else "einzelquelle"})

    # Sätze mit IDs
    sentences = []
    for si, sec in enumerate(art["sections"]):
        for s in sec["sentences"]:
            sentences.append({"id": f"s{len(sentences)}", "section": sec["heading"], "text": s["text"],
                              "cites": [f"ref{c}" for c in s["cites"]]})

    photo = None
    if settings.use_commons_photos:
        name = wp.image_name(box)
        if name:
            photo = _photo(name, project_dir, settings, log)

    result = {
        "qid": qid,
        "label": label,
        "short_name": wp._plain(box.get("kurzname", "")) or label,
        "description": description,
        "kind": "person" if is_person else "event",
        "lead": lead_text,
        "facts": facts,
        "career": career,
        "sentences": sentences,
        "sources": sources,
        "photo": photo,
        "researched_at": dt.datetime.now().isoformat(timespec="seconds"),
    }
    summary = {s: sum(1 for f in facts if f["status"] == s) for s in ("verifiziert", "einzelquelle", "widerspruch")}
    result["summary"] = summary | {"saetze": len(sentences), "quellen": len(sources)}
    log(f"Recherche fertig: {summary['verifiziert']} verifiziert, {summary['einzelquelle']} Einzelquelle, "
        f"{summary['widerspruch']} Widerspruch, {len(sentences)} belegbare Sätze")
    return result


def _photo(name: str, project_dir: Path, settings: Settings, log) -> dict | None:
    info = commons.license_info(name)
    if not info:
        log(f"Foto {name}: Lizenz nicht ermittelbar – wird nicht verwendet")
        return None
    lic = commons.pick_license(info, settings.allowed_photo_licenses)
    if not lic:
        log(f"Foto {name}: Lizenz {', '.join(l for _, l in info['licenses'])} nicht freigegeben – wird nicht verwendet")
        return {"used": False, "name": name, "licenses": [l for _, l in info["licenses"]], "page": info["page"]}
    data = commons.download(name)
    if not data:
        log(f"Foto {name}: Download fehlgeschlagen")
        return None
    path = project_dir / "research" / "photo.jpg"
    path.write_bytes(data)
    log(f"Foto übernommen: {name} ({lic[1]}, {info['author']})")
    return {"used": True, "name": name, "file": str(path.relative_to(project_dir)), "license": lic[1],
            "author": info["author"], "page": info["page"],
            "attribution": f"Foto: {info['author']} / Wikimedia Commons, {lic[1]}"}
