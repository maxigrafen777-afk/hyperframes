"""9:16-Layout berechnen (reine Geometrie, ohne ffmpeg testbar).

split: Facecam oben, Gameplay unten. Der Gameplay-Ausschnitt folgt subject_x
       und meidet die Facecam, wenn sie im Bild klebt.
blur:  Gameplay mittig (4:3) auf unscharfem Hintergrund.
"""

from __future__ import annotations

from dataclasses import dataclass

from ..config import Rect

OUT_W, OUT_H = 1080, 1920
SRC_W, SRC_H = 1920, 1080  # Eingang wird vorher auf 1920x1080 skaliert


def _even(v: float) -> int:
    return max(2, int(round(v / 2)) * 2)


@dataclass(frozen=True)
class Box:
    x: int
    y: int
    w: int
    h: int

    def crop(self) -> str:
        return f"crop={self.w}:{self.h}:{self.x}:{self.y}"


@dataclass(frozen=True)
class SplitLayout:
    cam_src: Box   # Ausschnitt im Quellbild
    cam_h: int     # Höhe oben im Ausgabebild
    game_src: Box
    game_h: int

    @property
    def caption_y(self) -> int:  # Untertitel auf der Naht zwischen Cam und Gameplay
        return self.cam_h

    @property
    def hook_y(self) -> int:
        return self.cam_h + 230

    @property
    def credit_pos(self) -> tuple[int, int]:
        return 40, self.cam_h + 28


@dataclass(frozen=True)
class BlurLayout:
    bg_x: int      # x-Versatz des Hintergrund-Ausschnitts nach Skalierung auf 1920 Höhe
    fg_src: Box    # 4:3-Ausschnitt des Gameplays
    fg_y: int
    fg_h: int

    @property
    def caption_y(self) -> int:
        return self.fg_y + self.fg_h + 170

    @property
    def hook_y(self) -> int:
        return self.fg_y - 190

    @property
    def credit_pos(self) -> tuple[int, int]:
        return 40, self.fg_y - 60


def _place(want_x: float, width: int, avoid: tuple[int, int] | None) -> int:
    """Linke Kante eines Fensters der Breite `width` möglichst nah an want_x,
    im Bild und, wenn möglich, ohne den Bereich `avoid` (x0, x1) zu überdecken."""
    lo, hi = 0, SRC_W - width
    x = min(max(want_x, lo), hi)
    if avoid:
        a0, a1 = avoid
        options = []
        if a0 - width >= lo:          # komplett links von der Cam
            options.append((lo, a0 - width))
        if a1 <= hi:                  # komplett rechts von der Cam
            options.append((a1, hi))
        if options:
            x = min((min(max(x, o0), o1) for o0, o1 in options), key=lambda c: abs(c - x))
    return _even(x) if x > 0 else 0


CAM_INSET = 8        # px rundum nach innen: keine Gameplay-/Rahmenreste am Cam-Rand
CAM_MIN_H, CAM_MAX_H = 520, 640   # Cam höchstens ein Drittel des Bildes, sonst zu groß und unscharf
CAM_TOP_SHARE = 0.25  # muss oben/unten beschnitten werden: 25 % oben (Kopf!), 75 % unten (Tisch)


def split_layout(cam: Rect, subject_x: float, area: tuple[int, int] = (0, SRC_H)) -> SplitLayout:
    inner = Rect(x=cam.x + CAM_INSET, y=cam.y + CAM_INSET,
                 w=max(cam.w - 2 * CAM_INSET, 32), h=max(cam.h - 2 * CAM_INSET, 32))
    cam_h = _even(min(max(OUT_W * inner.h / inner.w, CAM_MIN_H), CAM_MAX_H))
    # Cam-Ausschnitt auf das Ausgabe-Seitenverhältnis 1080:cam_h bringen
    target = OUT_W / cam_h
    if inner.w / inner.h > target:   # Cam zu breit -> seitlich beschneiden (mittig)
        cw, ch = inner.h * target, inner.h
        cx, cy = inner.x + (inner.w - cw) / 2, inner.y
    else:                            # Cam zu hoch -> oben wenig, unten mehr beschneiden
        cw, ch = inner.w, inner.w / target
        cx, cy = inner.x, inner.y + (inner.h - ch) * CAM_TOP_SHARE
    cam_box = Box(_even(cx), _even(cy), _even(cw), _even(ch))

    game_h = OUT_H - cam_h
    y0, y1 = area
    gh = _even(y1 - y0)
    gw = min(_even(gh * OUT_W / game_h), SRC_W)
    gx = _place(subject_x * SRC_W - gw / 2, gw, (cam.x, cam.x + cam.w))
    return SplitLayout(cam_box, cam_h, Box(gx, _even(y0) if y0 else 0, gw, gh), game_h)


def blur_layout(subject_x: float, area: tuple[int, int] = (0, SRC_H)) -> BlurLayout:
    y0, y1 = area
    gh = _even(y1 - y0)
    fg_w = _even(gh * 4 / 3)  # 4:3 aus dem sichtbaren Bereich
    fx = _place(subject_x * SRC_W - fg_w / 2, fg_w, None)
    fg_h = _even(OUT_W * gh / fg_w)
    bg_full_w = _even(SRC_W * OUT_H / SRC_H)  # 3414 bei 1920 Höhe
    bg_x = int(min(max(subject_x * bg_full_w - OUT_W / 2, 0), bg_full_w - OUT_W))
    return BlurLayout(bg_x, Box(fx, _even(y0) if y0 else 0, fg_w, gh), _even((OUT_H - fg_h) / 2), fg_h)
