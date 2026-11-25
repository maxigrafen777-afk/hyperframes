"""THEMENFINDER: täglich neue Fußballgeschichten aus Wikidata, ohne Wiederholungen."""

from __future__ import annotations

import datetime as dt
import hashlib
import random
import re

from . import db
from .config import Settings
from .sources import wikidata as wd

CATEGORIES = {
    "legende": "Legende",
    "vergessen": "Vergessenes Talent",
    "tragik": "Tragisches Schicksal",
    "absturz": "Karriere-Absturz",
    "transfer": "Transfer-Story",
    "historisch": "Historisches Ereignis",
}

_LABEL = 'SERVICE wikibase:label { bd:serviceParam wikibase:language "de,en". }'
_DEWIKI = "?a schema:about ?p; schema:isPartOf <https://de.wikipedia.org/>; schema:name ?title."

POOLS = {
    "legende": f"""SELECT ?p ?pLabel ?pDescription ?title ?sl ?born ?died WHERE {{
 ?p wdt:P106 wd:{wd.FOOTBALLER}; wikibase:sitelinks ?sl. FILTER(?sl > 65)
 {_DEWIKI} OPTIONAL{{?p wdt:P569 ?born}} OPTIONAL{{?p wdt:P570 ?died}} {_LABEL} }} LIMIT 800""",
    # ehemalige/aktuelle deutsche Nationalspieler mit mittlerer Bekanntheit
    "vergessen": f"""SELECT ?p ?pLabel ?pDescription ?title ?sl ?born WHERE {{
 ?p wdt:P54 wd:Q43310; wikibase:sitelinks ?sl. FILTER(?sl >= 12 && ?sl <= 60)
 ?p wdt:P569 ?born. FILTER(YEAR(?born) >= 1950 && YEAR(?born) <= 1998)
 {_DEWIKI} {_LABEL} }} LIMIT 1500""",
    "tragik": f"""SELECT ?p ?pLabel ?pDescription ?title ?sl ?born ?died WHERE {{
 ?p wdt:P106 wd:{wd.FOOTBALLER}; wdt:P570 ?died; wdt:P569 ?born; wikibase:sitelinks ?sl. FILTER(?sl > 12)
 FILTER(YEAR(?born) > 1920 && YEAR(?died) - YEAR(?born) < 36)
 {_DEWIKI} {_LABEL} }} LIMIT 600""",
    "historisch": f"""SELECT ?p ?pLabel ?pDescription ?title ?sl ?date WHERE {{
 VALUES ?cls {{ wd:Q17315159 wd:Q12708896 }}
 ?p wdt:P31 ?cls; wikibase:sitelinks ?sl. FILTER(?sl >= 3)
 {_DEWIKI} OPTIONAL{{?p wdt:P585 ?date}} {_LABEL} }} LIMIT 600""",
}

# Kuratierte Startliste bekannter Geschichten. Aufgelöst wird über die Wikidata-Suche
# (erster Treffer mit Fußballbezug), recherchiert wird wie bei allen anderen Themen.
SEEDS: list[tuple[str, str]] = [
    ("Wunder von Bern", "historisch"),
    ("Nichtangriffspakt von Gijón", "historisch"),
    ("Wembley-Tor", "historisch"),
    ("Bundesliga-Skandal 1970/71", "historisch"),
    ("Hand Gottes Maradona", "historisch"),
    ("Bosman-Entscheidung", "transfer"),
    ("Sebastian Deisler", "absturz"),
    ("Paul Gascoigne", "absturz"),
    ("Adriano Leite Ribeiro", "absturz"),
    ("Marcell Jansen", "vergessen"),
    ("Lars Ricken", "vergessen"),
    ("Robert Enke", "tragik"),
    ("Freddy Adu", "vergessen"),
    ("Luís Figo", "transfer"),
    ("Neymar", "transfer"),
    ("Mario Götze", "transfer"),
    ("Andrés Escobar", "tragik"),
    ("Albert Streit", "absturz"),
    ("Deniz Naki", "vergessen"),
    ("Kevin Großkreutz", "absturz"),
]

FOOTBALL_DESC = re.compile(r"fußball|football|torhüter|torwart|stürmer|verteidiger|mittelfeld|soccer", re.I)

