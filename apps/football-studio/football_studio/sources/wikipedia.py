"""Wikipedia: Artikeltext (Rohtext) mit Einzelnachweisen pro Satz und Infobox-Daten."""

from __future__ import annotations

import re
from urllib.parse import quote

import mwparserfromhell as mwp

from .. import http

RAW_URL = "https://{lang}.wikipedia.org/w/index.php"
PAGE_URL = "https://{lang}.wikipedia.org/wiki/{title}"

SKIP_SECTIONS = {
    "literatur", "weblinks", "einzelnachweise", "anmerkungen", "siehe auch", "filmografie",
    "erfolge", "erfolge als fußballer", "erfolge als spieler", "erfolge als trainer", "titel",
    "auszeichnungen", "statistik", "statistiken", "kader", "references", "external links",
    "see also", "honours", "career statistics", "further reading", "notes", "einsätze",
    "spieldaten", "aufstellungen", "aufstellung", "tore",
}


def page_url(title: str, lang: str = "de") -> str:
    return PAGE_URL.format(lang=lang, title=quote(title.replace(" ", "_")))


def fetch_raw(title: str, lang: str = "de") -> tuple[str, dict]:
    text, meta = http.get(
        RAW_URL.format(lang=lang), {"title": title, "action": "raw"}, ttl=24 * 3600
    )
    # Weiterleitung auflösen
    m = re.match(r"#(?:WEITERLEITUNG|REDIRECT)\s*\[\[([^\]|#]+)", text, re.I)
    if m:
        return fetch_raw(m.group(1).strip(), lang)
    meta["title"] = title
    meta["page_url"] = page_url(title, lang)
    return text, meta


# ---- Infobox ---------------------------------------------------------------


def _plain(value: str) -> str:
    code = mwp.parse(value)
    for tag in code.filter_tags(recursive=False):
        if str(tag.tag).lower() == "ref":
            code.remove(tag)
    txt = code.strip_code(normalize=True, collapse=True)
    return re.sub(r"\s+", " ", txt).strip()


def _wikilink_text(value: str) -> str:
    code = mwp.parse(value)
    links = code.filter_wikilinks()
    if links:
        lk = links[0]
        return str(lk.text or lk.title).strip()
    return _plain(value)


def infobox(wikitext: str) -> dict:
    """Erste Infobox als Dict (Schlüssel kleingeschrieben, Werte als Rohtext)."""
    code = mwp.parse(wikitext)
    for t in code.filter_templates(recursive=False):
        name = str(t.name).strip().lower()
        if name.startswith("infobox"):
            data = {"_name": name}
            for p in t.params:
                data[str(p.name).strip().lower()] = str(p.value).strip()
            return data
    return {}


def _year_range(text: str) -> tuple[int | None, int | None]:
    years = [int(y) for y in re.findall(r"(1[89]\d\d|20\d\d)", text)]
    if not years:
        return None, None
    start = years[0]
    end = years[1] if len(years) > 1 else (None if re.search(r"[–-]\s*$", text) else start)
    return start, end


def _apps(text: str) -> tuple[int | None, int | None]:
    m = re.search(r"(\d+)\s*\((\d+)\)", text)
    if m:
        return int(m.group(1)), int(m.group(2))
    return None, None


def stations(box: dict, kind: str = "vereine") -> list[dict]:
    """Vereins-/Nationalmannschafts-Stationen aus Infobox Fußballspieler (beide Formate)."""
    out: list[dict] = []
    table = box.get(f"{kind}_tabelle") if kind != "vereine" else box.get("vereine_tabelle")
    if kind == "national":
        table = box.get("nationalmannschaft_tabelle")
    if table:
        for t in mwp.parse(table).filter_templates():
            if str(t.name).strip().lower() != "team-station":
                continue
            ps = [str(p.value).strip() for p in t.params if not p.showkey]
            if len(ps) < 2:
                continue
            start, end = _year_range(ps[0])
            matches, goals = _apps(ps[2]) if len(ps) > 2 else (None, None)
            out.append(
                {"years": _plain(ps[0]), "start": start, "end": end, "team": _wikilink_text(ps[1]),
                 "matches": matches, "goals": goals}
            )
        return out
    # Altes Format: jahre / vereine / spiele (tore)
    keys = ("jahre", "vereine", "spiele (tore)") if kind == "vereine" else (
        "nationaljahre", "nationalmannschaft", "länderspiele (tore)")
    cols = [re.split(r"<br\s*/?>", box.get(k, ""), flags=re.I) for k in keys]
    for i, years in enumerate(cols[0]):
        if not years.strip():
            continue
        team = cols[1][i] if i < len(cols[1]) else ""
        apps = cols[2][i] if i < len(cols[2]) else ""
        start, end = _year_range(_plain(years))
        matches, goals = _apps(_plain(apps))
        out.append({"years": _plain(years), "start": start, "end": end, "team": _wikilink_text(team),
                    "matches": matches, "goals": goals})
    return out


