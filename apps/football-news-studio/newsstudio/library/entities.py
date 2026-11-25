"""Spieler-, Vereins- und Trainerverzeichnis (Wikidata) + Erkennung in Texten."""

from __future__ import annotations

import re
import unicodedata
from functools import lru_cache

from .. import db
from ..news import wikidata as wd

LEAGUES = {
    "Q82595": "Bundesliga", "Q151789": "2. Bundesliga", "Q9448": "Premier League", "Q324867": "La Liga",
    "Q15804": "Serie A", "Q13394": "Ligue 1",
}

# Häufige Kurzformen, die nicht (immer) in Wikidata stehen
CLUB_ALIASES = {
    "FC Bayern München": ["FC Bayern", "Bayern", "Bayern München", "FCB", "Rekordmeister"],
    "Borussia Dortmund": ["BVB", "Dortmund", "Borussia Dortmund"],
    "Bayer 04 Leverkusen": ["Leverkusen", "Bayer Leverkusen", "Werkself"],
    "RB Leipzig": ["Leipzig", "RB Leipzig", "RBL"],
    "VfB Stuttgart": ["Stuttgart", "VfB"],
    "Eintracht Frankfurt": ["Frankfurt", "Eintracht", "SGE"],
    "FC Schalke 04": ["Schalke", "S04"],
    "Borussia Mönchengladbach": ["Gladbach", "Mönchengladbach", "Fohlen"],
    "Real Madrid": ["Real", "Real Madrid", "Königliche"],
    "FC Barcelona": ["Barça", "Barca", "Barcelona"],
    "Manchester City": ["Man City", "ManCity", "City"],
    "Manchester United": ["Man United", "ManUnited", "United"],
    "FC Liverpool": ["Liverpool", "Reds"],
    "Paris Saint-Germain": ["PSG", "Paris"],
    "Tottenham Hotspur": ["Tottenham", "Spurs"],
    "FC Arsenal": ["Arsenal", "Gunners"],
    "FC Chelsea": ["Chelsea"],
}
COMPETITIONS = {
    "Bundesliga": ["Bundesliga"], "Champions League": ["Champions League", "Königsklasse", "UCL"],
    "DFB-Pokal": ["DFB-Pokal", "Pokal"], "Premier League": ["Premier League"], "Europa League": ["Europa League"],
    "Nationalmannschaft": ["Nationalmannschaft", "DFB-Team", "Nationalelf"], "WM": ["WM", "Weltmeisterschaft"],
}


def norm(s: str) -> str:
    s = unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", " ", s).strip()


def upsert(kind: str, name: str, aliases: list[str] | None = None, qid: str | None = None, club: str = "") -> int:
    aliases = sorted({a.strip() for a in (aliases or []) if a and a.strip() and a.strip() != name})
    ex = db.one("SELECT * FROM entity WHERE (qid IS NOT NULL AND qid=?) OR (kind=? AND name=?)", (qid, kind, name))
    if ex:
        merged = sorted(set(filter(None, ex["aliases"].split("|"))) | set(aliases))
        db.execute("UPDATE entity SET aliases=?, club=COALESCE(NULLIF(?, ''), club), qid=COALESCE(qid, ?) WHERE id=?",
                   ("|".join(merged), club, qid, ex["id"]))
        _matcher.cache_clear()
        return ex["id"]
    eid = db.execute("INSERT INTO entity(kind,name,aliases,qid,club) VALUES(?,?,?,?,?)",
                     (kind, name, "|".join(aliases), qid, club))
    _matcher.cache_clear()
    return eid


OFFICIALS = {
    "Max Eberl": "FC Bayern München", "Christoph Freund": "FC Bayern München", "Uli Hoeneß": "FC Bayern München",
    "Karl-Heinz Rummenigge": "FC Bayern München", "Herbert Hainer": "FC Bayern München",
    "Jan-Christian Dreesen": "FC Bayern München", "Lars Ricken": "Borussia Dortmund", "Sebastian Kehl": "Borussia Dortmund",
    "Simon Rolfes": "Bayer 04 Leverkusen", "Fernando Carro": "Bayer 04 Leverkusen", "Markus Krösche": "Eintracht Frankfurt",
    "Julian Nagelsmann": "Nationalmannschaft", "Rudi Völler": "Nationalmannschaft",
}


def seed_static() -> None:
    for name, club in OFFICIALS.items():
        upsert("funktionaer", name, [], None, club)
    for club, al in CLUB_ALIASES.items():
        upsert("verein", club, al)
    for comp, al in COMPETITIONS.items():
        upsert("wettbewerb", comp, al)


