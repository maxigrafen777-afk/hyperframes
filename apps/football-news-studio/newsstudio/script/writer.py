"""SKRIPT: deutsches TikTok-News-Skript (60–120 s), Szene für Szene, nur aus recherchierten Aussagen.

Engines
  claude    – journalistischer Stil, eigene Einordnung (benötigt ANTHROPIC_API_KEY)
  briefing  – ohne KI: sachliches Briefing mit Quellennennung (Entwurf, sollte überarbeitet werden)
"""

from __future__ import annotations

import json
import re
from typing import Literal

from pydantic import BaseModel, Field

from ..config import Settings, anthropic_available
from ..speech import count_words
from .validate import validate

WPS = 2.55
MOTIONS = ["zoom_in", "pan_right", "zoom_out", "pan_left"]
TRANSITIONS = ["whip", "cut", "flash", "cut", "zoom", "cut"]


class Graphic(BaseModel):
    type: Literal["none", "headline", "transfer", "stat", "quote", "tag"] = "none"
    title: str = ""
    value: str = ""
    label: str = ""
    tag: str = ""  # OFFIZIELL | BERICHT | GERÜCHT


class Scene(BaseModel):
    id: str = ""
    text: str
    claim_ids: list[str] = Field(default_factory=list)
    sources: list[str] = Field(default_factory=list)
    media_kind: Literal["video", "foto", "grafik", "auto"] = "auto"
    motion: Literal["zoom_in", "zoom_out", "pan_left", "pan_right", "static"] = "zoom_in"
    transition: Literal["cut", "whip", "flash", "zoom", "fade"] = "cut"
    graphic: Graphic = Field(default_factory=Graphic)
    emphasis: list[str] = Field(default_factory=list)


class Script(BaseModel):
    title: str
    caption: str
    hashtags: list[str]
    scenes: list[Scene]
    engine: str
    words: int = 0
    est_seconds: float = 0
    validation: dict = Field(default_factory=dict)


# ---- Hilfen -----------------------------------------------------------------

HEDGE_STRICT = re.compile(r"\b(soll|sollen|sollte|angeblich|könnte|könnten|wohl|dem Vernehmen nach|Medienberichten zufolge|"
                          r"nach Informationen (von|der|des))\b", re.I)
BAD_START = re.compile(r"^(Demnach|Zuvor|Daraufhin|Dies|Diese[rsm]?|Dazu|Dabei|Jetzt|Und|Aber|Doch|Damit|Daher|Darum|Deshalb|Hier|So |Auch|"
                       r"Zudem|Außerdem|Trotzdem|Dennoch|Er |Sie |Es |Das |Den |Dem |Man |Wir |Ich )")


def _clean_claim(text: str) -> str | None:
    t = re.sub(r"\s+", " ", text).strip().replace("»", "„").replace("«", "“")
    t = re.sub(r"\s*\([^)]*\)", "", t)
    if re.search(r'[a-zäöü0-9] "[A-ZÄÖÜ]', t):
        return None  # Überschrift + Zitat zusammengeklebt
    if t.count("„") != t.count("“") or t.count('"') % 2 or re.search(r"[“\"],? (hieß es|sagte|so)\b", t[:40]):
        return None
    if BAD_START.search(t) or not t[:1].isupper():
        return None
    if re.search(r"(Klicken|Newsletter|Abo|Anzeige|Uns auf Google|Lesen Sie)", t):
        return None
    n = len(t.split())
    if n < 6 or n > 32:
        return None
    if not t.endswith((".", "!", "?", "“")):
        t += "."
    return t


def _short(text: str, n: int) -> str:
    """Kürzt an einer Wortgrenze (nie mitten im Wort)."""
    if len(text) <= n:
        return text
    cut = text[:n].rsplit(" ", 1)[0].rstrip(",;:–-")
    return cut + " …"


