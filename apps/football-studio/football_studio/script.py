"""SKRIPTERSTELLUNG: deutsches TikTok-Skript (60–120 s) ausschließlich aus recherchierten Fakten.

Zwei Engines:
  * ``claude``      – Claude formuliert frei, darf aber nur gelieferte Fakten verwenden.
  * ``regelbasiert`` – stellt belegte Sätze aus der Recherche dramaturgisch zusammen.
Beide Ergebnisse durchlaufen denselben Faktenprüfer (``validate``).
"""

from __future__ import annotations

import json
import re
from typing import Literal

from pydantic import BaseModel, Field

from .config import Settings, anthropic_available
from .speech import count_words, to_speech

WORDS_PER_SECOND = 2.45  # gemessener Mittelwert deutscher TTS-Stimmen
SCENE_PAUSE = 0.18

VisualType = Literal["hook", "profile", "timeline", "stat", "year", "score", "keyword", "quote", "pitch", "outro"]
VISUAL_TYPES = ["hook", "profile", "timeline", "stat", "year", "score", "keyword", "quote", "pitch", "outro"]

DRAMA = {
    "kreuzband": 3, "verletz": 2.5, "depression": 3, "burnout": 3, "rücktritt": 3, "karriereende": 3,
    "beendete": 2.5, "absturz": 3, "abstieg": 2, "absteiger": 2, "sperre": 2, "gesperrt": 2, "skandal": 3,
    "starb": 3, "tod": 2.5, "unfall": 3, "ermordet": 3, "erschossen": 3, "herzstillstand": 3, "suizid": 3,
    "wechsel": 1.5, "wechselte": 1.5, "ablöse": 2.5, "millionen": 2, "rekord": 2.5, "weltmeister": 2.5,
    "europameister": 2, "meister": 1.5, "pokal": 1.2, "finale": 2, "endspiel": 2, "debüt": 2, "erstes tor": 2,
    "jahrhunderttalent": 3, "wunderkind": 3, "talent": 1.5, "nationalmannschaft": 1.2, "elfmeter": 1.5,
    "entlassen": 2, "insolvenz": 2.5, "gefängnis": 3, "haft": 2.5, "alkohol": 2.5, "doping": 3, "comeback": 2.5,
    "rückkehr": 1.5, "ende seiner karriere": 3, "konsequenzen": 1, "jahrhundert": 1.5, "zurückgezogen": 2, "angebot": 1.5, "real madrid": 1.5, "barcelona": 1,
    "phantomtor": 3, "wunder": 2, "sensation": 2, "verloren": 1.5, "gewann": 1.5, "sieg": 1, "tor ": 0.8,
}
PRIVATE = re.compile(r"\b(Sohn|Tochter|Söhne|Töchter|Kinder|Kind|Lebensgefährtin|Lebensgefährte|Ehefrau|Ehemann|"
                     r"verheiratet|geschieden|Freundin|Scheidung|Enkel|wohnt|wohnte|lebte|lebt|Ehe|Witwe|Witwer)\b"
                     r"|\bseine[rm]? (?:\w+ )?Frau\b")
ANAPHORA = re.compile(r"\b(selbig\w*|ebendies\w*|ebenfalls|jene[nmrs]?|diese[nmrs]? (?:Zeit|Saison|Verein|Spiel)|dort)\b", re.I)
SUBORDINATE_START = re.compile(r"^(Nachdem|Als|Obwohl|Weil|Da|Wenn|Bevor|Seit|Seitdem|Sobald|Indem|Um|Damit|Falls|Ob)\b")
CONTEXT_START = re.compile(r"^(Dies|Diese[rsm]?|Dabei|Dort|Damit|Daraufhin|Danach|Darin|Darauf|Dazu|Deshalb|"
                           r"Er begründete dies|Hierbei|Hier|Somit|So |Zudem|Außerdem|Ebenso|Auch|Im Gegenzug|Trotzdem|"
                           r"Dennoch|Stattdessen|Infolgedessen|Kurz darauf|Wenig später)\b")