# Arbeitstitel sind bewusst als Frage formuliert: Behauptungen entstehen erst im Skript aus belegten Fakten.
ANGLES = {
    "legende": ["Wie {name} zur Legende wurde", "Die Karriere von {name}", "{name}: Der Weg nach oben"],
    "vergessen": ["Was wurde eigentlich aus {name}?", "Erinnerst du dich an {name}?"],
    "tragik": ["Das Schicksal von {name}", "Die Geschichte von {name}"],
    "absturz": ["Was ist mit {name} passiert?", "{name}: Aufstieg und Fall?"],
    "transfer": ["{name}: Die Geschichte hinter dem Wechsel", "Der Fall {name}"],
    "historisch": ["{name}: Die ganze Geschichte", "Was geschah wirklich? {name}"],
}


def _day_seed(day: str, salt: str) -> int:
    return int(hashlib.sha256(f"{day}:{salt}".encode()).hexdigest()[:12], 16)


def _pool(cat: str) -> list[dict]:
    rows = wd.sparql(POOLS[cat], ttl=7 * 24 * 3600)
    seen: set[str] = set()
    out = []
    for r in rows:
        qid = wd.qid_from_uri(r["p"])
        if qid in seen:
            continue
        seen.add(qid)
        desc = r.get("pDescription", "")
        if cat != "historisch" and desc and not FOOTBALL_DESC.search(desc):
            continue
        label = r.get("pLabel", qid)
        if re.fullmatch(r"Q\d+", label):
            continue
        out.append({
            "qid": qid,
            "label": label,
            "title": r.get("title", label),
            "description": desc,
            "sitelinks": int(r.get("sl", 0)),
            "born": (r.get("born") or "")[:10],
            "died": (r.get("died") or "")[:10],
            "date": (r.get("date") or "")[:10],
            "category": cat,
        })
    return out


def _teaser(c: dict) -> str:
    bits = []
    if c.get("description"):
        bits.append(c["description"][:1].upper() + c["description"][1:])
    if c.get("born"):
        bits.append(f"geboren {c['born'][:4]}")
    if c.get("died"):
        bits.append(f"gestorben {c['died'][:4]}")
    if c.get("date"):
        bits.append(c["date"][:4])
    return " · ".join(bits)


def resolve(text: str) -> dict | None:
    """Suchbegriff -> erster Wikidata-Treffer mit Fußballbezug."""
    for r in wd.search(text):
        if FOOTBALL_DESC.search(r["description"]) or "spiel" in r["description"].lower():
            return r
    return None


def _seed_candidates(day: str) -> list[dict]:
    order = list(SEEDS)
    random.Random(_day_seed(day, "seeds")).shuffle(order)
    out = []
    for text, cat in order[:6]:
        try:
            r = resolve(text)
        except Exception:
            continue
        if r:
            out.append({"qid": r["qid"], "label": r["label"], "title": r["label"], "description": r["description"],
                        "sitelinks": 80, "born": "", "died": "", "date": "", "category": cat})
    return out


def _used_or_recent(cooldown_days: int) -> set[str]:
    cutoff = (dt.date.today() - dt.timedelta(days=cooldown_days)).isoformat()
    with db.conn() as c:
        rows = c.execute(
            "SELECT qid FROM topics WHERE status IN ('used','dismissed') OR last_suggested >= ?", (cutoff,)
        ).fetchall()
    return {r["qid"] for r in rows}


def score(c: dict) -> float:
    """Story-Potenzial: Bekanntheit (Sitelinks) + Kategorie-Bonus."""
    base = min(c["sitelinks"], 150) / 150
    bonus = {"tragik": 0.25, "absturz": 0.3, "vergessen": 0.2, "historisch": 0.2, "transfer": 0.2, "legende": 0.1}
    return round(base + bonus.get(c["category"], 0), 3)


MIX = [("legende", 2), ("vergessen", 3), ("tragik", 2), ("historisch", 2), ("seed", 1)]


