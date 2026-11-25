"""Nachrichtenquellen: RSS-Feeds seriöser Medien + Google-News-Suche (nur Überschriften)."""

from __future__ import annotations

import datetime as dt
import email.utils
import re
from urllib.parse import quote_plus

import feedparser

from .. import http

# Tier 1 = besonders verlässlich, Tier 2 = seriös, Boulevard/Fan-Portal = Tier 3
FEEDS = [
    ("Sportschau", "https://www.sportschau.de/fussball/index~rss2.xml", 1),
    ("Sportschau", "https://www.sportschau.de/fussball/bundesliga/index~rss2.xml", 1),
    ("FAZ", "https://www.faz.net/rss/aktuell/sport/fussball/", 1),
    ("Spiegel", "https://www.spiegel.de/sport/fussball/index.rss", 1),
    ("Süddeutsche Zeitung", "https://rss.sueddeutsche.de/rss/Sport", 1),
    ("Welt", "https://www.welt.de/feeds/section/sport/fussball.rss", 1),
    ("n-tv", "https://www.n-tv.de/sport/fussball/rss", 2),
    ("t-online", "https://feeds.t-online.de/rss/sport", 2),
    ("Stern", "https://www.stern.de/feed/standard/sport/", 2),
    ("RND", "https://www.rnd.de/arc/outboundfeeds/rss/category/sport/", 2),
    ("Merkur", "https://www.merkur.de/sport/fussball/rssfeed.rdf", 2),
    ("tz", "https://www.tz.de/sport/fc-bayern/rssfeed.rdf", 2),
    ("Transfermarkt", "https://www.transfermarkt.de/rss/news", 2),
    ("90min", "https://www.90min.de/feed", 3),
]
PUBLISHER_TIER = {
    "kicker": 1, "sportschau": 1, "sky": 1, "sky sport": 1, "faz": 1, "frankfurter allgemeine": 1, "spiegel": 1,
    "süddeutsche": 1, "sueddeutsche": 1, "zeit": 1, "dpa": 1, "welt": 1, "11freunde": 1, "the athletic": 1,
    "zdf": 1, "ard": 1, "br": 1, "ndr": 1, "wdr": 1, "fc bayern": 0, "fcbayern.com": 0, "bvb.de": 0, "dfb": 0,
    "n-tv": 2, "t-online": 2, "stern": 2, "rnd": 2, "merkur": 2, "tz": 2, "abendzeitung": 2, "transfermarkt": 2,
    "sport1": 2, "focus": 2, "rp online": 2, "ruhr nachrichten": 2, "bild": 3, "90min": 3, "fussballtransfers": 3,
    "sport bild": 3, "ran": 2, "goal": 3,
}


def tier_for(name: str) -> int:
    n = (name or "").lower()
    for k, t in sorted(PUBLISHER_TIER.items(), key=lambda kv: -len(kv[0])):
        if k in n:
            return t
    return 3


def _when(e) -> str | None:
    for k in ("published", "updated"):
        if e.get(k):
            try:
                return email.utils.parsedate_to_datetime(e[k]).astimezone(dt.timezone.utc).isoformat()
            except (TypeError, ValueError):
                pass
    for k in ("published_parsed", "updated_parsed"):
        if e.get(k):
            return dt.datetime(*e[k][:6], tzinfo=dt.timezone.utc).isoformat()
    return None


def _clean(html: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", html or "")).strip()


def fetch_feed(name: str, url: str, tier: int, ttl: float = 900) -> list[dict]:
    raw, _ = http.get(url, ttl=ttl, retries=2, timeout=20, binary=True)
    d = feedparser.parse(raw)
    out = []
    for e in d.entries:
        out.append({"source": name, "tier": tier, "title": _clean(e.get("title", "")), "url": e.get("link", ""),
                    "summary": _clean(e.get("summary", ""))[:600], "published": _when(e), "via": "rss"})
    return out


def all_items(log=print) -> list[dict]:
    items = []
    for name, url, tier in FEEDS:
        try:
            items += fetch_feed(name, url, tier)
        except Exception as e:
            log(f"Feed {name} nicht erreichbar: {e}")
    return dedupe(items)


def google_news(query: str, ttl: float = 900) -> list[dict]:
    url = f"https://news.google.com/rss/search?q={quote_plus(query)}+when:3d&hl=de&gl=DE&ceid=DE:de"
    raw, _ = http.get(url, ttl=ttl, retries=2, timeout=20, binary=True)
    d = feedparser.parse(raw)
    out = []
    for e in d.entries:
        title = _clean(e.get("title", ""))
        src = (e.get("source") or {}).get("title") or (title.rsplit(" - ", 1)[-1] if " - " in title else "")
        if src and title.endswith(" - " + src):
            title = title[: -len(src) - 3]
        out.append({"source": src, "tier": tier_for(src), "title": title, "url": e.get("link", ""),
                    "summary": "", "published": _when(e), "via": "google-news"})
    return out


def dedupe(items: list[dict]) -> list[dict]:
    seen, out = set(), []
    for it in items:
        k = (it["url"] or it["title"]).split("?")[0]
        if k in seen:
            continue
        seen.add(k)
        out.append(it)
    return out


def recent(items: list[dict], hours: int) -> list[dict]:
    cutoff = dt.datetime.now(dt.timezone.utc) - dt.timedelta(hours=hours)
    return [i for i in items if not i["published"] or dt.datetime.fromisoformat(i["published"]) >= cutoff]
