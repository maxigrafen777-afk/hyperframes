"""Metadaten lesen: IPTC/XMP/EXIF (Fotos), ffprobe-Tags (Videos), Begleitdateien, Dateinamen."""

from __future__ import annotations

import csv
import json
import re
import subprocess
import xml.etree.ElementTree as ET
from pathlib import Path

from PIL import Image, IptcImagePlugin

IMAGE_EXT = {".jpg", ".jpeg", ".png", ".tif", ".tiff", ".webp", ".heic"}
VIDEO_EXT = {".mp4", ".mov", ".mxf", ".m4v", ".mkv", ".avi", ".webm"}

IPTC = {
    (2, 5): "title", (2, 105): "headline", (2, 120): "caption", (2, 25): "keywords", (2, 80): "byline",
    (2, 110): "credit", (2, 115): "source_field", (2, 116): "copyright", (2, 55): "date", (2, 90): "city",
    (2, 101): "country", (2, 15): "category", (2, 20): "supp_category",
}

# Feldnamen in Begleitdateien (XML/JSON/CSV) – klein geschrieben, ohne Namespace
FIELD_GROUPS = {
    "title": {"title", "headline", "name", "clipname", "clip_name", "assettitle"},
    "caption": {"description", "caption", "summary", "synopsis", "storyline", "shotlist", "notes", "comment"},
    "keywords": {"keywords", "keyword", "tags", "tag", "subject", "subjects"},
    "persons": {"player", "players", "person", "people", "persons", "personinimage", "athlete", "athletes", "coach"},
    "teams": {"team", "teams", "club", "clubs", "hometeam", "awayteam", "home", "away"},
    "competition": {"competition", "league", "tournament", "event", "season", "competitionname"},
    "date": {"date", "matchdate", "recorded", "recordingdate", "created", "creationdate", "datecreated", "shootdate",
             "eventdate", "kickoff"},
    "credit": {"credit", "copyright", "rights", "provider", "byline", "creator", "photographer"},
    "clip_type": {"type", "cliptype", "category", "contenttype", "assettype"},
}
SHOT_WORDS = {
    "interview": ["interview", "statement", "reaction", "flash"],
    "pressekonferenz": ["press conference", "pressekonferenz", "presser", "pk"],
    "training": ["training", "practice", "session"],
    "jubel": ["celebration", "celebrates", "jubel", "fans"],
    "spielszene": ["goal", "tor", "highlights", "match", "action", "chance", "save", "assist", "game"],
}


def _dec(v) -> str:
    if isinstance(v, bytes):
        for enc in ("utf-8", "latin-1"):
            try:
                return v.decode(enc).strip("\x00 ").strip()
            except UnicodeDecodeError:
                continue
    return str(v).strip()


def _date(s: str | None) -> str | None:
    if not s:
        return None
    s = str(s)
    m = re.search(r"(20\d\d|19\d\d)[-:/._]?(\d\d)[-:/._]?(\d\d)", s)
    if m:
        y, mo, d = m.groups()
        if 1 <= int(mo) <= 12 and 1 <= int(d) <= 31:
            return f"{y}-{mo}-{d}"
    m = re.search(r"(\d{1,2})\.(\d{1,2})\.(20\d\d|19\d\d)", s)
    if m:
        return f"{m.group(3)}-{int(m.group(2)):02d}-{int(m.group(1)):02d}"
    return None


def _xmp_values(node) -> list[str]:
    out: list[str] = []
    if isinstance(node, dict):
        for k, v in node.items():
            if k in ("lang",):
                continue
            out += _xmp_values(v)
    elif isinstance(node, list):
        for v in node:
            out += _xmp_values(v)
    elif node is not None:
        out.append(str(node))
    return out


def _xmp_find(xmp: dict, key: str):
    if isinstance(xmp, dict):
        for k, v in xmp.items():
            if k.lower() == key.lower():
                return v
            r = _xmp_find(v, key)
            if r is not None:
                return r
    elif isinstance(xmp, list):
        for v in xmp:
            r = _xmp_find(v, key)
            if r is not None:
                return r
    return None


