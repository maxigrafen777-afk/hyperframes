"""Aussagen (Claims) aus Artikeln: extrahieren, quellenübergreifend bündeln, einstufen.

Status:
  bestätigt       – offizielle Mitteilung/Bestätigung oder wörtliches Zitat eines Beteiligten, Tier-0/1-Quelle
  berichtet       – mindestens zwei unabhängige seriöse Quellen berichten es als Tatsache
  gerücht         – Konjunktiv-/Gerüchtesprache oder nur eine Quelle
  meinung         – Kommentar, Experteneinschätzung, Gastbeitrag (nie als Tatsache verwenden)
"""

from __future__ import annotations

import re

from ..library import entities

CONFIRM = re.compile(r"\b(offiziell|bestätigt\w*|teilte\w* .{0,40}mit|Mitteilung|Statement|Stellungnahme|"
                     r"verkündet\w*|unterschrieb\w*|unterzeichnet\w*|verlängert\w*|gab .{0,30} bekannt|"
                     r"laut Vereinsangaben|auf (der )?Pressekonferenz)\b", re.I)
RUMOR = re.compile(r"\b(soll|sollen|sollte|angeblich|Gerücht\w*|spekuliert\w*|Spekulation\w*|Interesse|interessiert|"
                   r"könnte|könnten|wohl|dem Vernehmen nach|Medienberichten zufolge|nach Informationen (von|der|des)|"
                   r"berichtet\w*|laut \w+|wie \w+ berichtet|Insider|im Gespräch|beobachtet|Kandidat|buhlen|liebäugel\w*)\b", re.I)
OPINION = re.compile(r"\b(Kommentar|Gastbeitrag|Meinung|Experte\w*|Kolumne|findet|glaube\w*|meiner Ansicht)\b", re.I)
SAY = re.compile(r"\b(sagte|sagt|erklärte|erklärt|betonte|so \w+ \w+|meinte|ergänzte|kündigte .{0,20} an)\b")
NUM = re.compile(r"(\d+(?:[.,]\d+)?)\s*(Millionen|Mio\.?|Milliarden|Euro|€|Jahre|Jahren|Tore|Spiele|Prozent|%)|"
                 r"\b(?:bis|bis zum Jahr)\s+(20\d\d)\b")
STOP = set("der die das und oder ein eine einer eines dem den des im in am an auf mit für von zu zum zur bei nach "
           "ist sind war waren wird werden hat haben nicht auch noch nur sich er sie es man als wie so dass".split())


def sentences(text: str) -> list[str]:
    text = re.sub(r"\s+", " ", text)
    parts = re.split(r"(?<=[.!?“\"])\s+(?=[A-ZÄÖÜ„\"])", text)
    out, buf = [], ""
    for p in parts:
        buf = f"{buf} {p}".strip() if buf else p
        if re.search(r"\b(\d{1,2}|z|ca|bzw|Dr|St|u|Nr)\.$", buf):
            continue
        out.append(buf)
        buf = ""
    if buf:
        out.append(buf)
    return [s.strip() for s in out if 30 <= len(s) <= 400]


def _tokens(s: str) -> set[str]:
    words = re.findall(r"[A-Za-zÄÖÜäöüß0-9]{3,}", s)
    return {w.lower() for w in words if w.lower() not in STOP}


def classify(sentence: str, source_tier: int, is_opinion_article: bool) -> str:
    if is_opinion_article or (OPINION.search(sentence) and not SAY.search(sentence)):
        return "meinung"
    if RUMOR.search(sentence) and not CONFIRM.search(sentence):
        return "gerücht"
    if CONFIRM.search(sentence) or ("„" in sentence and SAY.search(sentence)):
        return "bestätigt" if source_tier <= 1 else "berichtet"
    return "berichtet"


def numbers(s: str) -> list[str]:
    out = []
    for m in NUM.finditer(s):
        out.append(m.group(0).strip())
    return out


