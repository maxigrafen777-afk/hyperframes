"""Animierte Untertitel als ASS (libass): Wort-für-Wort-Hervorhebung, Namen/Zahlen farbig."""

from __future__ import annotations

import re

W, H = 1080, 1920


def _ass_color(hex_rgb: str, alpha: int = 0) -> str:
    h = hex_rgb.lstrip("#")
    r, g, b = h[0:2], h[2:4], h[4:6]
    return f"&H{alpha:02X}{b}{g}{r}".upper()


def _ts(t: float) -> str:
    t = max(0.0, t)
    h, rem = divmod(t, 3600)
    m, s = divmod(rem, 60)
    return f"{int(h)}:{int(m):02d}:{s:05.2f}"


def groups(words: list[dict], max_words: int = 3, max_chars: int = 22) -> list[dict]:
    out, cur = [], []
    for i, w in enumerate(words):
        cur.append(w)
        nxt = words[i + 1] if i + 1 < len(words) else None
        if (len(cur) >= max_words or re.search(r"[.!?,;:]$", w["text"]) or nxt is None or nxt["scene"] != w["scene"]
                or nxt["start"] - w["end"] > 0.18 or sum(len(x["text"]) + 1 for x in cur + ([nxt] if nxt else [])) > max_chars):
            out.append({"words": cur, "start": cur[0]["start"], "end": cur[-1]["end"]})
            cur = []
    for i, g in enumerate(out):
        nxt = out[i + 1]["start"] if i + 1 < len(out) else g["end"] + 0.5
        g["end"] = max(g["start"] + 0.2, min(nxt, g["end"] + 0.35))
    return out


def build_ass(words: list[dict], emphasis: dict[str, list[str]], accent: str, highlight: str = "#FFFFFF",
              font_name: str = "Archivo Black") -> str:
    """emphasis: scene_id -> Liste hervorzuhebender Begriffe (Namen, Zahlen)."""
    acc = _ass_color(accent)
    head = f"""[Script Info]
ScriptType: v4.00+
PlayResX: {W}
PlayResY: {H}
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Cap,{font_name},64,&H00FFFFFF,&H00FFFFFF,&H00000000,&H96000000,0,0,0,0,100,100,0,0,1,6,3,5,120,300,0,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
    lines = []
    for g in groups(words):
        emph = [e.lower() for e in emphasis.get(g["words"][0]["scene"], [])]
        toks = [w["text"].upper() for w in g["words"]]
        chars = sum(len(t) for t in toks)
        size = 70 if chars <= 12 else (60 if chars <= 18 else 52)
        # ein Event pro Wortzeitraum: aktives Wort größer + Akzentfarbe
        bounds = [max(g["start"], w["start"]) for w in g["words"]] + [g["end"]]
        bounds[0] = g["start"]
        for k in range(len(g["words"])):
            a, b = bounds[k], bounds[k + 1]
            if b - a < 0.02:
                continue
            parts = []
            for j, (w, t) in enumerate(zip(g["words"], toks)):
                is_emph = any(e and (e in w["text"].lower() or w["text"].lower().strip(".,:;!?") in e) for e in emph)
                if j == k:
                    parts.append(r"{\c" + acc + r"&\fscx112\fscy112}" + t + r"{\c&H00FFFFFF&\fscx100\fscy100}")
                elif is_emph:
                    parts.append(r"{\c" + acc + "&}" + t + r"{\c&H00FFFFFF&\fscx100\fscy100}")
                else:
                    parts.append(t)
            pop = r"{\fscx86\fscy86\t(0,90,\fscx100\fscy100)}" if k == 0 else ""
            text = pop + r"{\fs" + str(size) + r"\pos(450,1060)}" + " ".join(parts)
            lines.append(f"Dialogue: 0,{_ts(a)},{_ts(b)},Cap,,0,0,0,,{text}")
    return head + "\n".join(lines) + "\n"