def read_image(path: Path) -> dict:
    out: dict = {"kind": "foto", "persons": [], "teams": [], "keywords": []}
    with Image.open(path) as im:
        out["width"], out["height"] = im.size
        try:
            info = IptcImagePlugin.getiptcinfo(im) or {}
        except Exception:
            info = {}
        for key, field in IPTC.items():
            if key in info:
                v = info[key]
                vals = [_dec(x) for x in v] if isinstance(v, list) else [_dec(v)]
                out[field] = vals if field == "keywords" else " ".join(vals)
        try:
            xmp = im.getxmp() if hasattr(im, "getxmp") else {}
        except Exception:
            xmp = {}
        if xmp:
            for key, field in (("description", "caption"), ("subject", "keywords"), ("PersonInImage", "persons"),
                               ("Credit", "credit"), ("creator", "byline"), ("DateCreated", "date"),
                               ("Headline", "headline"), ("rights", "copyright"), ("City", "city"), ("title", "title")):
                node = _xmp_find(xmp, key)
                if node is None:
                    continue
                vals = [v for v in _xmp_values(node) if v and v != "x-default"]
                if not vals:
                    continue
                if field in ("keywords", "persons"):
                    out[field] = list(dict.fromkeys(list(out.get(field) or []) + vals))
                elif not out.get(field):
                    out[field] = " ".join(vals)
        try:
            exif = im.getexif()
            dto = exif.get_ifd(0x8769).get(36867) or exif.get(306)
            if dto and not out.get("date"):
                out["date"] = str(dto)
        except Exception:
            pass
    out["captured_at"] = _date(out.get("date"))
    return out


def read_video(path: Path) -> dict:
    out: dict = {"kind": "video", "persons": [], "teams": [], "keywords": []}
    p = subprocess.run(["ffprobe", "-v", "error", "-print_format", "json", "-show_format", "-show_streams", str(path)],
                       capture_output=True, text=True)
    if p.returncode != 0:
        raise ValueError(f"Video nicht lesbar: {p.stderr[:200]}")
    info = json.loads(p.stdout)
    vs = next((s for s in info.get("streams", []) if s.get("codec_type") == "video"), None)
    if not vs:
        raise ValueError("Keine Videospur")
    rot = 0
    for sd in vs.get("side_data_list", []) or []:
        if "rotation" in sd:
            rot = abs(int(sd["rotation"]))
    w, h = int(vs.get("width", 0)), int(vs.get("height", 0))
    out["width"], out["height"] = (h, w) if rot in (90, 270) else (w, h)
    out["duration"] = float(info.get("format", {}).get("duration") or vs.get("duration") or 0)
    out["has_audio"] = any(s.get("codec_type") == "audio" for s in info.get("streams", []))
    tags = {k.lower(): v for k, v in (info.get("format", {}).get("tags") or {}).items()}
    out["title"] = tags.get("title", "")
    out["caption"] = " ".join(filter(None, [tags.get("description", ""), tags.get("comment", ""), tags.get("synopsis", "")]))
    if tags.get("keywords"):
        out["keywords"] = [k.strip() for k in re.split(r"[;,]", tags["keywords"]) if k.strip()]
    out["credit"] = tags.get("copyright", "") or tags.get("artist", "")
    out["captured_at"] = _date(tags.get("creation_time") or tags.get("date"))
    return out


# ---- Begleitdateien -----------------------------------------------------------


def _local(tag: str) -> str:
    return tag.rsplit("}", 1)[-1].lower().replace("-", "").replace("_", "")