def sync_wikidata(leagues: list[str] | None = None, log=print) -> int:
    """Aktuelle Kader + Trainer der Ligen aus Wikidata laden (eine Woche gecacht)."""
    n = 0
    lab = 'SERVICE wikibase:label { bd:serviceParam wikibase:language "de,en". }'
    for lq in leagues or list(LEAGUES):
        players = f"""SELECT ?club ?clubLabel ?p ?pLabel ?start WHERE {{ ?club wdt:P118 wd:{lq}.
          ?p p:P54 ?st. ?st ps:P54 ?club. FILTER NOT EXISTS {{ ?st pq:P582 ?end }} OPTIONAL {{ ?st pq:P580 ?start }}
          ?p wdt:P106 wd:Q937857; wdt:P569 ?b. FILTER(YEAR(?b) > 1984) {lab} }}"""
        coaches = f"""SELECT ?club ?clubLabel ?p ?pLabel ?start WHERE {{ ?club wdt:P118 wd:{lq}. ?club p:P286 ?hc.
          ?hc ps:P286 ?p. FILTER NOT EXISTS {{ ?hc pq:P582 ?e }} OPTIONAL {{ ?hc pq:P580 ?start }} {lab} }}"""
        people: dict[str, dict] = {}
        for role, q in (("spieler", players), ("trainer", coaches)):
            try:
                res = wd.sparql(q, ttl=7 * 24 * 3600)
            except Exception as e:
                log(f"Wikidata {LEAGUES[lq]} ({role}): {e}")
                continue
            for r in res:
                club = r.get("clubLabel", "")
                if not club or club.startswith("Kader") or re.fullmatch(r"Q\d+", club) or re.fullmatch(r"Q\d+", r.get("pLabel", "")):
                    continue
                pq = wd.qid_from_uri(r["p"])
                start = r.get("start", "")
                cur = people.get(pq)
                if not cur or start > cur["start"]:
                    people[pq] = {"name": r["pLabel"], "club": club, "role": role, "start": start,
                                  "club_qid": wd.qid_from_uri(r["club"])}
        clubs = {(e["club"], e["club_qid"]) for e in people.values()}
        for club, cq in clubs:
            upsert("verein", club, [], cq)
        for pq, e in people.items():
            upsert(e["role"], e["name"], [], pq, e["club"])
            n += 1
        log(f"Wikidata {LEAGUES[lq]}: {len(people)} Personen, {len(clubs)} Vereine")
    db.set_meta("entities_synced", __import__("datetime").date.today().isoformat())
    return n


def all_entities() -> list[dict]:
    return db.rows("SELECT * FROM entity")


@lru_cache(maxsize=1)
def _matcher():
    ents = all_entities()
    surname_count: dict[str, int] = {}
    for e in ents:
        if e["kind"] in ("spieler", "trainer", "funktionaer"):
            parts = e["name"].split()
            if len(parts) > 1:
                surname_count[norm(parts[-1])] = surname_count.get(norm(parts[-1]), 0) + 1
    table: dict[str, list[int]] = {}
    for e in ents:
        names = [e["name"]] + [a for a in e["aliases"].split("|") if a]
        if e["kind"] in ("spieler", "trainer", "funktionaer"):
            parts = e["name"].split()
            if len(parts) > 1 and surname_count.get(norm(parts[-1])) == 1 and len(parts[-1]) >= 4:
                names.append(parts[-1])  # eindeutiger Nachname ("Kane", "Musiala")
        for n in names:
            k = norm(n)
            if len(k) >= 3 or n.isupper():
                table.setdefault(k, [])
                if e["id"] not in table[k]:
                    table[k].append(e["id"])
    keys = sorted(table, key=len, reverse=True)
    rx = re.compile(r"(?<![a-z0-9])(" + "|".join(re.escape(k) for k in keys) + r")(?![a-z0-9])") if keys else None
    return rx, table, {e["id"]: e for e in ents}


def find(text: str) -> list[dict]:
    """Erkennt Entities im Text. Mehrdeutige Treffer (z. B. 'City') werden verworfen."""
    rx, table, by_id = _matcher()
    if not rx or not text:
        return []
    found: dict[int, dict] = {}
    for m in rx.finditer(norm(text)):
        ids = table[m.group(1)]
        if len(ids) != 1:
            continue
        e = by_id[ids[0]]
        found.setdefault(e["id"], {**e, "hits": 0, "first": m.start()})
        found[e["id"]]["hits"] += 1
    return sorted(found.values(), key=lambda e: e["first"])


def reset_cache() -> None:
    _matcher.cache_clear()
