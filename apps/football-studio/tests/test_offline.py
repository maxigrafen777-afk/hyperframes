"""Offline-Tests: laufen ohne Netzwerk in Sekunden."""

import re
import subprocess

import numpy as np
import pytest

from conftest import FIX
from football_studio import audio, composer, music, script, speech
from football_studio.config import Settings
from football_studio.research import _compare, _date_match, _place_match
from football_studio.sources import wikipedia as wp


# ---- Recherche-Parser ----------------------------------------------------------

def test_infobox_and_stations():
    text = (FIX / "dewiki_deisler.wikitext").read_text("utf-8")
    box = wp.infobox(text)
    assert wp.parse_german_date(box["geburtstag"]) == "1980-01-05"
    clubs = wp.stations(box)
    assert [c["team"] for c in clubs[:3]] == ["Borussia Mönchengladbach", "Hertha BSC", "FC Bayern München"]
    assert clubs[1]["matches"] == 56 and clubs[1]["goals"] == 9
    nat = [s for s in wp.stations(box, "national") if s["team"] == "Deutschland"]
    assert nat and nat[0]["matches"] == 36


def test_sentences_have_citations_and_no_markup():
    art = wp.article((FIX / "dewiki_deisler.wikitext").read_text("utf-8"))
    sents = [s for sec in art["sections"] for s in sec["sentences"]]
    assert len(sents) > 30
    assert all("[[" not in s["text"] and "<ref" not in s["text"] and "{{" not in s["text"] for s in sents)
    # Satzgrenzen nicht an Ordinalzahlen ("3. Spieltag") trennen
    assert any("am 3. Spieltag" in s["text"] for s in sents)
    assert any(s["cites"] for s in sents)
    assert any("welt.de" in c["url"] for c in art["citations"])


def test_fact_comparison_status():
    f = _compare({"wikidata": "1980-01-05", "dewiki": "1980-01-05", "enwiki": "1980-01-05"}, "g", "G", match=_date_match)
    assert f["status"] == "verifiziert" and len(f["sources"]) == 3
    f = _compare({"wikidata": "1980-01-05", "dewiki": "1980-01-06"}, "g", "G", match=_date_match)
    assert f["status"] == "widerspruch"
    f = _compare({"dewiki": "Lörrach"}, "o", "O", match=_place_match)
    assert f["status"] == "einzelquelle"


# ---- Sprechtext -----------------------------------------------------------------

@pytest.mark.parametrize("display,spoken", [
    ("am 3. Spieltag", "am dritten Spieltag"),
    ("Saison 1998/99", "Saison neunzehnhundertachtundneunzig neunundneunzig"),
    ("4,5 Millionen DM", "vier Komma fünf Millionen D-Mark"),
    ("beim 2:0", "beim zwei zu null"),
    ("im Jahr 2007.", "im Jahr zweitausendsieben."),
    ("36 Länderspiele", "sechsunddreißig Länderspiele"),
])
def test_speech_normalisation(display, spoken):
    assert speech.to_speech(display) == spoken


def test_tokens_one_to_one():
    toks = speech.spoken_tokens("Am 16. Januar 2007 beendete er seine Karriere.")
    assert [t for t, _ in toks] == "Am 16. Januar 2007 beendete er seine Karriere.".split()


# ---- Skript ---------------------------------------------------------------------

def test_rule_based_script_is_factual_and_in_range(research_fixture):
    s = Settings()
    sc = script.rule_based(research_fixture, "absturz", s)
    assert sc.validation["ok"], sc.validation
    assert 60 <= sc.est_seconds <= 120
    assert sc.scenes[0].role == "hook" and sc.scenes[-1].role == "outro"
    story = [x for x in sc.scenes if x.role == "story"]
    assert story and all(x.sentence_ids for x in story)
    # chronologisch: Jahreszahlen der Story steigen (nicht strikt)
    years = [int(re.search(r"(1[89]\d\d|20\d\d)", x.text).group(1)) for x in story if re.search(r"(1[89]\d\d|20\d\d)", x.text)]
    assert years == sorted(years)


def test_validator_flags_invented_numbers(research_fixture):
    s = Settings()
    sc = script.rule_based(research_fixture, "absturz", s)
    sc.scenes[2].text = "Er erzielte 987 Tore in einer einzigen Saison."
    sc = script.finalize(sc, research_fixture, s)
    assert not sc.validation["ok"]
    assert any("987" in i["message"] for i in sc.validation["issues"])


def test_private_sentences_excluded(research_fixture):
    sc = script.rule_based(research_fixture, "absturz", Settings())
    assert not any(script.PRIVATE.search(x.text) for x in sc.scenes)


# ---- Musik / Audio ----------------------------------------------------------------

def test_music_generation(tmp_path):
    info = music.compose(12, "dramatisch", "seed", tmp_path / "m.wav")
    assert info["source"] == "generated" and "Eigenkomposition" in info["license"]
    import wave

    with wave.open(str(tmp_path / "m.wav")) as w:
        assert w.getnchannels() == 2
        pcm = np.frombuffer(w.readframes(w.getnframes()), dtype="<i2")
        assert abs(w.getnframes() / w.getframerate() - 14) < 0.2
    peak = np.abs(pcm.astype(np.int32)).max() / 32767
    assert 0.5 < peak < 0.95  # normalisiert, ohne Clipping
    # deterministisch
    music.compose(12, "dramatisch", "seed", tmp_path / "m2.wav")
    assert (tmp_path / "m.wav").read_bytes() == (tmp_path / "m2.wav").read_bytes()


# ---- Composer ---------------------------------------------------------------------

def _fake_voice(sc):
    t, words, times = 0.15, [], []
    for s in sc.scenes:
        toks = s.text.split()
        st = t
        for tok in toks:
            words.append({"scene": s.id, "text": tok, "start": round(t, 3), "end": round(t + 0.3, 3)})
            t += 0.38
        times.append({"id": s.id, "start": round(st, 3), "end": round(t, 3)})
        t += 0.3
    return {"duration": t + 0.5, "words": words, "scene_times": times}


def test_composer_writes_valid_project(tmp_path, research_fixture):
    s = Settings()
    sc = script.rule_based(research_fixture, "absturz", s)
    voice = _fake_voice(sc)
    (tmp_path / "voice").mkdir()
    (tmp_path / "music").mkdir()
    audio.write_wav(tmp_path / "voice" / "voiceover.wav", np.zeros(int(audio.SR * voice["duration"]), dtype=np.float32))
    audio.write_wav(tmp_path / "music" / "music_ducked.wav", np.zeros(int(audio.SR * voice["duration"]), dtype=np.float32))
    vd = composer.build(tmp_path, {"id": "t", "script": sc.model_dump(), "voice": voice, "research": research_fixture}, s)
    idx = (vd / "index.html").read_text("utf-8")
    assert 'data-width="1080"' in idx and 'data-height="1920"' in idx
    for scn in sc.scenes:
        f = vd / "compositions" / f"{scn.id}.html"
        html = f.read_text("utf-8")
        assert f'window.__timelines["{scn.id}"]' in html and f'data-composition-id="{scn.id}"' in html
        assert "Math.random" not in html and "Date.now" not in html
    groups = composer.caption_groups(voice["words"])
    assert all(len(g["words"]) <= 3 for g in groups)
    assert all(g["end"] > g["start"] for g in groups)
    for a, b in zip(groups, groups[1:]):
        assert a["end"] <= b["start"]  # nie zwei Gruppen gleichzeitig


def test_ffmpeg_available():
    assert subprocess.run(["ffmpeg", "-version"], capture_output=True).returncode == 0
