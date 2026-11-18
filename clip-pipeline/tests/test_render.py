import json
import shutil
import subprocess

import pytest

from pipeline.config import Rect
from pipeline.judge.media import Word
from pipeline.models import Judgment
from pipeline.render.export import RenderJob, render
from pipeline.render.layout import OUT_H, OUT_W, SRC_H, SRC_W, blur_layout, split_layout
from pipeline.render.steps import post_text
from pipeline.render.subtitles import Placement, build_ass, group_lines, shift_words

ZARBEX_CAM = Rect(x=1452, y=762, w=468, h=318)


def W(s, e, t):
    return Word(start=s, end=e, word=t)


def test_split_layout_fills_frame_and_avoids_cam():
    for sx in (0.0, 0.5, 0.8, 1.0):
        lay = split_layout(ZARBEX_CAM, sx)
        assert lay.cam_h + lay.game_h == OUT_H
        g = lay.game_src
        assert 0 <= g.x and g.x + g.w <= SRC_W and g.h == SRC_H
        assert abs(g.w / g.h - OUT_W / lay.game_h) < 0.01      # kein Verzerren
        assert g.x + g.w <= ZARBEX_CAM.x                         # Cam nicht im Gameplay
        c = lay.cam_src
        assert abs(c.w / c.h - OUT_W / lay.cam_h) < 0.02
        assert ZARBEX_CAM.x <= c.x and c.x + c.w <= ZARBEX_CAM.x + ZARBEX_CAM.w + 1


def test_split_follows_subject():
    left = split_layout(Rect(x=0, y=0, w=400, h=300), 0.3).game_src.x
    right = split_layout(Rect(x=0, y=0, w=400, h=300), 0.9).game_src.x
    assert right > left


def test_blur_layout_centered():
    lay = blur_layout(0.5)
    assert abs(lay.fg_y * 2 + lay.fg_h - OUT_H) <= 2 and lay.fg_src.w == 1440  # gerade Pixel


def test_group_lines():
    words = [W(0, .2, " das"), W(.2, .4, " ist"), W(.4, .6, " krass,"), W(.6, .8, " du"),
             W(.8, 1, " kannst."), W(2.5, 3, " Hallo!")]
    assert [[w.word.strip() for w in l] for l in group_lines(words)] == [
        ["das", "ist", "krass,"], ["du", "kannst."], ["Hallo!"]]


def test_shift_words_keeps_only_cut():
    out = shift_words([W(1, 2, "a"), W(5, 6, "b"), W(9, 10, "c")], 4, 8)
    assert [(w.start, w.word) for w in out] == [(1, "b")]


def test_ass_never_overlaps_lines_and_highlights():
    words = [W(0, .5, " eins"), W(.5, 1, " zwei"), W(1, 1.2, " drei,"), W(1.25, 1.5, " vier")]
    ass = build_ass(words, duration=5, hook="Hook!", credit="twitch.tv/x",
                    place=Placement(caption_y=700, hook_y=900, credit_x=40, credit_y=730))
    caps = [l for l in ass.splitlines() if l.startswith("Dialogue: 1")]
    ends = [l.split(",")[2] for l in caps]
    assert ends[2] <= caps[3].split(",")[1]          # Zeile 1 endet vor Zeile 2
    assert "DREI" in caps[2] and "DREI," not in caps[2]
    assert caps[1].count("&H0000D4FF&") == 1 and "}ZWEI{" in caps[1]
    assert "HOOK!" in ass and "twitch.tv/x" in ass


def test_post_text():
    j = Judgment(keep=True, hype=8, start_s=0, end_s=10, peak_s=5, caption="Er hat den Blinker gesetzt 💀",
                 hashtags=["gta6", "#GTA6", "fail", "gaming!"])
    txt = post_text(j, "twitch:zarbex")
    assert "#gta6 #fail #gaming #zarbex" in txt and "Quelle: twitch.tv/zarbex" in txt


@pytest.mark.skipif(not shutil.which("ffmpeg"), reason="ffmpeg fehlt")
@pytest.mark.parametrize("layout", ["split", "blur"])
def test_render_end_to_end(tmp_path, layout):
    raw = tmp_path / "raw.mp4"
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", "testsrc2=size=1920x1080:rate=30:duration=4",
                    "-f", "lavfi", "-i", "sine=frequency=500:duration=4", "-c:v", "libx264", "-preset", "ultrafast",
                    "-c:a", "aac", "-shortest", str(raw)], check=True)
    out = render(RenderJob(raw=raw, out=tmp_path / "out.mp4", start_s=0.5, end_s=3.5, subject_x=0.4, layout=layout,
                           facecam=ZARBEX_CAM, words=[W(1, 1.5, " hallo"), W(1.6, 2, " welt")],
                           hook="Test", credit="twitch.tv/x"))
    info = json.loads(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "stream=codec_type,width,height:format=duration",
                                      "-of", "json", str(out)], capture_output=True, text=True, check=True).stdout)
    v = next(s for s in info["streams"] if s["codec_type"] == "video")
    assert (v["width"], v["height"]) == (1080, 1920)
    assert any(s["codec_type"] == "audio" for s in info["streams"])
    assert abs(float(info["format"]["duration"]) - 3.0) < 0.2


def test_censor():
    from pipeline.render.subtitles import censor_word
    bad = {"scheiße", "schwanz"}
    assert censor_word("Scheiße!", bad) == "Sch***e!"
    assert censor_word("Schwanz", bad) == "Sch***z"
    assert censor_word("Schwanzlos", bad) == "Sch******s"
    assert censor_word("Schein", bad) == "Schein"