def _src_phrase(sources: list[str]) -> str:
    srcs = [s for s in sources if s][:2]
    if not srcs:
        return "Medienberichten zufolge"
    return f"laut {srcs[0]}" if len(srcs) == 1 else f"laut {srcs[0]} und {srcs[1]}"


def _emphasis(text: str, names: list[str]) -> list[str]:
    out = [n for n in names if n.lower() in text.lower()]
    out += re.findall(r"\b\d+(?:[.,]\d+)?(?:\s*(?:Millionen|Mio\.?|Euro|Jahre|Prozent))?", text)
    out += re.findall(r"\bbis 20\d\d\b", text)
    return list(dict.fromkeys(out))[:6]


def est_seconds(scenes: list[Scene]) -> float:
    return round(sum(count_words(s.text) for s in scenes) / WPS + 0.25 * len(scenes), 1)


def finalize(script: Script, research: dict, settings: Settings) -> Script:
    names = [e["name"] for e in research.get("entities", [])] + [e["name"].split()[-1] for e in research.get("entities", [])]
    for i, sc in enumerate(script.scenes):
        sc.id = f"s{i + 1:02d}"
        sc.text = re.sub(r"\s+", " ", sc.text).strip()
        if not sc.emphasis:
            sc.emphasis = _emphasis(sc.text, names)
        if i == 0:
            sc.transition = "cut"
    script.words = sum(count_words(s.text) for s in script.scenes)
    script.est_seconds = est_seconds(script.scenes)
    script.validation = validate(script.model_dump(), research, settings)
    return script


# ---- Briefing (ohne KI) ------------------------------------------------------