SECTION_BRIDGES = {
    "nationalmannschaft": "Und in der Nationalmannschaft?",
    "nach der aktiven zeit": "Und nach der Karriere?",
    "karriereende": "Und dann?",
    "nach der karriere": "Und nach der Karriere?",
    "trainerkarriere": "Dann wechselte er die Seiten.",
    "folgen": "Und die Folgen?",
    "nachwirkung": "Und die Folgen?",
    "spielverlauf": "Dann das Spiel.",
    "vorgeschichte": "Wie es dazu kam:",
}


class Scene(BaseModel):
    id: str
    text: str  # Anzeigetext / Untertitel
    speech: str = ""  # Sprechtext für TTS
    role: str = "story"  # hook | intro | story | career | stat | outro
    sentence_ids: list[str] = Field(default_factory=list)
    fact_ids: list[str] = Field(default_factory=list)
    visual: dict = Field(default_factory=dict)


class Script(BaseModel):
    title: str
    caption: str
    hashtags: list[str]
    scenes: list[Scene]
    engine: str
    words: int = 0
    est_seconds: float = 0
    validation: dict = Field(default_factory=dict)


# ---- Hilfen ----------------------------------------------------------------


_SUBCLAUSE = re.compile(r",\s+(?:der|die|das|den|dem|deren|dessen|denen|wobei|wo|was|welche[rsmn]?|nachdem|obwohl)\s+[^,]{3,140}?,\s*")


def simplify(sentence: str, max_words: int = 30) -> str:
    s = re.sub(r"\s*\([^()]*\)", "", sentence)
    s = re.sub(r"\s+–\s+([^–]{1,90}?)\s+–\s+", " ", s)  # Einschübe zwischen Gedankenstrichen
    s = re.sub(r"\s+–\s+[^–]{1,60}$", ".", s) if s.count("–") == 1 and s.rstrip().endswith(".") else s
    s = re.sub(r"\s+,", ",", s)
    s = re.sub(r"\s{2,}", " ", s).strip()
    s = s.replace("..", ".")
    # Lange Sätze: eingeschobene Nebensätze entfernen
    while len(s.split()) > max_words:
        m = _SUBCLAUSE.search(s)
        if not m:
            break
        s = s[: m.start()] + " " + s[m.end():]
        s = re.sub(r"\s{2,}", " ", s)
    if len(s.split()) > max_words:
        # am letzten Komma vor der Grenze kürzen, wenn der Hauptsatz vollständig bleibt
        cut = None
        for m in re.finditer(r",\s", s):
            if 10 <= len(s[: m.start()].split()) <= max_words:
                cut = m.start()
        if cut and not SUBORDINATE_START.search(s):
            s = s[:cut].rstrip() + "."
    return s


def _score(sentence: str, section: str) -> float:
    low = sentence.lower()
    sc = sum(w for k, w in DRAMA.items() if k in low)
    if re.search(r"\b(1[89]|20)\d\d\b", sentence):
        sc += 0.8
    if re.search(r"\d", sentence):
        sc += 0.4
    if len(re.findall(r"\d+", sentence)) > 3:
        sc -= 1.5
    if "„" in sentence:
        sc += 1.0
    n = len(sentence.split())
    if n > 28:
        sc -= (n - 28) * 0.25
    if CONTEXT_START.search(sentence):
        sc -= 2.5
    if ANAPHORA.search(sentence):
        sc -= 1.5
    if section.lower() in ("einleitung",):
        sc -= 2
    return sc


def est_seconds(scenes: list[Scene]) -> float:
    words = sum(len(re.findall(r"\w+", s.speech or to_speech(s.text))) for s in scenes)
    return round(words / WORDS_PER_SECOND + SCENE_PAUSE * len(scenes), 1)