def generate_daily(day: str | None = None, count: int | None = None, force: bool = False) -> list[dict]:
    """Erzeugt (oder liefert vorhandene) Tagesvorschläge."""
    settings = Settings.load()
    day = day or dt.date.today().isoformat()
    count = count or settings.daily_topic_count
    if not force:
        existing = daily(day)
        if existing:
            return existing
    excluded = _used_or_recent(settings.topic_cooldown_days)
    if force:
        excluded |= {t["qid"] for t in daily(day)}
    picks: list[dict] = []
    errors: list[str] = []
    for cat, n in MIX:
        try:
            cands = _seed_candidates(day) if cat == "seed" else _pool(cat)
        except Exception as e:  # Quelle temporär nicht erreichbar -> andere Kategorien
            errors.append(f"{cat}: {e}")
            continue
        cands = [c for c in cands if c["qid"] not in excluded and c["qid"] not in {p["qid"] for p in picks}]
        rnd = random.Random(_day_seed(day, cat + str(force)))
        rnd.shuffle(cands)
        # leichte Gewichtung nach Bekanntheit: aus den ersten 40 die besten n
        top = sorted(cands[:40], key=score, reverse=True)[:n]
        picks.extend(top)
    # auffüllen, falls Kategorien leer waren
    if len(picks) < count:
        for cat in ("vergessen", "legende", "tragik"):
            try:
                extra = [c for c in _pool(cat) if c["qid"] not in excluded and c["qid"] not in {p["qid"] for p in picks}]
            except Exception:
                continue
            random.Random(_day_seed(day, "fill" + cat)).shuffle(extra)
            picks.extend(extra[: count - len(picks)])
            if len(picks) >= count:
                break
    picks = picks[:count]
    if not picks:
        raise RuntimeError("Keine Themen gefunden. " + "; ".join(errors))
    now = dt.date.today().isoformat()
    with db.conn() as c:
        c.execute("DELETE FROM daily WHERE day=?", (day,))
        for i, p in enumerate(picks):
            angle = random.Random(_day_seed(day, p["qid"])).choice(ANGLES[p["category"]]).format(name=p["label"])
            c.execute(
                """INSERT INTO topics(qid,title,label,category,teaser,score,status,first_suggested,last_suggested)
                   VALUES(?,?,?,?,?,?,'suggested',?,?)
                   ON CONFLICT(qid) DO UPDATE SET last_suggested=excluded.last_suggested,
                   title=excluded.title, category=excluded.category, teaser=excluded.teaser, score=excluded.score""",
                (p["qid"], angle, p["label"], p["category"], _teaser(p), score(p), now, now),
            )
            c.execute("INSERT INTO daily(day, rank, qid) VALUES(?,?,?)", (day, i, p["qid"]))
    return daily(day)


def daily(day: str | None = None) -> list[dict]:
    day = day or dt.date.today().isoformat()
    with db.conn() as c:
        rows = c.execute(
            """SELECT t.*, d.rank FROM daily d JOIN topics t ON t.qid=d.qid WHERE d.day=? ORDER BY d.rank""",
            (day,),
        ).fetchall()
    return [dict(r) | {"category_label": CATEGORIES.get(r["category"], r["category"])} for r in rows]


def get(qid: str) -> dict | None:
    with db.conn() as c:
        r = c.execute("SELECT * FROM topics WHERE qid=?", (qid,)).fetchone()
    return dict(r) if r else None


def mark(qid: str, status: str, project_id: str | None = None) -> None:
    with db.conn() as c:
        c.execute("UPDATE topics SET status=?, project_id=COALESCE(?, project_id) WHERE qid=?", (status, project_id, qid))


def add_manual(qid: str, label: str, category: str) -> dict:
    """Eigenes Thema (z. B. über die Suche) in die Historie aufnehmen."""
    angle = ANGLES.get(category, ANGLES["legende"])[0].format(name=label)
    now = dt.date.today().isoformat()
    with db.conn() as c:
        c.execute(
            """INSERT INTO topics(qid,title,label,category,teaser,score,status,first_suggested,last_suggested)
               VALUES(?,?,?,?,?,0,'suggested',?,?) ON CONFLICT(qid) DO NOTHING""",
            (qid, angle, label, category, "", now, now),
        )
    return get(qid) or {}


def history(limit: int = 200) -> list[dict]:
    with db.conn() as c:
        rows = c.execute("SELECT * FROM topics ORDER BY last_suggested DESC LIMIT ?", (limit,)).fetchall()
    return [dict(r) for r in rows]