def briefing(research: dict, settings: Settings) -> Script:
    ents = research.get("entities", [])
    person = next((e for e in ents if e["kind"] != "verein"), ents[0] if ents else None)
    name = person["name"] if person else research["topic"]
    short = name.split()[-1] if person and person["kind"] != "verein" else name
    claims = [c for c in research["claims"] if c["status"] != "meinung"]
    n_sources = len(research.get("sources", []))
    top_article = next((a for a in research["articles"] if a.get("tier", 3) <= 1 and a.get("title")), None) or \
        next((a for a in research["articles"] if a.get("title")), None)
    scenes: list[Scene] = []
    headline = top_article["title"] if top_article else research["topic"]
    headline = re.sub(r"^(Fußball|Sport|News|Liveticker|Ticker|Exklusiv)\s*:\s*", "", headline, flags=re.I)
    hook = f"{name}: Das ist der neue Stand." if n_sources >= 3 else f"Neuigkeiten zu {name}."
    scenes.append(Scene(text=hook, media_kind="video", motion="zoom_in",
                        graphic=Graphic(type="headline", title=_short(headline, 110), tag="NEWS"),
                        sources=[top_article["source"]] if top_article else []))
    budget = int((settings.target_min_seconds + settings.target_max_seconds) / 2 * WPS) - 45
    used_words, used_tokens, used_sets, used_nums = 0, set(), [], []
    picked = []
    order = {"bestätigt": 0, "berichtet": 1, "gerücht": 2}
    for c in sorted(claims, key=lambda c: (order.get(c["status"], 3), -c["weight"])):
        txt = None
        cands = [c["text"]] + [v["text"] for v in c["variants"]]
        if c["status"] in ("bestätigt", "berichtet"):  # Formulierung ohne Konjunktiv bevorzugen
            cands.sort(key=lambda t: bool(HEDGE_STRICT.search(t)))
        for v in cands:
            txt = _clean_claim(v)
            if txt:
                break
        if not txt:
            continue
        toks = set(re.findall(r"\w{5,}", txt.lower()))
        nums = set(re.findall(r"\b(?:\d+|Januar|Februar|März|April|Mai|Juni|Juli|August|September|Oktober|November|Dezember)\b", txt))
        if nums and any(nums & pn and len(toks & pt) >= 1 for pn, pt in used_nums):
            continue  # gleiche Zahl/Datum zum gleichen Sachverhalt
        if any(len(toks & prev) / max(1, len(toks | prev)) > 0.3 or len(toks & prev) >= 4 for prev in used_sets):
            continue  # inhaltlich doppelt
        w = count_words(txt) + 4
        if used_words + w > budget:
            continue
        used_tokens |= toks
        used_sets.append(toks)
        used_nums.append((nums, toks))
        used_words += w
        picked.append((c, txt))
        if len(picked) >= 9:
            break
    for i, (c, txt) in enumerate(picked):
        srcs = c["sources"]
        if c["status"] in ("bestätigt", "berichtet") and HEDGE_STRICT.search(txt):
            c = {**c, "status": "gerücht"}  # Text klingt nach Gerücht -> auch so kennzeichnen
        if c["status"] == "bestätigt":
            spoken = txt
            tag = "OFFIZIELL" if re.search(r"Verein|Klub|Statement|Mitteilung|bestätigt|teilte", txt) else "BESTÄTIGT"
        elif c["status"] == "berichtet":
            spoken = txt if len(srcs) >= 2 else f"{_src_phrase(srcs).capitalize()}: {txt}"
            tag = "BERICHT"
        else:
            spoken = f"Gerücht, {_src_phrase(srcs)}: {txt}"
            tag = "GERÜCHT"
        graphic = Graphic(type="tag", tag=tag)
        if c["quote"] and "„" in txt:
            q = re.search(r"„([^“]{8,120})“", txt)
            q = q if q and len(q.group(1).split()) >= 3 else None
            if q:
                graphic = Graphic(type="quote", title=q.group(1), tag=tag)
        elif c["numbers"]:
            m = re.search(r"(\d+(?:[.,]\d+)?)\s*(Millionen|Mio\.?|Euro|Jahre|Prozent)", txt) or re.search(r"bis (20\d\d)", txt)
            if m:
                graphic = Graphic(type="stat", value=m.group(1), label=(m.group(2) if m.lastindex and m.lastindex > 1 else "Vertrag bis"), tag=tag)
        scenes.append(Scene(text=spoken, claim_ids=[c["id"]], sources=srcs[:3], motion=MOTIONS[(i + 1) % 4],
                            transition=TRANSITIONS[i % len(TRANSITIONS)], graphic=graphic,
                            media_kind="video" if i % 2 == 0 else "auto"))
    confirmed = sum(1 for c, _ in picked if c["status"] == "bestätigt")
    rumors = sum(1 for c, _ in picked if c["status"] == "gerücht")
    analysis = f"Zur Einordnung: {n_sources} Redaktionen berichten aktuell über {short}."
    if confirmed:
        analysis += f" {confirmed} der genannten Punkte sind offiziell bestätigt"
        analysis += f", {rumors} sind bislang nur Gerüchte." if rumors else "."
    elif rumors:
        analysis += " Vieles davon ist bislang nicht offiziell bestätigt."
    scenes.append(Scene(text=analysis, motion="zoom_out", transition="flash", graphic=Graphic(type="tag", tag="EINORDNUNG")))
    scenes.append(Scene(text="Was meinst du dazu? Schreib es in die Kommentare und folg uns für mehr Fußball-News.",
                        motion="zoom_in", transition="whip", graphic=Graphic(type="headline", title="FOLGEN FÜR MEHR NEWS", tag="")))
    script = Script(title=_short(headline, 90), caption=f"{headline} ⚽ Quellen: {', '.join(research.get('sources', [])[:5])}",
                    hashtags=["#fußball", "#bundesliga", "#fussballnews", "#" + re.sub(r"\W", "", short.lower())],
                    scenes=scenes, engine="briefing")
    return finalize(script, research, settings)


# ---- Claude ------------------------------------------------------------------

