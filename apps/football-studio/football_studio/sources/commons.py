"""Wikimedia Commons: frei lizenzierte Fotos – nur mit geprüfter Lizenz und Namensnennung."""

from __future__ import annotations

import re
from urllib.parse import quote

import mwparserfromhell as mwp

from .. import http

RAW = "https://commons.wikimedia.org/w/index.php"
FILEPATH = "https://commons.wikimedia.org/wiki/Special:FilePath/{name}"

LICENSE_PATTERNS = [
    (r"cc-zero|cc0", "cc0", "CC0"),
    (r"^pd-|public domain|^pd$", "pd", "Gemeinfrei"),
    (r"cc-by-sa-(\d\.\d)", "cc-by-sa-{0}", "CC BY-SA {0}"),
    (r"cc-by-(\d\.\d)", "cc-by-{0}", "CC BY {0}"),
    (r"gfdl", "gfdl", "GFDL"),
]


def file_page_url(name: str) -> str:
    return f"https://commons.wikimedia.org/wiki/File:{quote(name.replace(' ', '_'))}"


def license_info(name: str) -> dict | None:
    """Liest Lizenz + Urheber aus dem Rohtext der Dateiseite."""
    try:
        text, _ = http.get(RAW, {"title": f"File:{name}", "action": "raw"}, ttl=30 * 24 * 3600, retries=3)
    except http.FetchError:
        return None
    code = mwp.parse(text)
    author = None
    licenses: list[tuple[str, str]] = []
    for t in code.filter_templates():
        n = str(t.name).strip().lower()
        if n == "information":
            for p in t.params:
                if str(p.name).strip().lower() == "author":
                    author = re.sub(r"\s+", " ", mwp.parse(str(p.value)).strip_code()).strip()
        names = [n] + ([str(p.value).strip().lower() for p in t.params] if n in ("self", "license") else [])
        for cand in names:
            for pat, key, label in LICENSE_PATTERNS:
                m = re.search(pat, cand)
                if m:
                    licenses.append((key.format(*m.groups()), label.format(*m.groups())))
                    break
    if not licenses:
        return None
    return {"licenses": licenses, "author": author or "unbekannt", "page": file_page_url(name)}


def pick_license(info: dict, allowed: list[str]) -> tuple[str, str] | None:
    allowed = [a.lower() for a in allowed]
    for key, label in info["licenses"]:
        if key in allowed or (key.startswith("pd") and "pd" in allowed):
            return key, label
    return None


def download(name: str, width: int = 1080) -> bytes | None:
    try:
        data, _ = http.get(
            FILEPATH.format(name=quote(name.replace(" ", "_"))),
            {"width": width},
            binary=True,
            ttl=90 * 24 * 3600,
            retries=4,
        )
    except http.FetchError:
        return None
    return data if isinstance(data, bytes) and len(data) > 5000 else None
