"""Eigene News-Grafiken als transparente PNG-Overlays (1080×1920): Marke, Tags, Headline,
Zahlen-Karte, Zitat-Karte, Transfer-Karte, Quellen- und Bildnachweis. Alle Texte in der TikTok-Safe-Zone."""

from __future__ import annotations

import textwrap
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

FONTS = Path(__file__).resolve().parent.parent / "assets" / "fonts"
W, H = 1080, 1920
SAFE_L, SAFE_R = 120, 960  # TikTok: Text zwischen x=120 und x=960 (unterhalb y=840 bis x=780)

TAG_COLORS = {
    "OFFIZIELL": (22, 163, 74), "BESTÄTIGT": (22, 163, 74), "BERICHT": (37, 99, 235), "GERÜCHT": (234, 88, 12),
    "EINORDNUNG": (250, 204, 21), "NEWS": None, "TRANSFER": (147, 51, 234), "MEINUNG": (100, 116, 139),
}


def font(kind: str, size: int) -> ImageFont.FreeTypeFont:
    f = {"display": "Anton-Regular.ttf", "black": "ArchivoBlack-Regular.ttf", "text": "Barlow-SemiBold.ttf"}[kind]
    return ImageFont.truetype(str(FONTS / f), size)


def hex_rgb(h: str) -> tuple[int, int, int]:
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def _fit_lines(text: str, f_kind: str, max_size: int, min_size: int, width: int, max_lines: int) -> tuple[ImageFont.FreeTypeFont, list[str]]:
    for size in range(max_size, min_size - 1, -4):
        f = font(f_kind, size)
        avg = f.getlength("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ") / 52
        lines = textwrap.wrap(text, max(6, int(width / avg)))
        if len(lines) <= max_lines and all(f.getlength(ln) <= width for ln in lines):
            return f, lines
    f = font(f_kind, min_size)
    return f, textwrap.wrap(text, max(6, int(width / (f.getlength("abcdefghij") / 10))))[:max_lines]


def _shadow_text(d: ImageDraw.ImageDraw, xy, text, f, fill=(255, 255, 255), shadow=(0, 0, 0, 200)):
    x, y = xy
    d.text((x + 3, y + 4), text, font=f, fill=shadow)
    d.text((x, y), text, font=f, fill=fill)


