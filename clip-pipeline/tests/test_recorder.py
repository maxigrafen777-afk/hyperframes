import asyncio
import json
import shutil
import subprocess
from pathlib import Path

import pytest

from pipeline.sources.recorder import NotInBuffer, Recorder, SegmentBuffer
from pipeline.sources.twitch_api import parse_streams, wanted

needs_ffmpeg = pytest.mark.skipif(not shutil.which("ffmpeg"), reason="ffmpeg fehlt")


class Clock:
    def __init__(self, t=1000.0):
        self.t = t

    def __call__(self):
        return self.t


def write_list(d: Path, rows):
    with (d / "list.csv").open("a") as f:
        for name, a, b in rows:
            (d / name).write_bytes(b"x")
            f.write(f"{name},{a},{b}\n")


def test_buffer_timestamps_batch_and_prune(tmp_path):
    clock = Clock(1000)
    buf = SegmentBuffer(tmp_path, buffer_s=10, clock=clock)
    write_list(tmp_path, [("s0.ts", 0, 2), ("s1.ts", 2, 4)])  # zwei auf einmal
    assert buf.poll() == 2
    assert [(s.start_ts, s.end_ts) for s in buf.segments] == [(996, 998), (998, 1000)]
    clock.t = 1001.5  # etwas zu früh abgefragt -> darf nicht überlappen
    write_list(tmp_path, [("s2.ts", 4, 6)])
    buf.poll()
    assert buf.segments[-1].start_ts == 1000
    clock.t = 1009
    assert buf.prune() == 1 and not (tmp_path / "s0.ts").exists()
    with pytest.raises(NotInBuffer):
        buf.covering(900, 950)


def test_buffer_ignores_half_written_line(tmp_path):
    buf = SegmentBuffer(tmp_path, buffer_s=60, clock=Clock())
    (tmp_path / "list.csv").write_text("s0.ts,0,2\ns1.ts,2,")
    assert buf.poll() == 1
    with (tmp_path / "list.csv").open("a") as f:
        f.write("4\n")
    assert buf.poll() == 1 and buf.segments[-1].path.name == "s1.ts"


@needs_ffmpeg
def test_record_and_cut(tmp_path):
    """Echter Durchlauf: Testbild mit Ton als 'Stream', 9 s aufnehmen, 4 s ausschneiden."""
    source = ["ffmpeg", "-hide_banner", "-loglevel", "error", "-re",
              "-f", "lavfi", "-i", "testsrc2=size=640x360:rate=30",
              "-f", "lavfi", "-i", "sine=frequency=440",
              "-t", "9", "-c:v", "libx264", "-preset", "ultrafast", "-g", "30",
              "-c:a", "aac", "-f", "mpegts", "pipe:1"]
    rec = Recorder("test", tmp_path, segment_s=1, buffer_s=60, source_cmd=source)
    asyncio.run(rec.run(restart=False))
    segs = rec.buffer.segments
    assert len(segs) >= 7
    mid = segs[len(segs) // 2].start_ts
    clip = rec.cut(mid - 2, mid + 2, tmp_path / "raw.mp4")
    assert clip.start_ts <= mid - 2 + 1 and clip.end_ts >= mid + 2 - 1
    probe = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration:stream=codec_type",
         "-of", "json", str(clip.path)], capture_output=True, text=True, check=True)
    info = json.loads(probe.stdout)
    assert {s["codec_type"] for s in info["streams"]} == {"video", "audio"}
    assert 3 <= float(info["format"]["duration"]) <= 7


def test_parse_streams_and_game_filter():
    payload = {"data": [
        {"user_login": "Zarbex", "type": "live", "game_name": "Grand Theft Auto VI",
         "title": "GTA 6!", "viewer_count": 12000, "language": "de"},
        {"user_login": "other", "type": "live", "game_name": "Just Chatting"},
        {"user_login": "rerun", "type": "", "game_name": "Grand Theft Auto VI"},
    ]}
    streams = parse_streams(payload)
    assert [s.login for s in streams] == ["zarbex", "other"]
    assert list(wanted(streams, ["grand theft auto vi"])) == ["zarbex"]
    assert len(wanted(streams, [])) == 2
