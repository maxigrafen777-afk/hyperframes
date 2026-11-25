"""Live-Tests gegen echte Dienste (Netzwerk nötig). Start: FSS_LIVE=1 pytest tests/test_live.py"""

import json

import pytest

from conftest import live
from football_studio.config import Settings, elevenlabs_key

pytestmark = pytest.mark.skipif(not live(), reason="FSS_LIVE=1 setzen für Live-Tests")


def test_topic_finder_daily_ideas():
    from football_studio import topics

    ideas = topics.generate_daily(day="2030-01-01")
    assert len(ideas) == 10
    assert len({i["qid"] for i in ideas}) == 10
    assert len({i["category"] for i in ideas}) >= 3
    # zweiter Aufruf am selben Tag liefert dieselben Ideen, ein neuer Tag schließt sie aus
    assert [i["qid"] for i in topics.generate_daily(day="2030-01-01")] == [i["qid"] for i in ideas]
    nxt = topics.generate_daily(day="2030-01-02")
    assert not ({i["qid"] for i in nxt} & {i["qid"] for i in ideas})


def test_research_verifies_facts(tmp_path):
    from football_studio import research, topics

    r = topics.resolve("Sebastian Deisler")
    res = research.research(r["qid"], tmp_path, Settings(), log=lambda m: None)
    facts = {f["id"]: f for f in res["facts"]}
    assert facts["geburtsdatum"]["value"] == "1980-01-05" and facts["geburtsdatum"]["status"] == "verifiziert"
    assert len(facts["geburtsdatum"]["sources"]) >= 2
    assert any(c["team"] == "Hertha BSC" and c["status"] == "verifiziert" for c in res["career"])
    assert (tmp_path / "research" / "sources" / "dewiki.wikitext").exists()
    assert all(s.get("sha256") for s in res["sources"] if s["kind"] in ("wikidata", "wikipedia"))


@pytest.mark.parametrize("provider", ["piper", "elevenlabs"])
def test_voice(tmp_path, provider):
    from football_studio import voice

    if provider == "elevenlabs" and not elevenlabs_key():
        pytest.skip("kein ELEVENLABS_API_KEY")
    s = Settings()
    s.tts_provider = provider
    s.target_min_seconds = 1
    scenes = [{"id": "s01", "text": "Geboren 1980. 2007 war alles vorbei."}, {"id": "s02", "text": "Was ist passiert?"}]
    v = voice.synthesize(scenes, tmp_path, s, log=lambda m: None)
    assert v["provider"] == provider and v["duration"] > 2
    assert [w["text"] for w in v["words"]] == "Geboren 1980. 2007 war alles vorbei. Was ist passiert?".split()
    assert all(a["start"] <= b["start"] for a, b in zip(v["words"], v["words"][1:]))
    assert json.loads((tmp_path / "timing.json").read_text())["duration"] == v["duration"]