def overlay(graphic: dict, *, brand: str, brand_color: str, accent: str, credit: str = "", sources: list[str] | None = None,
            show_brand: bool = True) -> Image.Image:
    im = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    bc, ac = hex_rgb(brand_color), hex_rgb(accent)
    # Verlauf oben/unten für Lesbarkeit
    grad = Image.new("L", (1, H))
    for y in range(H):
        a = 0
        if y < 560:
            a = int(150 * (1 - y / 560))
        elif y > 900:
            a = int(190 * min(1, (y - 900) / 600))
        grad.putpixel((0, y), a)
    shade = Image.new("RGBA", (W, H), (0, 0, 0, 255))
    shade.putalpha(grad.resize((W, H)))
    im = Image.alpha_composite(im, shade)
    d = ImageDraw.Draw(im)
    if show_brand:
        f = font("black", 30)
        tw = f.getlength(brand)
        d.rectangle([SAFE_L, 196, SAFE_L + tw + 36, 246], fill=bc)
        d.text((SAFE_L + 18, 202), brand, font=f, fill=(255, 255, 255))
    t = graphic.get("type", "none")
    tag = (graphic.get("tag") or "").upper()
    y = 280
    if tag and tag != "NEWS" or t == "headline":
        label = tag or "NEWS"
        col = TAG_COLORS.get(label) or bc
        f = font("black", 36)
        tw = f.getlength(label)
        d.rectangle([SAFE_L, y, SAFE_L + tw + 40, y + 60], fill=col)
        d.text((SAFE_L + 20, y + 8), label, font=f, fill=(0, 0, 0) if label == "EINORDNUNG" else (255, 255, 255))
        y += 84
    if t == "headline" and graphic.get("title"):
        f, lines = _fit_lines(graphic["title"].upper(), "display", 96, 60, SAFE_R - SAFE_L - 40, 4)
        lh = int(f.size * 1.42)
        for i, ln in enumerate(lines):
            l, t, r, btm = d.textbbox((0, 0), ln, font=f)
            top = y + i * lh
            d.rectangle([SAFE_L, top, SAFE_L + (r - l) + 40, top + (btm - t) + 28], fill=(10, 10, 10, 235))
            d.text((SAFE_L + 20 - l, top + 14 - t), ln, font=f, fill=ac if i == 0 else (255, 255, 255))
    elif t == "stat" and graphic.get("value"):
        fv = font("display", 230)
        val = graphic["value"]
        l, t, r, btm = d.textbbox((0, 0), val, font=fv)
        fl = font("black", 54)
        label = (graphic.get("label") or "").upper()
        if label:  # Einheit über die Zahl ("VERTRAG BIS" / "MIO. EURO")
            _shadow_text(d, (SAFE_L + 54, y), label, fl, fill=ac)
            y += 80
        d.rectangle([SAFE_L, y, SAFE_L + 18, y + (btm - t)], fill=ac)
        _shadow_text(d, (SAFE_L + 50 - l, y - t), val, fv, fill=(255, 255, 255))
    elif t == "quote" and graphic.get("title"):
        fq = font("display", 170)
        d.text((SAFE_L, y - 30), "„", font=fq, fill=ac)
        f, lines = _fit_lines(graphic["title"], "black", 58, 40, SAFE_R - SAFE_L - 20, 5)
        lh = int(f.size * 1.25)
        box_h = lh * len(lines) + 40
        d.rectangle([SAFE_L, y + 120, SAFE_R, y + 120 + box_h], fill=(10, 10, 10, 215))
        for i, ln in enumerate(lines):
            d.text((SAFE_L + 24, y + 140 + i * lh), ln, font=f, fill=(255, 255, 255))
    elif t == "transfer":
        f, lines = _fit_lines((graphic.get("title") or "").upper(), "display", 96, 60, SAFE_R - SAFE_L, 2)
        for i, ln in enumerate(lines):
            _shadow_text(d, (SAFE_L, y + i * int(f.size * 1.1)), ln, f)
        yy = y + len(lines) * int(f.size * 1.1) + 20
        fl = font("black", 44)
        d.rectangle([SAFE_L, yy, SAFE_R, yy + 90], fill=(10, 10, 10, 220))
        d.text((SAFE_L + 24, yy + 18), f"{graphic.get('label', '')}  ➜  {graphic.get('value', '')}", font=fl, fill=ac)
    # Quellen + Bildnachweis (unten, innerhalb der Safe-Zone)
    fs = font("text", 26)
    if sources:
        src = "Quelle: " + ", ".join(sources[:3])
        _shadow_text(d, (SAFE_L, 1236), src[:60], fs, fill=(230, 230, 230))
    if credit:
        _shadow_text(d, (SAFE_L, 1272), credit[:60], fs, fill=(200, 200, 200))
    return im


def title_card(text: str, brand_color: str, accent: str, size=(W, H)) -> Image.Image:
    """Vollbild-Grafik, wenn kein lizenziertes Bild/Video passt (keine fremden Inhalte)."""
    bc, ac = hex_rgb(brand_color), hex_rgb(accent)
    im = Image.new("RGB", size, (12, 12, 14))
    d = ImageDraw.Draw(im)
    for i in range(-H, W + H, 90):
        d.line([(i, 0), (i + H * 0.6, H)], fill=(24, 24, 28), width=36)
    glow = Image.new("RGB", size, (0, 0, 0))
    ImageDraw.Draw(glow).ellipse([-300, 300, W + 300, 1500], fill=tuple(int(c * 0.35) for c in bc))
    im = Image.blend(im, glow.filter(ImageFilter.GaussianBlur(160)), 0.55)
    d = ImageDraw.Draw(im)
    f, lines = _fit_lines(text.upper(), "display", 150, 80, SAFE_R - SAFE_L, 4)
    lh = int(f.size * 1.08)
    y0 = 760 - lh * len(lines) // 2
    for i, ln in enumerate(lines):
        d.text((SAFE_L, y0 + i * lh), ln, font=f, fill=ac if i == 0 else (255, 255, 255))
    d.rectangle([SAFE_L, y0 - 40, SAFE_L + 160, y0 - 24], fill=bc)
    return im
