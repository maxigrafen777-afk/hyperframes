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


def split_layout(cam: Rect, subject_x: float) -> SplitLayout:
    cam_h = _even(min(max(OUT_W * cam.h / cam.w, 560), 860))
    # Cam-Ausschnitt auf das Ausgabe-Seitenverhältnis 1080:cam_h bringen
    target = OUT_W / cam_h
    if cam.w / cam.h > target:   # Cam zu breit -> seitlich beschneiden
        cw, ch = cam.h * target, cam.h
    else:                        # Cam zu hoch -> oben/unten beschneiden
        cw, ch = cam.w, cam.w / target
    cam_box = Box(_even(cam.x + (cam.w - cw) / 2), _even(cam.y + (cam.h - ch) / 2), _even(cw), _even(ch))

    game_h = OUT_H - cam_h
    gw = min(_even(SRC_H * OUT_W / game_h), SRC_W)
    gx = _place(subject_x * SRC_W - gw / 2, gw, (cam.x, cam.x + cam.w))
    return SplitLayout(cam_box, cam_h, Box(gx, 0, gw, SRC_H), game_h)


def blur_layout(subject_x: float) -> BlurLayout:
    fg_w = 1440  # 4:3 aus 1920x1080
    fx = _place(subject_x * SRC_W - fg_w / 2, fg_w, None)
    fg_h = _even(OUT_W * SRC_H / fg_w)
    bg_full_w = _even(SRC_W * OUT_H / SRC_H)  # 3414 bei 1920 Höhe
    bg_x = int(min(max(subject_x * bg_full_w - OUT_W / 2, 0), bg_full_w - OUT_W))
    return BlurLayout(bg_x, Box(fx, 0, fg_w, SRC_H), _even((OUT_H - fg_h) / 2), fg_h)
