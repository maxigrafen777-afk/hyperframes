"""Wikidata: strukturierte, belegte Fakten (Geburtsdaten, Vereine, Länderspiele …)."""

from __future__ import annotations

from typing import Any

from .. import http

SPARQL_URL = "https://query.wikidata.org/sparql"
API_URL = "https://www.wikidata.org/w/api.php"
ENTITY_URL = "https://www.wikidata.org/wiki/Special:EntityData/{qid}.json"

FOOTBALLER = "Q937857"
NATIONAL_TEAM_CLASSES = {"Q6979593", "Q20979593", "Q23847779", "Q1194951"}


def sparql(query: str, ttl: float = 7 * 24 * 3600) -> list[dict[str, Any]]:
    data, _ = http.get_json(
        SPARQL_URL,
        {"query": query, "format": "json"},
        ttl=ttl,
        headers={"Accept": "application/sparql-results+json"},
        timeout=70,
    )
    rows = []
    for b in data["results"]["bindings"]:
        rows.append({k: v["value"] for k, v in b.items()})
    return rows


def qid_from_uri(uri: str) -> str:
    return uri.rsplit("/", 1)[-1]


def entity(qid: str, ttl: float = 24 * 3600) -> tuple[dict, dict]:
    data, meta = http.get_json(ENTITY_URL.format(qid=qid), ttl=ttl)
    ent = data["entities"]
    # Weiterleitungen: der Schlüssel kann eine andere QID sein
    return next(iter(ent.values())), meta


def labels(qids: list[str], lang: str = "de") -> dict[str, str]:
    out: dict[str, str] = {}
    qids = sorted(set(q for q in qids if q))
    for i in range(0, len(qids), 50):
        chunk = qids[i : i + 50]
        data, _ = http.get_json(
            API_URL,
            {
                "action": "wbgetentities",
                "ids": "|".join(chunk),
                "props": "labels|claims",
                "languages": f"{lang}|en",
                "format": "json",
            },
            ttl=30 * 24 * 3600,
        )
        for q, e in data.get("entities", {}).items():
            lab = e.get("labels", {})
            out[q] = (lab.get(lang) or lab.get("en") or {}).get("value", q)
            out[q + "#P31"] = ",".join(
                c["mainsnak"].get("datavalue", {}).get("value", {}).get("id", "")
                for c in e.get("claims", {}).get("P31", [])
            )
    return out


def search(text: str, lang: str = "de", limit: int = 7) -> list[dict]:
    data, _ = http.get_json(
        API_URL,
        {
            "action": "wbsearchentities",
            "search": text,
            "language": lang,
            "uselang": lang,
            "type": "item",
            "limit": limit,
            "format": "json",
        },
        ttl=7 * 24 * 3600,
    )
    return [
        {"qid": r["id"], "label": r.get("label", r["id"]), "description": r.get("description", "")}
        for r in data.get("search", [])
    ]


# ---- Claim-Hilfen ---------------------------------------------------------


def claims(ent: dict, prop: str) -> list[dict]:
    return [c for c in ent.get("claims", {}).get(prop, []) if c.get("rank") != "deprecated"]


def _value(snak: dict) -> Any:
    if snak.get("snaktype") != "value":
        return None
    return snak["datavalue"]["value"]


def time_value(v: Any) -> dict | None:
    """Wikidata-Zeitwert -> {'iso': 'YYYY-MM-DD' | 'YYYY', 'year': int, 'precision': int}."""
    if not isinstance(v, dict) or "time" not in v:
        return None
    t = v["time"].lstrip("+")
    year, month, day = t[:4], t[5:7], t[8:10]
    prec = v.get("precision", 11)
    iso = year if prec <= 9 else (f"{year}-{month}" if prec == 10 else f"{year}-{month}-{day}")
    return {"iso": iso, "year": int(year), "precision": prec}


def first_time(ent: dict, prop: str) -> dict | None:
    for c in claims(ent, prop):
        tv = time_value(_value(c["mainsnak"]))
        if tv:
            return tv
    return None


def first_item(ent: dict, prop: str) -> str | None:
    for c in claims(ent, prop):
        v = _value(c["mainsnak"])
        if isinstance(v, dict) and "id" in v:
            return v["id"]
    return None


def items(ent: dict, prop: str) -> list[str]:
    out = []
    for c in claims(ent, prop):
        v = _value(c["mainsnak"])
        if isinstance(v, dict) and "id" in v:
            out.append(v["id"])
    return out


def quantity(ent: dict, prop: str) -> float | None:
    for c in claims(ent, prop):
        v = _value(c["mainsnak"])
        if isinstance(v, dict) and "amount" in v:
            return float(v["amount"])
    return None


def string(ent: dict, prop: str) -> str | None:
    for c in claims(ent, prop):
        v = _value(c["mainsnak"])
        if isinstance(v, str):
            return v
    return None


def team_stints(ent: dict) -> list[dict]:
    """P54 (Mitglied von Sportmannschaft) mit Qualifikatoren Start/Ende/Spiele/Tore."""
    out = []
    for c in claims(ent, "P54"):
        v = _value(c["mainsnak"])
        if not isinstance(v, dict):
            continue
        q = c.get("qualifiers", {})

        def qt(p: str) -> dict | None:
            for s in q.get(p, []):
                tv = time_value(_value(s))
                if tv:
                    return tv
            return None

        def qn(p: str) -> int | None:
            for s in q.get(p, []):
                val = _value(s)
                if isinstance(val, dict) and "amount" in val:
                    return int(float(val["amount"]))
            return None

        start, end = qt("P580"), qt("P582")
        out.append(
            {
                "team_qid": v["id"],
                "start": start["year"] if start else None,
                "end": end["year"] if end else None,
                "matches": qn("P1350"),
                "goals": qn("P1351"),
                "loan": any(
                    (_value(s) or {}).get("id") == "Q2914547" for s in q.get("P1642", [])
                ),
            }
        )
    out.sort(key=lambda s: (s["start"] or 9999, s["end"] or 9999))
    return out


def sitelink_title(ent: dict, wiki: str) -> str | None:
    sl = ent.get("sitelinks", {}).get(wiki)
    return sl["title"] if sl else None
