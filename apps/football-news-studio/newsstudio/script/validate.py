"""Prüfer: keine unbelegten Zahlen, Gerüchte gekennzeichnet, Meinungen nicht als Fakt, Länge."""

from __future__ import annotations

import re

HEDGE = re.compile(r"\b(laut|soll|sollen|angeblich|Gerücht|berichte\w*|Medienberichten|spekulier\w*|könnte|offenbar|"
                   r"wohl|nach Informationen)\b", re.I)


def _nums(text: str) -> set[str]:
    out = set()
    for m in re.finditer(r"\d+(?:[.,:]\d+)*", text):
        out.add(m.group(0))
        out |= {p.lstrip("0") or "0" for p in re.split(r"[.,:]", m.group(0))}
    return out


def validate(script: dict, research: dict, settings) -> dict:
    issues = []
    corpus = " ".join([c["text"] + " " + " ".join(v["text"] for v in c["variants"]) for c in research["claims"]] +
                      [a.get("title", "") + " " + a.get("excerpt", "") for a in research["articles"]])
    allowed = _nums(corpus) | {str(len(research.get("sources", [])))}
    claims = {c["id"]: c for c in research["claims"]}
    for sc in script["scenes"]:
        for m in re.finditer(r"\d+(?:[.,:]\d+)*", sc["text"]):
            tok = m.group(0).rstrip(".,")
            parts = [p.lstrip("0") or "0" for p in re.split(r"[.,:]", tok)]
            if tok not in allowed and not all(p in allowed for p in parts) and not re.fullmatch(r"\d", tok):
                issues.append({"scene": sc["id"], "level": "fehler", "message": f"Zahl „{tok}“ steht in keiner Quelle."})
        for cid in sc.get("claim_ids", []):
            c = claims.get(cid)
            if not c:
                issues.append({"scene": sc["id"], "level": "fehler", "message": f"Unbekannte Aussage {cid}."})
                continue
            if c["status"] == "gerücht" and not HEDGE.search(sc["text"]):
                issues.append({"scene": sc["id"], "level": "fehler",
                               "message": "Gerücht ist nicht als Gerücht gekennzeichnet (z. B. „laut … soll“)."})
            if c["status"] == "meinung" and not re.search(r"\b(meint|findet|sagt|so|laut|Experte|Kommentar)\b", sc["text"]):
                issues.append({"scene": sc["id"], "level": "fehler", "message": "Meinung wird als Tatsache dargestellt."})
    total = script.get("est_seconds", 0)
    if total < settings.target_min_seconds:
        issues.append({"scene": None, "level": "warnung", "message": f"Geschätzte Länge {total:.0f} s < {settings.target_min_seconds} s."})
    if total > settings.target_max_seconds:
        issues.append({"scene": None, "level": "warnung", "message": f"Geschätzte Länge {total:.0f} s > {settings.target_max_seconds} s."})
    no_src = [sc["id"] for sc in script["scenes"][1:-2] if not sc.get("claim_ids")]
    if no_src:
        issues.append({"scene": None, "level": "hinweis", "message": f"Szenen ohne Aussage-Beleg: {', '.join(no_src)}"})
    return {"ok": not any(i["level"] == "fehler" for i in issues), "issues": issues}
