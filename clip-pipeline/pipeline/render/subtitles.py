"""ASS-Untertitel: wenige Wörter pro Zeile, das gesprochene Wort hervorgehoben,
Hook am Anfang, Quellenangabe die ganze Zeit."""

from __future__ import annotations

from dataclasses import dataclass

from ..judge.media import Word
from .layout import OUT_H, OUT_W

FONT = "Montserrat Black"
HIGHLIGHT = "&H0000D4FF&"   # Gelb (#FFD400) in ASS-Farbreihenfolge BGR
MAX_WORDS = 3
MAX_CHARS = 18
PAUSE_BREAK_S = 0.6
HOOK_S = 2.8


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


def _caption_text(word: str) -> str:
    """Großbuchstaben, ohne Komma/Punkt am Ende (! und ? bleiben)."""
    return _clean(word).upper().rstrip(".,;:") or _clean(word).upper()


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


def build_ass(words: list[Word], *, duration: float, hook: str, credit: str, place: Placement) -> str:
    head = f"""[Script Info]
ScriptType: v4.00+
PlayResX: {OUT_W}
PlayResY: {OUT_H}
WrapStyle: 2
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Caption,{FONT},84,&H00FFFFFF,&H00FFFFFF,&H00000000,&H64000000,0,0,0,0,100,100,0,0,1,7,3,5,40,40,0,1
Style: Hook,{FONT},70,&H00000000,&H00000000,&H00FFFFFF,&H00FFFFFF,0,0,0,0,100,100,0,0,3,18,0,5,60,60,0,1
Style: Credit,{FONT},32,&H40FFFFFF,&H40FFFFFF,&H80000000,&H00000000,0,0,0,0,100,100,0,0,1,2,0,7,0,0,0,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
    ev: list[str] = []
    cx = OUT_W // 2
    lines = group_lines(words)
    for n, line in enumerate(lines):
        texts = [_caption_text(w.word) for w in line]
        # Eine Zeile endet spätestens, wenn die nächste beginnt (nie zwei übereinander).
        line_limit = lines[n + 1][0].start if n + 1 < len(lines) else duration
        for i, w in enumerate(line):
            end = line[i + 1].start if i + 1 < len(line) else min(w.end + 0.35, line_limit)
            end = max(end, w.start + 0.08)
            parts = [f"{{\\c{HIGHLIGHT}}}{t}{{\\c&H00FFFFFF&}}" if j == i else t for j, t in enumerate(texts)]
            ev.append(f"Dialogue: 1,{_ts(w.start)},{_ts(end)},Caption,,0,0,0,,{{\\pos({cx},{place.caption_y})}}" + " ".join(parts))

    if hook.strip():
        hook_end = min(HOOK_S, duration)
        ev.append(
            f"Dialogue: 2,{_ts(0)},{_ts(hook_end)},Hook,,0,0,0,,"
            f"{{\\pos({cx},{place.hook_y})\\fad(0,200)\\fscx85\\fscy85\\t(0,140,\\fscx100\\fscy100)}}"
            f"{_clean(hook).upper()}"
        )
    if credit.strip():
        ev.append(
            f"Dialogue: 0,{_ts(0)},{_ts(duration)},Credit,,0,0,0,,"
            f"{{\\pos({place.credit_x},{place.credit_y})}}{_clean(credit)}"
        )
    return head + "\n".join(ev) + "\n"