SYSTEM = """Du bist Redakteur:in eines großen deutschen Fußball-News-Kanals auf TikTok.
Schreibe ein Sprecherskript für ein Hochkant-Video (60–120 Sekunden, ca. 160–270 Wörter).

Stil: journalistisch, präzise, natürlich gesprochen, hohe Informationsdichte. Starker Einstieg in den ersten
zwei Sekunden, klarer Spannungsbogen, am Ende eine eigenständige Einordnung (was bedeutet das, was ist offen)
und eine kurze Aufforderung zum Kommentieren.

Harte Regeln:
- Nur Informationen aus den gelieferten Aussagen (claims). Nichts erfinden: keine Zahlen, Daten, Zitate, Namen.
- Status "gerücht": immer als Gerücht kennzeichnen und die Quelle nennen („laut Sky soll …“).
- Status "meinung": nur als Meinung der Quelle wiedergeben, nie als Tatsache.
- Bei widersprüchlichen Angaben beide Versionen mit Quelle nennen.
- Formuliere in eigenen Worten; übernimm keine ganzen Sätze aus den Artikeln (Zitate von Beteiligten in „…“ sind erlaubt).
- Gesundheit und Privatleben: nur, was offiziell bestätigt ist, ohne Spekulation.
- 8–14 Szenen, jede 1–2 kurze Sätze. Jede Szene nennt claim_ids und sources.
- media_kind: "video" bei Spiel-/Trainings-/Interview-Bezug, sonst "auto". graphic: headline (nur Szene 1),
  stat (Zahl + Einheit), quote (wörtliches Zitat), transfer, oder tag (OFFIZIELL/BERICHT/GERÜCHT/EINORDNUNG).
- emphasis: Namen und Zahlen der Szene, die hervorgehoben werden sollen."""


class _LLMScript(BaseModel):
    title: str
    caption: str
    hashtags: list[str]
    scenes: list[Scene]


def claude(research: dict, settings: Settings, feedback: str | None = None) -> Script:
    import anthropic

    material = {"thema": research["topic"], "personen": research.get("entities", []),
                "widersprueche": research.get("conflicts", []),
                "claims": [{k: c[k] for k in ("id", "text", "status", "sources", "numbers", "quote")} |
                           {"varianten": [v["text"] for v in c["variants"][:3]]} for c in research["claims"][:60]]}
    user = "Recherche (JSON):\n" + json.dumps(material, ensure_ascii=False)
    if feedback:
        user += "\n\nDer vorige Entwurf hatte diese Fehler – korrigiere sie:\n" + feedback
    client = anthropic.Anthropic()
    resp = client.beta.messages.parse(
        model=settings.claude_model, max_tokens=16000, betas=["server-side-fallback-2026-07-01"], fallbacks="default",
        output_config={"effort": "high"}, system=SYSTEM, messages=[{"role": "user", "content": user}],
        output_format=_LLMScript,
    )
    if resp.stop_reason == "refusal" or resp.parsed_output is None:
        raise RuntimeError(f"Claude lieferte kein Skript (stop_reason={resp.stop_reason})")
    o = resp.parsed_output
    return finalize(Script(title=o.title[:90], caption=o.caption, hashtags=o.hashtags[:8], scenes=o.scenes, engine="claude"),
                    research, settings)


def generate(research: dict, settings: Settings | None = None, log=print) -> Script:
    s = settings or Settings.load()
    if s.script_engine in ("auto", "claude") and anthropic_available():
        try:
            sc = claude(research, s)
            if not sc.validation["ok"]:
                log("Claude-Entwurf mit Prüffehlern – zweiter Versuch")
                sc = claude(research, s, "\n".join(i["message"] for i in sc.validation["issues"] if i["level"] == "fehler"))
            log(f"Skript mit Claude: {sc.words} Wörter, ~{sc.est_seconds:.0f} s")
            return sc
        except Exception as e:
            if s.script_engine == "claude":
                raise
            log(f"Claude nicht nutzbar ({e}) – Briefing-Modus")
    sc = briefing(research, s)
    log(f"Skript im Briefing-Modus (ohne KI): {sc.words} Wörter, ~{sc.est_seconds:.0f} s – bitte redaktionell überarbeiten")
    return sc