def _surname(name: str) -> str:
    parts = name.split()
    return parts[-1] if parts else name


def _fact(research: dict, fid: str, verified_only: bool = True) -> dict | None:
    for f in research["facts"]:
        if f["id"] == fid and (f["status"] == "verifiziert" or (not verified_only and f["status"] != "widerspruch")):
            return f
    return None


def _join_names(names: list[str]) -> str:
    return names[0] if len(names) == 1 else ", ".join(names[:-1]) + " und " + names[-1]


# ---- Visuals ---------------------------------------------------------------


def auto_visual(scene: Scene, research: dict, index: int) -> dict:
    t = scene.text
    if scene.role == "hook":
        return {"type": "hook", "headline": research["short_name"], "kicker": t}
    if scene.role == "intro":
        items = []
        for fid, lab in (("geburtsdatum", "Geboren"), ("geburtsort", "In"), ("position", "Position"),
                         ("sterbedatum", "Gestorben"), ("datum", "Datum"), ("ort", "Ort")):
            f = _fact(research, fid, verified_only=False)
            if f:
                items.append({"label": lab, "value": str(f["display"])})
        return {"type": "profile", "headline": research["short_name"], "items": items[:4]}
    if scene.role == "career":
        rows = [{"years": c["years"], "team": c["team"], "apps": (f"{c['matches']} Spiele" if c.get("matches") is not None else "")}
                for c in research["career"] if c["status"] != "widerspruch"
                and not re.search(r"Amateur|\bII\b|U-?\d{2}|Reserve|Jugend|B-Team", c["team"])][:5]
        return {"type": "timeline", "headline": "Stationen", "rows": rows}
    if scene.role == "stat":
        f = _fact(research, "laenderspiele", verified_only=False)
        if f:
            v = f["value"]
            return {"type": "stat", "value": str(v["matches"]), "label": "Länderspiele",
                    "sub": f"{v['goals']} Tore · {v['years']}", "team": v["team"]}
    if scene.role == "outro":
        return {"type": "outro", "headline": "Folge für mehr", "sub": "Fußballgeschichten"}
    quote = re.search(r"„([^“]{3,40})“", t)
    money = re.search(r"(\d+(?:,\d+)?)\s+(Millionen|Mio\.|Milliarden)\s+(\w+(?:-Mark)?)", t)
    score = re.search(r"\b(\d{1,2}:\d{1,2})\b", t)
    yr = re.findall(r"\b(1[89]\d\d|20\d\d)\b", t)
    num = re.search(r"\b(\d{2,4})\s+(Tore|Spiele|Länderspiele|Zuschauer|Meter|Minuten|Einsätze|Punkte)\b", t)
    kw = _keyword(t)
    if quote:
        return {"type": "quote", "text": quote.group(1), "sub": kw if kw and kw not in quote.group(1) else ""}
    if money:
        return {"type": "stat", "value": money.group(1), "label": f"{money.group(2)} {money.group(3)}", "sub": kw or ""}
    if score:
        opp = re.search(r"gegen (?:den |die |das )?([A-ZÄÖÜ][\w\.-]+(?: [A-ZÄÖÜ0-9][\w\.-]+){0,2})", t)
        return {"type": "score", "value": score.group(1), "sub": f"gegen {opp.group(1)}" if opp else (kw or "")}
    if num:
        return {"type": "stat", "value": num.group(1), "label": num.group(2), "sub": kw or ""}
    if yr:
        return {"type": "year", "value": yr[0], "sub": kw or ""}
    if kw:
        return {"type": "keyword", "text": kw}
    return {"type": "pitch", "text": _short_phrase(t)}


def _keyword(text: str) -> str | None:
    low = text.lower()
    best = None
    for k, w in sorted(DRAMA.items(), key=lambda kv: -kv[1]):
        if k.strip() in low and w >= 1.5:
            m = re.search(r"\b[\wäöüÄÖÜß-]*" + re.escape(k.strip()) + r"[\wäöüÄÖÜß-]*", text, re.I)
            if m:
                best = m.group(0)
                break
    if best:
        return best[:1].upper() + best[1:]
    return None