def extract(articles: list[dict], topic_entities: list[dict]) -> list[dict]:
    names = set()
    for e in topic_entities:
        names.add(entities.norm(e["name"]))
        parts = e["name"].split()
        if len(parts) > 1 and e["kind"] != "verein":
            names.add(entities.norm(parts[-1]))
        for a in (e.get("aliases") or "").split("|"):
            if a:
                names.add(entities.norm(a))
    raw: list[dict] = []
    for a in articles:
        if not a.get("text"):
            continue
        opinion = bool(re.search(r"(Kommentar|Gastbeitrag|Kolumne|Meinung)", a["title"] + a["text"][:200]))
        for i, s in enumerate(sentences(a["text"])[:60]):
            ns = entities.norm(s)
            relevant = any(re.search(rf"(?<![a-z]){re.escape(n)}(?![a-z])", ns) for n in names if n)
            if not relevant and i > 2:
                continue
            raw.append({"text": s, "article": a["id"], "source": a["source"], "tier": a["tier"],
                        "status": classify(s, a["tier"], opinion), "numbers": numbers(s), "quote": "„" in s,
                        "tokens": _tokens(s), "lead": i <= 2})
    # Bündeln ähnlicher Aussagen aus verschiedenen Quellen
    clusters: list[dict] = []
    for r in raw:
        best, best_sim = None, 0.0
        for c in clusters:
            sim = len(r["tokens"] & c["tokens"]) / max(1, len(r["tokens"] | c["tokens"]))
            if sim > best_sim:
                best, best_sim = c, sim
        if best and best_sim >= 0.34:
            best["variants"].append(r)
            best["tokens"] |= r["tokens"]
        else:
            clusters.append({"tokens": set(r["tokens"]), "variants": [r]})
    claims = []
    for i, c in enumerate(clusters):
        vs = c["variants"]
        sources = sorted({v["source"] for v in vs})
        statuses = [v["status"] for v in vs]
        best_tier = min(v["tier"] for v in vs)
        if "meinung" in statuses and len(set(statuses)) == 1:
            status = "meinung"
        elif "bestätigt" in statuses:
            status = "bestätigt"
        elif all(s == "gerücht" for s in statuses):
            status = "gerücht"
        elif len(sources) >= 2 and best_tier <= 2:
            status = "berichtet"
        elif best_tier <= 1 and "gerücht" not in statuses:
            status = "berichtet"
        else:
            status = "gerücht"
        rep = sorted(vs, key=lambda v: (v["tier"], len(v["text"])))[0]
        nums = sorted({n for v in vs for n in v["numbers"]})
        claims.append({
            "id": f"c{i}", "text": rep["text"], "status": status, "sources": sources,
            "articles": sorted({v["article"] for v in vs}), "best_tier": best_tier, "numbers": nums,
            "quote": any(v["quote"] for v in vs), "variants": [{"source": v["source"], "text": v["text"]} for v in vs][:6],
            "weight": round(len(sources) * 2 + (3 - best_tier) + (1.5 if status == "bestätigt" else 0)
                            + (1 if any(v["lead"] for v in vs) else 0) + (0.5 if nums else 0), 2),
        })
    claims.sort(key=lambda c: -c["weight"])
    for i, c in enumerate(claims):
        c["id"] = f"c{i}"
    return claims


def conflicts(claims: list[dict]) -> list[dict]:
    """Unterschiedliche Geldbeträge zum gleichen Thema (z. B. Ablöse 80 vs. 100 Mio.)."""
    money: dict[str, set[str]] = {}
    for c in claims:
        for v in c["variants"]:
            for m in re.finditer(r"(\d+(?:[.,]\d+)?)\s*(Millionen|Mio)", v["text"]):
                key = "ablöse" if re.search(r"Ablöse|Transfer|Wechsel", v["text"], re.I) else (
                    "gehalt" if re.search(r"Gehalt|verdien|Jahresgehalt", v["text"], re.I) else None)
                if key:
                    money.setdefault(key, set()).add(f"{m.group(1)} Mio. ({v['source']})")
    out = []
    for k, vals in money.items():
        amounts = {v.split(" ")[0] for v in vals}
        if len(amounts) > 1:
            out.append({"topic": k, "values": sorted(vals)})
    return out
