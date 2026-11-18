import random

import pytest

from pipeline.config import ClipCfg, Config, DetectCfg, Streamer
from pipeline.detect.chat_stats import ChatDetector, HypeMatcher, robust_z, to_candidate
from pipeline.models import ChatLine, Judgment
from pipeline.sources.twitch_chat import parse_privmsg

CFG = DetectCfg(hype_words=["KEKW", "LUL", "💀"])


def calm_chat(rng, t0, seconds, rate=0.5, users=40):
    """Normaler Chat: ~rate Nachrichten pro Sekunde."""
    out, t = [], t0
    while t < t0 + seconds:
        t += rng.expovariate(rate)
        out.append(ChatLine(ts=t, user=f"u{rng.randrange(users)}", text="hallo"))
    return out


def run(det, lines):
    return [tr for l in sorted(lines, key=lambda l: l.ts) if (tr := det.feed(l))]


def test_robust_z():
    z, med, mad = robust_z(30, [4, 5, 5, 6, 100])  # Ausreißer verzieht Median nicht
    assert med == 5 and mad == 1 and z == pytest.approx(25 / (5**0.5 + 1), rel=1e-3)


def test_calm_chat_never_triggers():
    rng = random.Random(1)
    assert run(ChatDetector("c", CFG), calm_chat(rng, 0, 1200)) == []


def test_burst_triggers_once_with_cooldown():
    rng = random.Random(2)
    lines = calm_chat(rng, 0, 600)
    lines += [ChatLine(ts=400 + i * 0.2, user=f"fan{i}", text="KEKW 💀") for i in range(40)]
    trigs = run(ChatDetector("c", CFG), lines)
    assert len(trigs) == 1
    t = trigs[0]
    assert t.signals.reason == "z" and 400 <= t.ts <= 410
    assert t.signals.hype_ratio > 0.5 and t.pre_score >= CFG.min_pre_score


def test_busy_calm_chat_never_triggers():
    rng = random.Random(7)  # dieser Seed hat vor dem Poisson-Fix ausgelöst
    assert run(ChatDetector("c", CFG), calm_chat(rng, 0, 1800, rate=0.8, users=60)) == []


def test_single_spammer_does_not_trigger():
    rng = random.Random(3)
    lines = calm_chat(rng, 0, 600)
    lines += [ChatLine(ts=400 + i * 0.1, user="spammer", text="KEKW") for i in range(80)]
    assert run(ChatDetector("c", CFG), lines) == []


def test_clip_calls_trigger():
    rng = random.Random(4)
    lines = calm_chat(rng, 0, 600)
    lines += [ChatLine(ts=400 + i, user=f"v{i}", text=t)
              for i, t in enumerate(["CLIP IT", "clip that 💀", "clip!!", "Clip das"])]
    trigs = run(ChatDetector("c", CFG), lines)
    assert len(trigs) == 1 and trigs[0].signals.reason == "clip_calls"


def test_no_trigger_during_warmup():
    lines = [ChatLine(ts=10 + i * 0.1, user=f"f{i}", text="KEKW") for i in range(60)]
    assert run(ChatDetector("c", CFG), lines) == []


def test_hype_matcher():
    m = HypeMatcher(["KEKW", "💀"])
    assert m("kekw!") and m("lol💀💀") and not m("KEKWait")


def test_window_respects_delay_and_max_len():
    rng = random.Random(2)
    lines = calm_chat(rng, 0, 600) + [ChatLine(ts=400 + i * 0.2, user=f"f{i}", text="KEKW") for i in range(40)]
    trig = run(ChatDetector("c", CFG), lines)[0]
    s = Streamer(login="x", chat_delay_s=5)
    c = to_candidate(trig, s, ClipCfg(pre_roll_s=20, post_roll_s=8, max_len_s=59))
    assert trig.ts - CFG.burst_s < trig.peak_ts <= trig.ts
    assert c.moment_ts == trig.peak_ts - 5 and c.start_ts == trig.peak_ts - 25 and c.end_ts == trig.ts + 8
    c = to_candidate(trig, s, ClipCfg(pre_roll_s=60, post_roll_s=8, max_len_s=30))
    assert c.end_ts - c.start_ts == 30 and c.end_ts == trig.ts + 8


def test_parse_privmsg():
    raw = ("@display-name=Foo\\sBar;tmi-sent-ts=1700000000500 "
           ":foo!foo@foo.tmi.twitch.tv PRIVMSG #Kanal :clip it KEKW")
    ch, line = parse_privmsg(raw, now=0)
    assert ch == "kanal" and line.user == "Foo Bar" and line.ts == 1700000000.5
    assert line.text == "clip it KEKW"
    assert parse_privmsg(":tmi.twitch.tv 001 justinfan :Welcome", now=0) is None


def test_judgment_hard_rules():
    j = Judgment(keep=True, hype=9, start_s=0, end_s=10, peak_s=5)
    assert j.final_keep(7)
    j.flags.story_spoiler = True
    assert not j.final_keep(7)
    fixed = Judgment(keep=True, hype=9, start_s=10, end_s=5, peak_s=2)
    assert (fixed.start_s, fixed.peak_s, fixed.end_s) == (5, 5, 10)


def test_config_rejects_small_buffer():
    with pytest.raises(ValueError):
        Config.model_validate({"recorder": {"buffer_s": 30}})