def _short_phrase(text: str) -> str:
    words = re.sub(r"[,.;:!?]", "", text).split()
    caps = [w for w in words[1:] if w[:1].isupper() and len(w) > 3]
    return " ".join(caps[:3]) if caps else " ".join(words[:4])


def finalize(script: Script, research: dict, settings: Settings) -> Script:
    for i, sc in enumerate(script.scenes):
        sc.id = f"s{i + 1:02d}"
        sc.text = re.sub(r"\s+", " ", sc.text).strip()
        sc.speech = to_speech(sc.text)
        if not sc.visual or sc.visual.get("type") not in VISUAL_TYPES:
            sc.visual = auto_visual(sc, research, i)
            # Abwechslung: nicht zweimal hintereinander dieselbe Zahlen-Grafik
            prev = script.scenes[i - 1].visual.get("type") if i else None
            if sc.visual["type"] == prev and prev in ("year", "stat", "score"):
                kw = _keyword(sc.text)
                sc.visual = {"type": "keyword", "text": kw} if kw else {"type": "pitch", "text": _short_phrase(sc.text)}
        sc.visual.setdefault("bg", ["floodlight", "pitch", "grid", "stripes"][i % 4])
    script.words = sum(count_words(s.text) for s in script.scenes)
    script.est_seconds = est_seconds(script.scenes)
    script.validation = validate(script, research, settings)
    return script


# ---- Faktenprüfung ---------------------------------------------------------


def _numbers(text: str) -> set[str]:
    nums = set()
    for m in re.finditer(r"\d+(?:[.,:/]\d+)*", text):
        tok = m.group(0)
        nums.add(tok)
        for part in re.split(r"[.,:/]", tok):
            nums.add(part.lstrip("0") or "0")
    return nums


def allowed_numbers(research: dict) -> set[str]:
    corpus = [s["text"] for s in research["sentences"]] + [research.get("lead", "")]
    for f in research["facts"]:
        if f["status"] != "widerspruch":
            corpus.append(json.dumps(f["value"], ensure_ascii=False))
            corpus.append(str(f["display"]))
    for c in research["career"]:
        if c["status"] != "widerspruch":
            corpus.append(json.dumps(c, ensure_ascii=False))
    out: set[str] = set()
    for t in corpus:
        out |= _numbers(t)
    return out


def validate(script: Script, research: dict, settings: Settings) -> dict:
    issues: list[dict] = []
    allowed = allowed_numbers(research)
    for sc in script.scenes:
        for m in re.finditer(r"\d+(?:[.,:/]\d+)*", sc.text):
            tok = m.group(0).rstrip(".")
            parts = [p.lstrip("0") or "0" for p in re.split(r"[.,:/]", tok)]
            if tok not in allowed and not all(p in allowed for p in parts):
                issues.append({"scene": sc.id, "level": "fehler",
                               "message": f"Zahl „{tok}“ ist in keiner Quelle belegt."})
    conflicts = [f for f in research["facts"] if f["status"] == "widerspruch"]
    for f in conflicts:
        for sc in script.scenes:
            disp = str(f["display"])
            if disp and len(disp) > 3 and disp in sc.text:
                issues.append({"scene": sc.id, "level": "fehler",
                               "message": f"„{f['label']}“ ist zwischen den Quellen widersprüchlich und darf nicht verwendet werden."})
    secs = script.est_seconds
    if secs < settings.target_min_seconds:
        issues.append({"scene": None, "level": "warnung", "message": f"Geschätzte Länge {secs:.0f} s liegt unter {settings.target_min_seconds} s."})
    if secs > settings.target_max_seconds:
        issues.append({"scene": None, "level": "warnung", "message": f"Geschätzte Länge {secs:.0f} s liegt über {settings.target_max_seconds} s."})
    if not script.scenes or script.scenes[0].role != "hook":
        issues.append({"scene": None, "level": "warnung", "message": "Das Skript beginnt nicht mit einem Hook."})
    unsourced = [sc.id for sc in script.scenes if sc.role == "story" and not sc.sentence_ids]
    if unsourced:
        issues.append({"scene": None, "level": "hinweis",
                       "message": f"Szenen ohne Satzbeleg: {', '.join(unsourced)} (bitte manuell prüfen)."})
    return {"ok": not any(i["level"] == "fehler" for i in issues), "issues": issues}


