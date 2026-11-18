import importlib.util
import shutil
import subprocess

import numpy as np
import pytest

from pipeline.config import Rect
from pipeline.render.layout import split_layout, blur_layout
from pipeline.render.letterbox import bars_in_frame

needs_demucs = pytest.mark.skipif(
    importlib.util.find_spec("demucs") is None or not shutil.which("ffmpeg"), reason="demucs/ffmpeg fehlt")


def test_bars_ignore_text_in_bar():
    g = np.full((1080, 1920), 120, np.uint8)
    g[:60] = 0
    g[15:35, 20:220] = 255          # "DAUERWERBESENDUNG" im Balken
    assert bars_in_frame(g) == (60, 1080)


def test_layouts_use_game_area_only():
    lay = split_layout(Rect(x=1452, y=762, w=468, h=318), 0.5, area=(62, 1080))
    assert lay.game_src.y == 62 and lay.game_src.y + lay.game_src.h <= 1080
    b = blur_layout(0.5, area=(62, 1080))
    assert b.fg_src.y == 62 and b.fg_src.h == 1018


def _tone_music(sr, seconds):
    t = np.arange(int(sr * seconds)) / sr
    chord = sum(np.sin(2 * np.pi * f * t) for f in (220, 277.2, 329.6, 440))
    beat = (np.sin(2 * np.pi * 2 * t) > 0.95) * np.sin(2 * np.pi * 60 * t) * 3
    return (0.08 * (chord + beat)).astype(np.float32)


@needs_demucs
def test_music_is_removed(tmp_path):
    """Sprache (Sinus-Formanten wären zu künstlich) wird durch Musik ersetzt-Test:
    reine Musik rein -> Stimmspur muss fast stumm sein, Musik wird gemeldet."""
    from pipeline.audio import SR, per_second_db, separate_vocals

    music = _tone_music(SR, 8)
    src = tmp_path / "music.wav"
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "f32le", "-ar", str(SR), "-ac", "1", "-i", "pipe:0",
                    "-ac", "2", str(src)], input=music.tobytes(), check=True)
    out = tmp_path / "vocals.wav"
    music_secs = separate_vocals(src, out)
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", str(out), "-ac", "1", "-ar", str(SR), "-f", "f32le", "pipe:1"],
                         capture_output=True, check=True).stdout
    vocals = np.frombuffer(raw, np.float32)
    music_db = per_second_db(music).mean()
    vocal_db = per_second_db(vocals).mean()
    assert music_db - vocal_db > 20, (music_db, vocal_db)   # Musik in der Stimmspur stark gedämpft
    assert len(music_secs) >= 6                              # und als Musik gemeldet


def test_locate_finds_static_rectangle():
    from pipeline.render.facecam import H, W, locate, static_edges
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    frames = []
    for i in range(5):  # weiches, sich bewegendes "Spiel" + feste Cam rechts mittig
        f = 128 + 100 * np.sin(xx / 41 + i * 1.3) * np.cos(yy / 29 - i * 0.7)
        f[212:371, 728:] = 30 + 20 * i
        frames.append(f.astype(np.float32))
    gy, gx = static_edges(frames)
    x, y, score = locate(gy, gx, 231, 156)
    assert abs(x - 728) <= 3 and abs(y - 212) <= 3 and score > 6