GERMAN_MONTHS = {m: i + 1 for i, m in enumerate(
    ["januar", "februar", "märz", "april", "mai", "juni", "juli", "august", "september",
     "oktober", "november", "dezember"])}


def parse_german_date(value: str) -> str | None:
    txt = _plain(value)
    m = re.search(r"(\d{1,2})\.\s*([A-Za-zäÄ]+)\s+(\d{4})", txt)
    if m and m.group(2).lower() in GERMAN_MONTHS:
        return f"{int(m.group(3)):04d}-{GERMAN_MONTHS[m.group(2).lower()]:02d}-{int(m.group(1)):02d}"
    m = re.search(r"(\d{4})", txt)
    return m.group(1) if m else None


def parse_en_date(value: str) -> str | None:
    code = mwp.parse(value)
    for t in code.filter_templates():
        n = str(t.name).strip().lower()
        if n.startswith(("birth date", "death date", "birth-date", "bda", "dda")):
            nums = [str(p.value).strip() for p in t.params if not p.showkey]
            nums = [x for x in nums if x.isdigit()]
            if len(nums) >= 3:
                return f"{int(nums[0]):04d}-{int(nums[1]):02d}-{int(nums[2]):02d}"
    return None


# ---- Fließtext mit Belegen -------------------------------------------------

_REF_MARK = "⟦{}⟧"
_ABBREV = {"z", "bzw", "ca", "vgl", "u", "a", "d", "h", "dr", "st", "nr", "bspw", "sog", "inkl",
           "evtl", "ggf", "usw", "etc", "jr", "sen", "jun", "mio", "mrd", "tsd", "co", "bzw"}


def _ref_urls(tag) -> list[dict]:
    refs = []
    for t in mwp.parse(str(tag.contents or "")).filter_templates():
        url = None
        title = None
        work = None
        for p in t.params:
            k = str(p.name).strip().lower()
            v = str(p.value).strip()
            if k in ("url",) and v:
                url = v
            elif k in ("titel", "title"):
                title = _plain(v)
            elif k in ("werk", "work", "hrsg", "publisher", "website"):
                work = _plain(v)
        if url:
            refs.append({"url": url, "title": title or url, "work": work})
    for m in re.finditer(r"\[(https?://[^\s\]]+)\s*([^\]]*)\]", str(tag.contents or "")):
        refs.append({"url": m.group(1), "title": m.group(2) or m.group(1), "work": None})
    return refs


def _section_text(code) -> tuple[str, list[list[dict]]]:
    """Wandelt Wikitext in Klartext; Belege werden als Marker ⟦n⟧ eingefügt."""
    refs: list[list[dict]] = []
    parts: list[str] = []
    named: dict[str, int] = {}
    for node in code.nodes:
        if isinstance(node, mwp.nodes.Tag):
            tag = str(node.tag).lower()
            if tag == "ref":
                name = node.get("name").value.strip() if node.has("name") else None
                urls = _ref_urls(node)
                if not urls and name and name in named:
                    parts.append(_REF_MARK.format(named[name]))
                    continue
                refs.append(urls)
                if name:
                    named[name] = len(refs) - 1
                parts.append(_REF_MARK.format(len(refs) - 1))
                continue
            if tag in ("table", "gallery", "math", "references", "div", "timeline", "score"):
                continue
            parts.append(node.__strip__(normalize=True, collapse=True) or "")
            continue
        if isinstance(node, mwp.nodes.Template):
            continue
        if isinstance(node, mwp.nodes.Wikilink):
            title = str(node.title)
            if re.match(r"(?i)^(datei|file|bild|image|kategorie|category):", title):
                continue
            parts.append(str(node.text.strip_code() if node.text else node.title.strip_code()))
            continue
        if isinstance(node, mwp.nodes.ExternalLink):
            parts.append(str(node.title.strip_code()) if node.title else "")
            continue
        s = node.__strip__(normalize=True, collapse=True)
        parts.append(str(s) if s else "")
    text = "".join(parts)
    text = re.sub(r"\{\|.*?\|\}", " ", text, flags=re.S)  # Tabellen
    text = re.sub(r"^[*#:;].*$", " ", text, flags=re.M)  # Listen
    text = text.replace("'''", "").replace("''", "")
    text = re.sub(r"\(\s*\*?\s*\)", "", text)
    text = re.sub(r"[ \t]+", " ", text)
    return text, refs