# ---- Regelbasierte Engine --------------------------------------------------


def _hook(research: dict, category: str) -> list[str]:
    name = research["short_name"]
    age = _fact(research, "alter_tod")
    end = _fact(research, "karriereende")
    birth = _fact(research, "geburtsdatum")
    nat = _fact(research, "laenderspiele", verified_only=False)
    if research["kind"] == "event":
        d = _fact(research, "datum", verified_only=False)
        if d:
            return [f"{d['display']}.", f"Was geschah an diesem Tag wirklich?"]
        return [f"{research['label']}.", "Was geschah wirklich?"]
    if category == "tragik" and age:
        return [f"{name} wurde nur {age['value']} Jahre alt.", "Das ist seine Geschichte."]
    if category in ("absturz", "vergessen") and end and birth:
        return [f"Geboren {birth['value'][:4]}.", f"{end['value']} war seine Profikarriere vorbei.", "Was ist passiert?"]
    if nat and nat["value"].get("matches"):
        return [f"{nat['value']['matches']} Länderspiele für {nat['value']['team']}.", f"Das ist die Geschichte von {name}."]
    return [f"Kennst du die Geschichte von {name}?"]


def _title(research: dict, category: str, topic_title: str | None) -> str:
    name = research["short_name"]
    age = _fact(research, "alter_tod")
    if category == "tragik" and age:
        return f"Nur {age['value']} Jahre: Die Geschichte von {name}"
    if category == "absturz" and _fact(research, "karriereende"):
        return f"{name}: Was ist passiert?"
    return topic_title or f"Die Geschichte von {name}"