def _absorb(out: dict, key: str, value: str) -> None:
    key = key.lower().replace("-", "").replace("_", "").replace(" ", "")
    value = (value or "").strip()
    if not value:
        return
    for field, names in FIELD_GROUPS.items():
        if key in names:
            if field in ("keywords", "persons", "teams"):
                parts = [x.strip() for x in re.split(r"[;,|]", value) if x.strip()]
                out.setdefault(field, [])
                out[field] = list(dict.fromkeys(out[field] + parts))
            elif field == "date":
                out.setdefault("captured_at", _date(value))
            else:
                out[field] = (out.get(field, "") + " " + value).strip() if field == "caption" else (out.get(field) or value)
            return


def _walk_json(out: dict, node, key: str = "") -> None:
    if isinstance(node, dict):
        for k, v in node.items():
            _walk_json(out, v, k)
    elif isinstance(node, list):
        for v in node:
            _walk_json(out, v, key)
    elif node is not None:
        _absorb(out, key, str(node))


def read_sidecar(path: Path) -> dict:
    """Sucht <datei>.xml/.json/.csv/.txt bzw. <datei>.<ext>.xml und liest bekannte Felder."""
    out: dict = {}
    cands = [path.with_suffix(s) for s in (".xml", ".json", ".csv", ".txt")] + \
            [Path(str(path) + s) for s in (".xml", ".json")]
    for c in cands:
        if not c.exists() or c == path:
            continue
        out["sidecar"] = c.name
        txt = c.read_text("utf-8", errors="replace")
        if c.suffix == ".json":
            try:
                _walk_json(out, json.loads(txt))
            except json.JSONDecodeError:
                pass
        elif c.suffix == ".xml":
            try:
                root = ET.fromstring(txt)
            except ET.ParseError:
                continue
            for el in root.iter():
                if el.text and el.text.strip():
                    _absorb(out, _local(el.tag), el.text)
                for ak, av in el.attrib.items():
                    _absorb(out, _local(ak), av)
        elif c.suffix == ".csv":
            rows = list(csv.DictReader(txt.splitlines()))
            for r in rows[:1]:
                for k, v in r.items():
                    _absorb(out, k or "", v or "")
        else:
            out["caption"] = (out.get("caption", "") + " " + txt.strip()).strip()
    # Ordner-Manifest (manifest.csv mit Spalte filename/datei)
    man = path.parent / "manifest.csv"
    if man.exists():
        for r in csv.DictReader(man.read_text("utf-8", errors="replace").splitlines()):
            fn = (r.get("filename") or r.get("datei") or r.get("file") or "").strip()
            if fn and fn == path.name:
                out["sidecar"] = (out.get("sidecar", "") + " manifest.csv").strip()
                for k, v in r.items():
                    if k and k.lower() not in ("filename", "datei", "file"):
                        _absorb(out, k, v or "")
    return out


def parse_filename(path: Path) -> dict:
    stem = path.stem
    words = re.sub(r"[_\-.]+", " ", stem)
    words = re.sub(r"(?<=[a-zäöü])(?=[A-ZÄÖÜ])", " ", words)
    out = {"filename_text": words, "captured_at": _date(stem)}
    low = words.lower()
    for kind, kws in SHOT_WORDS.items():
        if any(re.search(rf"\b{re.escape(k)}\b", low) for k in kws):
            out["clip_type"] = kind
            break
    return out


def read_any(path: Path) -> dict:
    ext = path.suffix.lower()
    if ext in IMAGE_EXT:
        meta = read_image(path)
    elif ext in VIDEO_EXT:
        meta = read_video(path)
    else:
        raise ValueError(f"Nicht unterstütztes Format: {ext}")
    side = read_sidecar(path)
    fname = parse_filename(path)
    for k, v in side.items():
        if k in ("keywords", "persons", "teams"):
            meta[k] = list(dict.fromkeys(list(meta.get(k) or []) + v))
        elif v and not meta.get(k):
            meta[k] = v
    meta.setdefault("captured_at", None)
    meta["captured_at"] = meta.get("captured_at") or fname.get("captured_at")
    meta["filename_text"] = fname["filename_text"]
    meta["clip_type"] = meta.get("clip_type") or fname.get("clip_type")
    return meta
