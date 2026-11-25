"""Aufbereitung von Anzeigetext zu Sprechtext (Zahlen, Daten, Abkürzungen) – Token für Token,
damit jedes angezeigte Wort exakt seinen Zeitbereich im Voice-over bekommt."""

from __future__ import annotations

import re

_ONES = ["null", "eins", "zwei", "drei", "vier", "fünf", "sechs", "sieben", "acht", "neun", "zehn", "elf",
         "zwölf", "dreizehn", "vierzehn", "fünfzehn", "sechzehn", "siebzehn", "achtzehn", "neunzehn"]
_TENS = ["", "", "zwanzig", "dreißig", "vierzig", "fünfzig", "sechzig", "siebzig", "achtzig", "neunzig"]
_MONTHS = {"januar", "februar", "märz", "april", "mai", "juni", "juli", "august", "september", "oktober",
           "november", "dezember", "jänner"}
_ABBR = {
    "DM": "D-Mark", "Mio.": "Millionen", "Mrd.": "Milliarden", "z.": "zum", "B.": "Beispiel", "bzw.": "beziehungsweise",
    "ca.": "circa", "u.": "und", "a.": "andere", "zzgl.": "zuzüglich", "inkl.": "inklusive", "Nr.": "Nummer",
    "%": "Prozent", "€": "Euro", "£": "Pfund", "$": "Dollar", "&": "und", "Dr.": "Doktor", "St.": "Sankt",
    "vs.": "gegen", "gest.": "gestorben", "geb.": "geboren",
}


def cardinal(n: int, one: str = "eins") -> str:
    if n < 0:
        return "minus " + cardinal(-n)
    if n < 20:
        return one if n == 1 else _ONES[n]
    if n < 100:
        t, o = divmod(n, 10)
        return _TENS[t] if o == 0 else ("ein" if o == 1 else _ONES[o]) + "und" + _TENS[t]
    if n < 1000:
        h, r = divmod(n, 100)
        return ("ein" if h == 1 else _ONES[h]) + "hundert" + (cardinal(r) if r else "")
    if n < 1_000_000:
        th, r = divmod(n, 1000)
        return ("ein" if th == 1 else cardinal(th)) + "tausend" + (cardinal(r) if r else "")
    m, r = divmod(n, 1_000_000)
    head = "eine Million" if m == 1 else cardinal(m) + " Millionen"
    return head + (" " + cardinal(r) if r else "")


def year(n: int) -> str:
    if 1100 <= n <= 1999:
        h, r = divmod(n, 100)
        return cardinal(h) + "hundert" + (cardinal(r) if r else "")
    return cardinal(n)


def ordinal(n: int, suffix: str = "en") -> str:
    special = {1: "erst", 3: "dritt", 7: "siebt", 8: "acht"}
    if n in special:
        base = special[n]
    elif n < 20:
        base = cardinal(n) + "t"
    else:
        base = cardinal(n) + "st"
    return base + suffix


def _split(tok: str) -> tuple[str, str, str]:
    lead = re.match(r"^[(\[„\"']*", tok).group()
    rest = tok[len(lead):]
    trail = re.search(r"[,;:!?)\]“\"'.]*$", rest).group()
    return lead, rest[: len(rest) - len(trail)], trail


def _num_token(tok: str, prev: str, nxt: str) -> str | None:
    lead, core, trail = _split(tok)
    lead = ""  # Klammern/Anführungszeichen werden nicht gesprochen
    ordcore = (core + trail).rstrip(",;:!?)]“\"'")
    if re.fullmatch(r"\d{1,3}\.", ordcore) and nxt and (nxt[:1].isupper() or nxt.lower().strip(",.()") in _MONTHS):
        n = int(ordcore[:-1])
        suffix = "e" if prev.lower() in ("der", "die", "das") else "en"
        return ordinal(n, suffix) + trail[1:]
    if re.fullmatch(r"\d{4}/\d{2}", core):
        a, b = core.split("/")
        return f"{year(int(a))} {cardinal(int(b))}" + trail
    if re.fullmatch(r"\d{4}", core) and 1100 <= int(core) <= 2099:
        return year(int(core)) + trail
    if re.fullmatch(r"\d+:\d+", core):
        a, b = core.split(":")
        return f"{cardinal(int(a))} zu {cardinal(int(b))}" + trail
    if re.fullmatch(r"\d+,\d+", core):
        a, b = core.split(",")
        return f"{cardinal(int(a))} Komma {' '.join(cardinal(int(d)) for d in b)}" + trail
    if re.fullmatch(r"\d{1,3}(\.\d{3})+", core):
        return cardinal(int(core.replace(".", ""))) + trail
    if re.fullmatch(r"\d+", core):
        one = "ein" if nxt[:1].isupper() else "eins"
        return cardinal(int(core), one) + trail
    m = re.fullmatch(r"(\d+)-(\D.*)", core)  # 60-Meter-Solo-Lauf, 19-jährige
    if m:
        return f"{cardinal(int(m.group(1)), 'ein')}-{m.group(2)}" + trail
    m = re.fullmatch(r"U-?(\d{2})(.*)", core)
    if m:
        return f"U-{cardinal(int(m.group(1)))}{m.group(2)}" + trail
    return None


def spoken_tokens(display: str) -> list[tuple[str, str]]:
    """Liefert [(Anzeige-Token, Sprech-Text)] in derselben Reihenfolge."""
    toks = display.split()
    out = []
    for i, tok in enumerate(toks):
        prev = toks[i - 1] if i else ""
        nxt = toks[i + 1] if i + 1 < len(toks) else ""
        sp = _num_token(tok, prev, nxt)
        if sp is None:
            _, core, trail = _split(tok)
            if core + trail[:1] in _ABBR:
                sp = _ABBR[core + trail[:1]] + trail[1:]
            elif core in _ABBR:
                sp = _ABBR[core] + trail
            else:
                sp = tok
        sp = re.sub(r"[()\[\]„“\"]", "", sp.replace("–", ","))
        out.append((tok, sp))
    return out


def to_speech(display: str) -> str:
    s = " ".join(sp for _, sp in spoken_tokens(display))
    return re.sub(r"\s+,", ",", s).strip()


def count_words(text: str) -> int:
    return len(re.findall(r"\w+", to_speech(text)))
