"""ASS-Untertitel: wenige Wörter pro Zeile, das gesprochene Wort hervorgehoben,
Hook am Anfang, Quellenangabe die ganze Zeit."""

from __future__ import annotations

from dataclasses import dataclass

from ..judge.media import Word
from .layout import OUT_H, OUT_W

FONT = "Montserrat Black"
HIGHLIGHT = "&H0000D4FF&"   # Gelb (#FFD400) in ASS-Farbreihenfolge BGR
MAX_WORDS = 3
MAX_CHARS = 14  # TikTok-Ränder: Untertitel schmal halten (Nutzer 19.11.)
PAUSE_BREAK_S = 0.6
HOOK_S = 3.5  # der Hook ist das Wichtigste: lange genug lesbar


@dataclass(frozen=True)
class Placement:
    caption_y: int
    hook_y: int
    credit_x: int
    credit_y: int


def _ts(t: float) -> str:
    t = max(t, 0.0)
    cs = int(round(t * 100))
    h, cs = divmod(cs, 360000)
    m, cs = divmod(cs, 6000)
    s, cs = divmod(cs, 100)
    return f"{h}:{m:02d}:{s:02d}.{cs:02d}"


def _clean(text: str) -> str:
    return text.strip().replace("\\", "/").replace("{", "(").replace("}", ")").replace("\n", " ")


def censor_word(word: str, bad: set[str]) -> str:
    """'Scheiße!' -> 'Sch***e!' wenn der Wortstamm auf der Liste steht."""
    core = word.strip(".,;:!?\"'()")
    low = core.casefold()  # casefold macht aus "ß" ein "ss" – Liste genauso behandeln
    stems = {b.casefold() for b in bad}
    if not core or not any(low == b or (len(b) >= 4 and low.startswith(b)) for b in stems):
        return word
    keep = 3 if len(core) > 4 else 1
    masked = core[:keep] + "*" * max(len(core) - keep - 1, 1) + core[-1]
    return word.replace(core, masked, 1)


def _caption_text(word: str, bad: set[str] = frozenset()) -> str:
    """Großbuchstaben, ohne Komma/Punkt am Ende (! und ? bleiben), Schimpfwörter maskiert."""
    t = censor_word(_clean(word), bad).upper()
    return t.rstrip(".,;:") or t


def group_lines(words: list[Word]) -> list[list[Word]]:
    """Wörter zu kurzen Zeilen bündeln: max. 3 Wörter / 18 Zeichen,
    neue Zeile nach Satzende oder Sprechpause."""
    lines: list[list[Word]] = []
    cur: list[Word] = []
    for w in words:
        if not _clean(w.word):
            continue
        too_long = len(" ".join(_clean(x.word) for x in [*cur, w])) > MAX_CHARS
        paused = bool(cur) and w.start - cur[-1].end > PAUSE_BREAK_S
        if cur and (len(cur) >= MAX_WORDS or too_long or paused):
            lines.append(cur)
            cur = []
        cur.append(w)
        if _clean(w.word)[-1] in ".!?":
            lines.append(cur)
            cur = []
    if cur:
        lines.append(cur)
    return lines


def shift_words(words: list[Word], start_s: float, end_s: float) -> list[Word]:
    """Nur Wörter im Schnitt, Zeiten relativ zum Schnittanfang."""
    out = []
    for w in words:
        if w.end <= start_s or w.start >= end_s:
            continue
        out.append(Word(start=max(w.start, start_s) - start_s, end=min(w.end, end_s) - start_s, word=w.word))
    return out