def split_sentences(text: str) -> list[str]:
    text = re.sub(r"\s*\n+\s*", " \n ", text)
    text = re.sub(r"([.!?])((?:\u27e6\d+\u27e7)+)", r"\2\1", text)  # Beleg vor den Punkt ziehen
    tokens = re.split(r"(?<=[.!?])\s+(?=[⟦\"„A-ZÄÖÜ\n])", text)
    out: list[str] = []
    buf = ""
    for tok in tokens:
        buf = f"{buf} {tok}".strip() if buf else tok.strip()
        m = re.search(r"(\S+)[.!?]$", re.sub(r"(⟦\d+⟧)+$", "", buf).rstrip())
        last = m.group(1) if m else ""
        lastword = re.sub(r"[^\wäöüÄÖÜß]", "", last).lower()
        if re.fullmatch(r"\d{1,3}", lastword) or lastword in _ABBREV or (len(lastword) == 1 and lastword.isalpha()):
            continue  # Ordinalzahl/Abkürzung – kein Satzende
        out.append(buf)
        buf = ""
    if buf:
        out.append(buf)
    # Marker am Satzanfang gehören zum vorherigen Satz
    fixed: list[str] = []
    for s in out:
        s = s.replace("\n", " ").strip()
        m = re.match(r"^((?:⟦\d+⟧\s*)+)(.*)$", s)
        if m and fixed:
            fixed[-1] += m.group(1).strip()
            s = m.group(2)
        if s:
            fixed.append(s)
    return fixed


def article(wikitext: str) -> dict:
    """Zerlegt einen Artikel in Abschnitte und Sätze mit Belegen."""
    code = mwp.parse(wikitext)
    sections = code.get_sections(levels=None, include_lead=True, flat=True)
    result_sections = []
    all_refs: list[dict] = []
    for idx, sec in enumerate(sections):
        headings = sec.filter_headings(recursive=False)
        heading = headings[0].title.strip_code().strip() if headings else "Einleitung"
        level = headings[0].level if headings else 1
        if heading.lower() in SKIP_SECTIONS:
            continue
        if headings:
            sec.remove(headings[0])
        text, refs = _section_text(sec)
        sentences = []
        for s in split_sentences(text):
            ref_ids = [int(x) for x in re.findall(r"⟦(\d+)⟧", s)]
            clean = re.sub(r"⟦\d+⟧", "", s)
            clean = re.sub(r"\s+([,.;:!?])", r"\1", clean)
            clean = re.sub(r"\s+", " ", clean).strip()
            if len(clean) < 25 or not re.search(r"[.!?]$", clean):
                continue
            cites = []
            for rid in ref_ids:
                if rid < len(refs):
                    for r in refs[rid]:
                        if r not in all_refs:
                            all_refs.append(r)
                        cites.append(all_refs.index(r))
            sentences.append({"text": clean, "cites": sorted(set(cites))})
        if sentences:
            result_sections.append({"heading": heading, "level": level, "sentences": sentences})
    return {"sections": result_sections, "citations": all_refs}


def image_name(box: dict) -> str | None:
    for k in ("bildname", "bild", "image", "logo"):
        v = box.get(k)
        if v:
            v = re.sub(r"^(?i:datei|file|bild|image):", "", _plain(v)).strip()
            if re.search(r"\.(jpe?g|png|webp|tiff?)$", v, re.I):
                return v
    return None
