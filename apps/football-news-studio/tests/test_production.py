"""Schritt 5–8: Skript-Prüfer, Untertitel, Schnittliste, FFmpeg-Render, Lizenz-Abbruch, End-to-End."""

import json
import subprocess
from pathlib import Path

import numpy as np
import pytest

from conftest import live
from newsstudio import audio
from newsstudio.config import Settings
from newsstudio.editor import captions, ffmpeg_render, timeline
from newsstudio.library import entities, importer, license
from newsstudio.script import writer

RESEARCH = {
    "topic": "Harry Kane und der FC Bayern",
    "entities": [{"id": 1, "name": "Harry Kane", "kind": "spieler", "club": "FC Bayern München"}],
    "sources": ["FAZ", "Sportschau", "Sky"],
    "conflicts": [],
    "articles": [{"id": "a0", "source": "FAZ", "tier": 1, "title": "Kane trifft doppelt", "url": "https://x", "excerpt": ""}],
    "claims": [
        {"id": "c0", "text": "Harry Kane erzielte beim 3:1 gegen Dortmund zwei Tore.", "status": "bestätigt",
         "sources": ["FAZ", "Sportschau"], "numbers": [], "quote": False, "weight": 9,
         "variants": [{"source": "FAZ", "text": "Harry Kane erzielte beim 3:1 gegen Dortmund zwei Tore."}]},
        {"id": "c1", "text": "Der FC Bayern will den Vertrag von Harry Kane bis 2029 verlängern.", "status": "gerücht",
         "sources": ["Sky"], "numbers": ["bis 2029"], "quote": False, "weight": 5,
         "variants": [{"source": "Sky", "text": "Der FC Bayern soll den Vertrag von Harry Kane bis 2029 verlängern wollen."}]},
    ],
}


def _script(texts, claim_ids):
    sc = writer.Script(title="T", caption="", hashtags=[], engine="test",
                       scenes=[writer.Scene(text=t, claim_ids=c) for t, c in zip(texts, claim_ids)])
    return writer.finalize(sc, RESEARCH, Settings())


def test_validator_accepts_sourced_script():
    s = _script(["Harry Kane trifft doppelt.", "Beim 3:1 gegen Dortmund erzielte Kane zwei Tore.",
                 "Laut Sky soll der Vertrag bis 2029 verlängert werden."], [[], ["c0"], ["c1"]])
    assert s.validation["ok"], s.validation


def test_validator_blocks_invented_number_and_unmarked_rumor():
    s = _script(["Kane kostete 150 Millionen.", "Der Vertrag wird bis 2029 verlängert."], [[], ["c1"]])
    msgs = " ".join(i["message"] for i in s.validation["issues"])
    assert not s.validation["ok"] and "150" in msgs and "Gerücht" in msgs


def test_briefing_marks_rumors():
    s = writer.briefing(RESEARCH, Settings())
    rumor = next(sc for sc in s.scenes if "c1" in sc.claim_ids)
    assert rumor.graphic.tag == "GERÜCHT" and "laut Sky" in rumor.text
    assert s.validation["ok"]


def test_ass_captions_highlight_words():
    words = [{"scene": "s01", "text": w, "start": i * 0.4, "end": i * 0.4 + 0.35} for i, w in enumerate("Harry Kane trifft doppelt für Bayern.".split())]
    ass = captions.build_ass(words, {"s01": ["Harry Kane"]}, "#FFD400")
    assert "PlayResX: 1080" in ass and ass.count("Dialogue:") == len(words)
    assert r"\pos(450,1060)" in ass  # TikTok-Safe-Zone
    gs = captions.groups(words)
    assert all(len(g["words"]) <= 3 for g in gs) and all(a["end"] <= b["start"] for a, b in zip(gs, gs[1:]))


