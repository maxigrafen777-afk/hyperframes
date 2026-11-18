import shutil
import subprocess
from types import SimpleNamespace

import pytest

from pipeline.config import Config, JudgeCfg, Rect, Streamer
from pipeline.db import DB
from pipeline.judge.judge import JudgeError, build_user_content, clamp, judge
from pipeline.judge.media import Transcript, Word, extract_frames, load_audio, loud_spikes, loudness_per_second
from pipeline.judge.steps import step_judge
from pipeline.models import Candidate, ChatLine, Judgment, Signals, Status

needs_ffmpeg = pytest.mark.skipif(not shutil.which("ffmpeg"), reason="ffmpeg fehlt")
ZARBEX = Streamer(login="zarbex", chat_delay_s=4, facecam=Rect(x=1452, y=762, w=468, h=318))


@pytest.fixture
def clip_file(tmp_path):
    """6 s Testbild; Ton leise, in Sekunde 3-4 laut (ein 'Schrei')."""
    out = tmp_path / "raw.mp4"
    subprocess.run(
        ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
         "-f", "lavfi", "-i", "testsrc2=size=1920x1080:rate=30:duration=6",
         "-f", "lavfi", "-i", "sine=frequency=300:duration=6",
         "-af", "volume='if(between(t,3,4),1,0.02)':eval=frame",
         "-c:v", "libx264", "-preset", "ultrafast", "-c:a", "aac", "-shortest", str(out)],
        check=True,
    )
    return out


@needs_ffmpeg
def test_loudness_and_frames(clip_file, tmp_path):
    loud = loudness_per_second(load_audio(clip_file))
    assert len(loud) in (5, 6)
    assert 3 in loud_spikes(loud) and set(loud_spikes(loud)) <= {3, 4}  # AAC verschiebt minimal
    frames = extract_frames(clip_file, tmp_path / "f", count=3, width=512)
    assert [round(t) for t, _ in frames] == [1, 3, 5] and all(p.stat().st_size > 1000 for _, p in frames)


def transcript():
    words = [Word(start=1.0, end=1.4, word=" Alter"), Word(start=1.5, end=2.0, word=" was"),
             Word(start=4.2, end=4.6, word=" NEIN!")]
    return Transcript(language="de", words=words, loudness_db=[-40, -40, -38, -12, -40])


def test_prompt_contains_everything(tmp_path):
    img = tmp_path / "f.jpg"
    img.write_bytes(b"\xff\xd8fake")
    chat = [ChatLine(ts=1010.0, user="fan", text="KEKW 💀")]
    content = build_user_content(frames=[(2.5, img)], transcript=transcript(), chat=chat,
                                 raw_start_ts=1000.0, duration=30, streamer=ZARBEX, trigger_ts=1012.0)
    assert content[1]["type"] == "image"
    text = content[-1]["text"]
    assert "Alter was" in text and "NEIN!" in text
    assert "10.0s fan: KEKW 💀" in text
    assert "Chat-Ausschlag bei  12.0s" in text and "Deutlich laute Sekunden: 3s" in text
    assert "Facecam vorhanden: ja" in text


def test_clamp():
    j = Judgment(keep=True, hype=8, start_s=-3, end_s=99, peak_s=50, layout="split")
    c = clamp(j, duration=30, has_facecam=False)
    assert (c.start_s, c.end_s, c.peak_s, c.layout) == (0, 30, 30, "blur")


class FakeClient:
    """Steht für anthropic.Anthropic und merkt sich die Anfrage."""

    def __init__(self, parsed, stop_reason="end_turn"):
        self.calls = []
        resp = SimpleNamespace(parsed_output=parsed, stop_reason=stop_reason,
                               usage=SimpleNamespace(input_tokens=1, output_tokens=1))
        self.beta = SimpleNamespace(messages=SimpleNamespace(parse=lambda **kw: self.calls.append(kw) or resp))


def test_judge_request_shape():
    j = Judgment(keep=True, hype=8, start_s=2, end_s=20, peak_s=9)
    client = FakeClient(j)
    out = judge(client, JudgeCfg(), streamer=ZARBEX, content=[{"type": "text", "text": "x"}], duration=30)
    assert out.hype == 8
    kw = client.calls[0]
    assert kw["model"] == "claude-opus-5-5" and kw["output_format"] is Judgment
    assert kw["fallbacks"] == "default" and kw["output_config"] == {"effort": "medium"}
    assert "unter 7" in kw["system"] and "(de)" in kw["system"]


def test_judge_refusal_raises():
    with pytest.raises(JudgeError):
        judge(FakeClient(None, "refusal"), JudgeCfg(), streamer=ZARBEX, content=[], duration=30)


def test_schema_is_accepted_by_sdk():
    """Das SDK baut aus Judgment ein JSON-Schema. Scheitert das, kommt ein anderer
    Fehler als der Verbindungsfehler zum (absichtlich falschen) Server."""
    anthropic = pytest.importorskip("anthropic")
    client = anthropic.Anthropic(api_key="test", base_url="http://127.0.0.1:9", max_retries=0)
    with pytest.raises(anthropic.APIConnectionError):
        judge(client, JudgeCfg(), streamer=ZARBEX, content=[{"type": "text", "text": "x"}], duration=30)


@needs_ffmpeg
@pytest.mark.parametrize("hype, status", [(8, Status.JUDGED), (5, Status.REJECTED)])
def test_step_judge_moves_status(clip_file, tmp_path, hype, status):
    cfg = Config(data_dir=tmp_path, streamers=[ZARBEX])
    db = DB(":memory:")
    sig = Signals(burst=30, median=5, mad=2, z=6, unique_users=20, unique_ratio=0.8,
                  hype_ratio=0.5, clip_calls=0, reason="z")
    cand = Candidate(streamer="twitch:zarbex", trigger_ts=1004, moment_ts=1000, start_ts=1000,
                     end_ts=1006, pre_score=0.6, signals=sig)
    cid = db.add_candidate(cand, raw_path=str(clip_file), raw_start_ts=1000)
    tpath = tmp_path / "t.json"
    tpath.write_text(transcript().model_dump_json())
    db.claim(Status.NEW, "w")
    db.advance(cid, Status.TRANSCRIBED, transcript_path=str(tpath))
    clip = db.claim(Status.TRANSCRIBED, "w")
    j = Judgment(keep=True, hype=hype, start_s=1, end_s=5, peak_s=3)
    assert step_judge(db, cfg, FakeClient(j), clip) == status
    stored = db.get(cid)
    assert stored.status == status and stored.judgment.hype == hype


def test_word_corrections():
    from pipeline.judge.media import correct
    fixes = {"schockst": "zockst"}
    assert correct(" schockst,", fixes) == " zockst,"
    assert correct(" Schockst", fixes) == " zockst"
    assert correct(" schockt", fixes) == " schockt"