def build_ass(
    words: list[Word], *, duration: float, hook: str, credit: str, place: Placement,
    censor: list[str] | None = None,
) -> str:
    bad = {c.casefold() for c in censor or []}
    head = f"""[Script Info]
ScriptType: v4.00+
PlayResX: {OUT_W}
PlayResY: {OUT_H}
WrapStyle: 2
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Caption,{FONT},76,&H00FFFFFF,&H00FFFFFF,&H00000000,&H64000000,0,0,0,0,100,100,0,0,1,7,3,5,40,40,0,1
Style: Hook,{FONT},90,&H00FFFFFF,&H00FFFFFF,&H00FFFFFF,&H00000000,-1,0,0,0,100,100,1,0,1,2.2,0,5,50,50,0,1
Style: HookBox,{FONT},20,&H001E1EE6,&H001E1EE6,&H001E1EE6,&H00000000,0,0,0,0,100,100,0,0,1,0,0,7,0,0,0,1
Style: Credit,{FONT},32,&H40FFFFFF,&H40FFFFFF,&H80000000,&H00000000,0,0,0,0,100,100,0,0,1,2,0,7,0,0,0,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
    ev: list[str] = []
    cx = OUT_W // 2
    lines = group_lines(words)
    for n, line in enumerate(lines):
        texts = [_caption_text(w.word, bad) for w in line]
        # Eine Zeile endet spätestens, wenn die nächste beginnt (nie zwei übereinander).
        line_limit = lines[n + 1][0].start if n + 1 < len(lines) else duration
        for i, w in enumerate(line):
            end = line[i + 1].start if i + 1 < len(line) else min(w.end + 0.35, line_limit)
            end = max(end, w.start + 0.08)
            parts = [f"{{\\c{HIGHLIGHT}}}{t}{{\\c&H00FFFFFF&}}" if j == i else t for j, t in enumerate(texts)]
            ev.append(f"Dialogue: 1,{_ts(w.start)},{_ts(end)},Caption,,0,0,0,,{{\\pos({cx},{place.caption_y})}}" + " ".join(parts))

    if hook.strip():
        hook_end = min(HOOK_S, duration)
        text = _clean(hook).upper()
        if len(text) > 16 and " " in text:  # lange Hooks zweizeilig statt breit: bleibt in der Bildmitte
            mid = len(text) // 2
            cut = min((i for i, ch in enumerate(text) if ch == " "), key=lambda i: abs(i - mid))
            text = text[:cut] + "\\N" + text[cut + 1:]
        longest = max(len(x) for x in text.split("\\N"))
        size = max(66, min(112, int(112 * 12 / max(longest, 1))))  # 20.11.: dicker/größer, max. ~80 % der Bildbreite
        nlines = text.count("\\N") + 1
        bw = int(longest * size * 0.50 + 2 * 40)   # Breite grob aus Zeichenzahl (Montserrat Black)
        bh = int(nlines * size * 1.05 + 2 * 26)
        ev.append(
            f"Dialogue: 1,{_ts(0)},{_ts(hook_end)},HookBox,,0,0,0,,"
            f"{{\\an5\\pos({cx},{place.hook_y})\\fad(0,350)\\fscx60\\fscy60\\t(0,140,\\fscx115\\fscy115)\\t(140,260,\\fscx100\\fscy100)\\p1}}"
            f"{_rounded_rect(bw, bh, 28)}{{\\p0}}"
        )
        ev.append(
            f"Dialogue: 2,{_ts(0)},{_ts(hook_end)},Hook,,0,0,0,,"
            f"{{\\pos({cx},{place.hook_y})\\fs{size}\\fad(0,350)\\fscx60\\fscy60\\t(0,140,\\fscx115\\fscy115)\\t(140,260,\\fscx100\\fscy100)}}"
            f"{text}"
        )
    if credit.strip():
        ev.append(
            f"Dialogue: 0,{_ts(0)},{_ts(duration)},Credit,,0,0,0,,"
            f"{{\\pos({place.credit_x},{place.credit_y})}}{_clean(credit)}"
        )
    return head + "\n".join(ev) + "\n"


def _rounded_rect(w: int, h: int, r: int) -> str:
    """ASS-Zeichnung (\\p1) eines Rechtecks mit abgerundeten Ecken (Bezier)."""
    r = max(0, min(r, w // 2, h // 2))
    k = int(r * 0.45)
    return (f"m {r} 0 l {w - r} 0 b {w - k} 0 {w} {k} {w} {r} l {w} {h - r} "
            f"b {w} {h - k} {w - k} {h} {w - r} {h} l {r} {h} b {k} {h} 0 {h - k} 0 {h - r} "
            f"l 0 {r} b 0 {k} {k} 0 {r} 0")