def _fake_voice(script: dict, folder: Path) -> dict:
    t, times, words = 0.15, [], []
    for sc in script["scenes"]:
        st = t
        for w in sc["text"].split():
            words.append({"scene": sc["id"], "text": w, "start": round(t, 3), "end": round(t + 0.3, 3)})
            t += 0.36
        times.append({"id": sc["id"], "start": round(st, 3), "end": round(t, 3)})
        t += 0.3
    folder.mkdir(parents=True, exist_ok=True)
    sr = audio.SR
    tt = np.arange(int(t * sr)) / sr
    audio.write_wav(folder / "voiceover.wav", (0.2 * np.sin(2 * np.pi * 180 * tt)).astype(np.float32))
    return {"duration": round(t + 0.2, 3), "scene_times": times, "words": words, "file_abs": str(folder / "voiceover.wav")}


def _confirm_test_profiles():
    for src in ("MAXPPP", "PressBox"):
        license.save_profile({"platforms": "tiktok", "commercial": 1, "valid_until": "2099-12-31", "confirmed": 1},
                             importer.default_profile_id(src))


@pytest.fixture
def studio(env, testlib):
    entities.seed_static()
    entities.upsert("spieler", "Harry Kane", [], "Q186720", "FC Bayern München")
    importer.scan(testlib, log=lambda m: None, is_test=True)
    return env


def test_render_produces_tiktok_mp4(studio, tmp_path):
    _confirm_test_profiles()
    s = Settings()
    sc = writer.briefing(RESEARCH, s).model_dump()
    v = _fake_voice(sc, tmp_path / "voice")
    tl = timeline.plan(sc, v, s)
    assert max(c["duration"] for c in tl["cuts"] if c["kind"] != "video") <= s.max_still_seconds + 0.01
    assert any(c["kind"] == "video" for c in tl["cuts"])
    assert all("Kane" in c["filename"] for c in tl["cuts"] if c.get("filename") and c["scene"] in ("s02", "s03"))
    res = ffmpeg_render.render(tmp_path, sc, v, s, preview=False, log=lambda m: None)
    info = json.loads(subprocess.run(["ffprobe", "-v", "error", "-show_streams", "-show_format", "-of", "json", res["file"]],
                                     capture_output=True, text=True).stdout)
    vs = next(x for x in info["streams"] if x["codec_type"] == "video")
    a = next(x for x in info["streams"] if x["codec_type"] == "audio")
    assert (vs["width"], vs["height"], vs["r_frame_rate"], vs["codec_name"]) == (1080, 1920, "30/1", "h264")
    assert a["codec_name"] == "aac" and a["sample_rate"] == "48000"
    assert abs(float(info["format"]["duration"]) - v["duration"]) < 0.6


def test_render_aborts_on_unlicensed_media(studio, tmp_path):
    _confirm_test_profiles()
    s = Settings()
    sc = writer.briefing(RESEARCH, s).model_dump()
    v = _fake_voice(sc, tmp_path / "voice")
    tl = timeline.plan(sc, v, s)
    used = tl["used_media"][0]
    from newsstudio import db

    db.execute("UPDATE media SET blocked=1 WHERE id=?", (used,))
    assert ffmpeg_render.license_recheck(tl["cuts"], s)


@pytest.mark.skipif(not live(), reason="NS_LIVE=1 für den Live-End-to-End-Test")
def test_end_to_end_current_topic(studio):
    """Aktuelles Thema → Recherche → Skript → Medien → Stimme → Vorschau → Export."""
    from newsstudio import pipeline, projects
    from newsstudio.news import research

    _confirm_test_profiles()
    entities.sync_wikidata(["Q82595"], log=lambda m: None)
    top = research.trending(log=lambda m: None)
    person = next(t for t in top if t["kind"] != "verein")
    p = projects.create(f"{person['entity']}: {person['suggested_topic']}")
    pipeline.run_all(p["id"])
    pipeline.run_render(p["id"], final=True)
    p = projects.load(p["id"])
    assert p["script"]["validation"]["ok"]
    assert len(p["research"]["sources"]) >= 3
    final = projects.pdir(p["id"]) / p["outputs"]["final"]
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "stream=width,height", "-of", "csv=p=0", str(final)],
                         capture_output=True, text=True).stdout
    assert "1080,1920" in out
    dur = p["voice"]["duration"]
    assert 45 <= dur <= 125
    print("\nE2E:", p["topic"], "→", final, f"{dur:.1f}s", "Warnungen:", p["timeline"]["warnings"])