def rule_based(research: dict, category: str, settings: Settings, topic_title: str | None = None) -> Script:
    name = research["short_name"]
    scenes: list[Scene] = []
    hook_lines = _hook(research, category)
    scenes.append(Scene(id="", text=" ".join(hook_lines), role="hook",
                        fact_ids=[f["id"] for f in research["facts"] if f["status"] == "verifiziert"][:3]))

    # Intro aus verifizierten Stammdaten
    if research["kind"] == "person":
        b, p = _fact(research, "geburtsdatum"), _fact(research, "geburtsort")
        if b and p:
            scenes.append(Scene(id="", text=f"{name} wurde am {b['display']} in {p['display']} geboren.", role="intro",
                                fact_ids=["geburtsdatum", "geburtsort"]))
        elif b:
            scenes.append(Scene(id="", text=f"{name} wurde am {b['display']} geboren.", role="intro", fact_ids=["geburtsdatum"]))
    else:
        scenes.append(Scene(id="", text=simplify(research["lead"]), role="intro",
                            sentence_ids=[research["sentences"][0]["id"]] if research["sentences"] else []))

    # Satzauswahl
    target_s = (settings.target_min_seconds + settings.target_max_seconds) / 2 + 5
    fixed = sum(count_words(s.text) for s in scenes) + 30  # Karriere, Statistik, Outro
    budget = int(target_s * WORDS_PER_SECOND) - fixed
    cands = []
    for i, s in enumerate(research["sentences"]):
        if s["section"].lower() == "einleitung" or PRIVATE.search(s["text"]):
            continue
        text = simplify(s["text"])
        n = len(text.split())
        if n < 6 or n > 34:
            continue
        cands.append({"i": i, "s": s, "text": text, "words": count_words(text), "score": _score(text, s["section"])})
    # Pflicht: frühe Station (Anfang) und spätester Abschnitt (Ende)
    chosen: list[dict] = []
    used = 0
    by_score = sorted(cands, key=lambda c: -c["score"])
    if cands:
        early = [c for c in cands[: max(3, len(cands) // 5)] if c["score"] > -1]
        late = [c for c in cands[-max(3, len(cands) // 6):] if c["score"] > -1]
        for c in (max(early, key=lambda c: c["score"]) if early else None, max(late, key=lambda c: c["score"]) if late else None):
            if c and c not in chosen:
                chosen.append(c)
                used += c["words"]
    per_section: dict[str, int] = {}
    for c in chosen:
        per_section[c["s"]["section"]] = per_section.get(c["s"]["section"], 0) + 1

    def take(c: dict, cap: int) -> None:
        nonlocal used
        sec = c["s"]["section"]
        if c in chosen or c["score"] < 1.0 or per_section.get(sec, 0) >= cap or used + c["words"] > budget + 12:
            return
        chosen.append(c)
        used += c["words"]
        per_section[sec] = per_section.get(sec, 0) + 1

    # 1. Runde: der stärkste Satz jedes Abschnitts (Dramaturgie über die ganze Geschichte)
    for sec in dict.fromkeys(c["s"]["section"] for c in cands):
        best = max((c for c in cands if c["s"]["section"] == sec), key=lambda c: c["score"])
        if best["score"] >= 2.5:
            take(best, 1)
    # 2. Runde: nach Stärke auffüllen, höchstens 3 Sätze pro Abschnitt
    for c in by_score:
        if used >= budget:
            break
        take(c, 2 if "national" in c["s"]["section"].lower() else 3)
    # Chronologisch erzählen: nach erster Jahreszahl, sonst Position im Artikel
    chosen.sort(key=lambda c: c["i"])
    last_year = 0
    for c in chosen:
        yrs = [int(y) for y in re.findall(r"\b(1[89]\d\d|20\d\d)\b", c["text"])]
        last_year = yrs[0] if yrs else last_year
        c["year"] = last_year
    chosen.sort(key=lambda c: (c["year"], c["i"]))

    # Szenen in Artikelreihenfolge, Brücken bei Abschnittswechsel, Karriere-Grafik einfügen
    story: list[Scene] = []
    last_section = None
    career_rows = [c for c in research["career"] if c["status"] != "widerspruch"
                   and not re.search(r"Amateur|\bII\b|U-?\d{2}|Reserve|Jugend|B-Team", c["team"])]
    career_inserted = False
    for c in chosen:
        sec = c["s"]["section"]
        bridge = None
        if last_section is not None and sec != last_section:
            key = sec.lower()
            bridge = next((v for k, v in SECTION_BRIDGES.items() if k in key), None)
            if not bridge and any(sec.lower() in r["team"].lower() or r["team"].lower() in sec.lower() for r in research["career"]):
                bridge = f"Nächste Station: {sec}."
        text = c["text"] if not bridge else f"{bridge} {c['text']}"
        if not career_inserted and len(career_rows) >= 2 and re.search(r"verein|karriere|station|bundesliga|mönchengladbach|profi", sec.lower() + c["text"].lower()) and story:
            teams = list(dict.fromkeys(r["team"] for r in career_rows))[:5]
            story.append(Scene(id="", text=f"Seine Stationen als Profi: {_join_names(teams)}.", role="career",
                               fact_ids=["vereine"]))
            career_inserted = True
        story.append(Scene(id="", text=text, role="story", sentence_ids=[c["s"]["id"]]))
        last_section = sec
    if not career_inserted and len(career_rows) >= 2:
        teams = list(dict.fromkeys(r["team"] for r in career_rows))[:5]
        story.insert(min(2, len(story)), Scene(id="", text=f"Seine Stationen als Profi: {_join_names(teams)}.", role="career", fact_ids=["vereine"]))
    nat = _fact(research, "laenderspiele", verified_only=False)
    if nat and nat["value"].get("matches"):
        v = nat["value"]
        txt = f"Für {v['team']} bestritt er {v['matches']} Länderspiele und erzielte {v['goals']} Tore." if v.get("goals") is not None else f"Für {v['team']} bestritt er {v['matches']} Länderspiele."
        pos = next((i + 1 for i, s in enumerate(story) if "Nationalmannschaft" in s.text), max(len(story) - 2, 0))
        story.insert(pos, Scene(id="", text=txt, role="stat", fact_ids=["laenderspiele"]))
    scenes.extend(story)
    surname = _surname(name)
    outro = (f"Was denkst du über die Geschichte von {surname}? Schreib es in die Kommentare und folge für mehr Fußballgeschichten."
             if research["kind"] == "person" else
             "Was denkst du darüber? Schreib es in die Kommentare und folge für mehr Fußballgeschichten.")
    scenes.append(Scene(id="", text=outro, role="outro"))

    script = Script(
        title=_title(research, category, topic_title),
        caption=f"{_title(research, category, topic_title)} ⚽ Quellen: Wikipedia, Wikidata.",
        hashtags=["#fußball", "#fussball", "#fußballgeschichten", "#bundesliga",
                  "#" + re.sub(r"\W", "", surname.lower())],
        scenes=scenes,
        engine="regelbasiert",
    )
    script = finalize(script, research, settings)
    # zu lang -> schwächste Story-Szenen entfernen
    while script.est_seconds > settings.target_max_seconds - 4:
        storyscenes = [s for s in script.scenes if s.role == "story"]
        if len(storyscenes) <= 3:
            break
        weakest = min(storyscenes, key=lambda s: _score(s.text, ""))
        script.scenes.remove(weakest)
        script = finalize(script, research, settings)
    return script


# ---- Claude-Engine ---------------------------------------------------------


class _LLMScene(BaseModel):
    text: str = Field(description="Gesprochener Satz bzw. 1–2 kurze Sätze dieser Szene (Deutsch).")
    role: Literal["hook", "intro", "story", "career", "stat", "outro"]
    sentence_ids: list[str] = Field(description="IDs der Quellsätze (s0, s1, …), auf denen die Szene beruht.")
    fact_ids: list[str] = Field(description="IDs der verwendeten Fakten.")
    visual_type: Literal["hook", "profile", "timeline", "stat", "year", "score", "keyword", "quote", "pitch", "outro"]
    visual_text: str = Field(description="Kurzer Bildtext (max. 4 Wörter) bzw. Zahl für die Grafik.")


class _LLMScript(BaseModel):
    title: str
    caption: str
    hashtags: list[str]
    scenes: list[_LLMScene]


SYSTEM_PROMPT = """Du bist Autor:in für Fußball-Storytelling-Videos auf TikTok (Deutsch, 1080x1920).
Schreibe ein spannendes, emotionales Skript, das gesprochen 60–120 Sekunden dauert (etwa 170–260 Wörter).

Harte Regeln:
- Verwende ausschließlich Fakten aus dem gelieferten Recherche-Material. Erfinde keine Namen, Zahlen, Daten, Zitate oder Ereignisse.
- Fakten mit Status "widerspruch" darfst du nicht verwenden.
- Jede Story-Szene nennt in sentence_ids die Quellsätze, auf denen sie beruht.
- Zahlen schreibst du als Ziffern genau so, wie sie in den Quellen stehen.
- Szene 1 ist ein starker Hook (role "hook"), der in den ersten zwei Sekunden neugierig macht. Die letzte Szene (role "outro") ruft zum Kommentieren und Folgen auf.
- 10–16 Szenen, jede 1–2 kurze Sätze. Emotional erzählen heißt: Spannung durch Reihenfolge, Kontraste und Pausen – nicht durch erfundene Details.
- Keine Aussagen über das Privatleben (Partner, Kinder), die nicht für die Geschichte nötig sind.
- Der Titel ist kurz (max. 60 Zeichen) und enthält keine unbelegte Behauptung."""


def claude_script(research: dict, category: str, settings: Settings, topic_title: str | None = None,
                  feedback: str | None = None) -> Script:
    import anthropic

    material = {
        "thema": research["label"],
        "beschreibung": research["description"],
        "kategorie": category,
        "arbeitstitel": topic_title,
        "fakten": [{k: f[k] for k in ("id", "label", "display", "status")} for f in research["facts"]],
        "vereinsstationen": [{k: c[k] for k in ("years", "team", "matches", "goals", "status")} for c in research["career"]],
        "quellsaetze": [{"id": s["id"], "abschnitt": s["section"], "text": s["text"]} for s in research["sentences"]],
    }
    user = "Recherche-Material (JSON):\n" + json.dumps(material, ensure_ascii=False)
    if feedback:
        user += "\n\nDer letzte Entwurf hatte diese Probleme, behebe sie:\n" + feedback
    client = anthropic.Anthropic()
    response = client.beta.messages.parse(
        model=settings.claude_model,
        max_tokens=16000,
        betas=["server-side-fallback-2026-07-01"],
        fallbacks="default",
        output_config={"effort": "high"},
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": user}],
        output_format=_LLMScript,
    )
    if response.stop_reason == "refusal" or response.parsed_output is None:
        raise RuntimeError(f"Claude hat kein Skript geliefert (stop_reason={response.stop_reason}).")
    out = response.parsed_output
    scenes = []
    for s in out.scenes:
        sc = Scene(id="", text=s.text, role=s.role, sentence_ids=s.sentence_ids, fact_ids=s.fact_ids)
        auto = auto_visual(sc, research, 0)
        if s.visual_type == auto["type"]:
            sc.visual = auto
        elif s.visual_type in ("keyword", "pitch"):
            sc.visual = {"type": s.visual_type, "text": s.visual_text}
        elif s.visual_type in ("year", "stat", "score") and re.search(r"\d", s.visual_text):
            sc.visual = {"type": s.visual_type, "value": re.search(r"[\d.,:]+", s.visual_text).group(0).strip(".,"),
                         "label": re.sub(r"[\d.,:]+", "", s.visual_text).strip(), "sub": ""}
        else:
            sc.visual = auto
        scenes.append(sc)
    script = Script(title=out.title[:80], caption=out.caption, hashtags=out.hashtags[:8], scenes=scenes, engine="claude")
    return finalize(script, research, settings)


def generate(research: dict, category: str, settings: Settings | None = None, topic_title: str | None = None, log=print) -> Script:
    settings = settings or Settings.load()
    engine = settings.script_engine
    if engine in ("auto", "claude") and anthropic_available():
        try:
            script = claude_script(research, category, settings, topic_title)
            if not script.validation["ok"]:
                fb = "\n".join(i["message"] for i in script.validation["issues"])
                log("Claude-Entwurf hatte Faktenprobleme – zweiter Versuch mit Rückmeldung")
                script = claude_script(research, category, settings, topic_title, feedback=fb)
            if script.validation["ok"]:
                log(f"Skript mit Claude erstellt ({script.words} Wörter, ~{script.est_seconds:.0f} s)")
                return script
            log("Claude-Entwurf weiterhin nicht faktentreu – regelbasierte Engine übernimmt")
        except Exception as e:
            if engine == "claude":
                raise
            log(f"Claude nicht verfügbar ({e.__class__.__name__}: {e}) – regelbasierte Engine übernimmt")
    script = rule_based(research, category, settings, topic_title)
    log(f"Skript regelbasiert erstellt ({script.words} Wörter, ~{script.est_seconds:.0f} s)")
    return script
