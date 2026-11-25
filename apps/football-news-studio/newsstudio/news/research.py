"""Recherche zu einem Thema + Liste aktueller Tagesthemen."""

from __future__ import annotations

import datetime as dt
import re

from ..config import Settings
from ..library import entities
from . import articles, claims, feeds


def topic_entities(topic: str) -> list[dict]:
    ents = entities.find(topic)
    return [e for e in ents if e["kind"] != "wettbewerb"] or ents


def _relevant(item: dict, ents: list[dict], words: list[str]) -> bool:
    blob = entities.norm(item["title"] + " " + item.get("summary", ""))
    keys = []
    for e in ents:
        parts = e["name"].split()
        keys.append(entities.norm(parts[-1] if e["kind"] != "verein" and len(parts) > 1 else e["name"]))
        keys += [entities.norm(a) for a in (e.get("aliases") or "").split("|") if len(a) > 3]
    keys += [entities.norm(w) for w in words]
    keys = [k for k in keys if k]
    persons = [e for e in ents if e["kind"] != "verein"]
    if persons:  # bei Personen muss die Person vorkommen
        pk = [entities.norm(p["name"].split()[-1]) for p in persons]
        return any(re.search(rf"(?<![a-z]){re.escape(k)}(?![a-z])", blob) for k in pk)
    return any(re.search(rf"(?<![a-z]){re.escape(k)}(?![a-z])", blob) for k in keys)


def research(topic: str, settings: Settings | None = None, log=print, max_articles: int = 14) -> dict:
    s = settings or Settings.load()
    ents = topic_entities(topic)
    words = [w for w in re.findall(r"[A-ZÄÖÜ][\wäöüß-]{3,}", topic) if not entities.find(w)]
    log(f"Thema: {topic} – erkannt: {', '.join(e['name'] for e in ents) or 'keine bekannten Namen'}")
    items = feeds.recent(feeds.all_items(log), s.news_lookback_hours)
    rss = [i for i in items if _relevant(i, ents, words)] if (ents or words) else []
    query = " ".join(e["name"] for e in ents[:2]) or topic
    try:
        gn = feeds.recent(feeds.google_news(query), s.news_lookback_hours)
    except Exception as e:
        gn = []
        log(f"Google News nicht erreichbar: {e}")
    log(f"{len(rss)} passende Artikel aus Feeds, {len(gn)} Meldungen über Google News")
    rss.sort(key=lambda i: (i["tier"], i["published"] or ""), reverse=False)
    picked, per_source = [], {}
    for it in sorted(rss, key=lambda i: (i["tier"], -(dt.datetime.fromisoformat(i["published"]).timestamp() if i["published"] else 0))):
        if per_source.get(it["source"], 0) >= 3 or len(picked) >= max_articles:
            continue
        per_source[it["source"]] = per_source.get(it["source"], 0) + 1
        picked.append(it)
    arts = []
    for i, it in enumerate(picked):
        r = articles.fetch(it["url"])
        a = {"id": f"a{i}", **it, "text": "", "paywall": False, "status": "ok"}
        if r.get("ok") and not r["paywall"]:
            a["text"], a["sha256"], a["fetched_at"] = r["text"], r["sha256"], r["fetched_at"]
        else:
            a["status"] = r.get("reason") or "Paywall – nur Teaser"
            a["text"] = (it["title"] + ". " + it.get("summary", "")).strip()
        arts.append(a)
    base = len(arts)
    for j, it in enumerate(gn[:25]):
        arts.append({"id": f"a{base + j}", **it, "text": "", "status": "nur Überschrift"})
    # Überschriften als zusätzliche (schwache) Belege
    for a in arts:
        if not a["text"] and a["title"]:
            a["text"] = a["title"] + "."
    cl = claims.extract([a for a in arts if a["text"]], ents)
    conf = claims.conflicts(cl)
    sources = sorted({a["source"] for a in arts if a["source"]})
    log(f"{len(cl)} Aussagen aus {len(sources)} Quellen: "
        + ", ".join(f"{n}× {st}" for st, n in sorted({c['status']: sum(1 for x in cl if x['status'] == c['status']) for c in cl}.items())))
    return {
        "topic": topic, "entities": [{"id": e["id"], "name": e["name"], "kind": e["kind"], "club": e["club"]} for e in ents],
        "articles": [{k: v for k, v in a.items() if k != "text"} | {"excerpt": a["text"][:1500]} for a in arts],
        "claims": cl, "conflicts": conf, "sources": sources,
        "researched_at": dt.datetime.now().isoformat(timespec="seconds"),
    }


def trending(settings: Settings | None = None, log=print, limit: int = 15) -> list[dict]:
    """Tagesthemen: Personen/Vereine, über die gerade die meisten Quellen schreiben."""
    s = settings or Settings.load()
    items = feeds.recent(feeds.all_items(log), 36)
    buckets: dict[int, dict] = {}
    for it in items:
        for e in entities.find(it["title"] + " " + it.get("summary", "")):
            if e["kind"] == "wettbewerb":
                continue
            b = buckets.setdefault(e["id"], {"entity": e, "items": [], "sources": set()})
            b["items"].append(it)
            b["sources"].add(it["source"])
    out = []
    now = dt.datetime.now(dt.timezone.utc)
    for b in buckets.values():
        e = b["entity"]
        fresh = sum(1 for i in b["items"] if i["published"] and (now - dt.datetime.fromisoformat(i["published"])).total_seconds() < 12 * 3600)
        score = len(b["sources"]) * 3 + len(b["items"]) + fresh * 1.5 + (2 if e["kind"] != "verein" else 0)
        heads = sorted(b["items"], key=lambda i: i["published"] or "", reverse=True)
        out.append({"entity": e["name"], "kind": e["kind"], "club": e["club"], "score": round(score, 1),
                    "sources": sorted(b["sources"]), "count": len(b["items"]),
                    "headlines": [{"title": h["title"], "source": h["source"], "url": h["url"], "published": h["published"]} for h in heads[:5]],
                    "suggested_topic": heads[0]["title"]})
    out.sort(key=lambda x: -x["score"])
    # Vereine nur, wenn nicht schon über deren Spieler abgedeckt
    return out[:limit]
