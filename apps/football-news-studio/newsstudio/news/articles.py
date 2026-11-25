"""Artikeltexte öffentlich zugänglicher Seiten. Beachtet robots.txt, umgeht keine Paywall/Logins."""

from __future__ import annotations

import hashlib
import re
import urllib.robotparser
from urllib.parse import urlparse

import trafilatura

from .. import http
from ..config import USER_AGENT

_robots: dict[str, urllib.robotparser.RobotFileParser | None] = {}
PAYWALL = re.compile(r"(Jetzt (weiter|kostenlos) (lesen|testen)|Abo abschließen|exklusiv für Abonnenten|"
                     r"Mit \w+ ?\+ weiterlesen|Plus-Artikel|Dieser Artikel ist nur für|registrieren Sie sich)", re.I)


def allowed(url: str) -> bool:
    host = urlparse(url).scheme + "://" + urlparse(url).netloc
    if host not in _robots:
        rp = urllib.robotparser.RobotFileParser()
        try:
            txt, _ = http.get(host + "/robots.txt", ttl=24 * 3600, retries=1, timeout=10)
            rp.parse(txt.splitlines())
            _robots[host] = rp
        except Exception:
            _robots[host] = None  # robots.txt nicht abrufbar -> wie üblich als erlaubt werten
    rp = _robots[host]
    return True if rp is None else rp.can_fetch(USER_AGENT, url)


def fetch(url: str) -> dict:
    if "news.google.com" in url:
        return {"ok": False, "reason": "Google-News-Link – nur Überschrift verwendet"}
    if not allowed(url):
        return {"ok": False, "reason": "robots.txt verbietet automatischen Abruf"}
    try:
        html, meta = http.get(url, ttl=6 * 3600, retries=2, timeout=20)
    except Exception as e:
        return {"ok": False, "reason": f"nicht abrufbar ({e})"}
    text = trafilatura.extract(html, include_comments=False, include_tables=False, favor_precision=True) or ""
    text = re.sub(r"(Uns auf Google folgen|Klicken Sie hier[^.]*\.|Lesen Sie auch:?[^\n]*)", "", text)
    paywall = bool(PAYWALL.search(text)) or len(text) < 400
    return {"ok": True, "text": text.strip(), "paywall": paywall, "chars": len(text),
            "sha256": hashlib.sha256(text.encode()).hexdigest(), "fetched_at": meta["fetched_at"]}
