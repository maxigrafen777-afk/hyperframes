"""Einmal-Lauf: Streamer live aufnehmen, Chat auswerten, die ersten N Momente
ausschneiden und transkribieren. Zum Testen ohne den ganzen Orchestrator.

  python tools/live_once.py --config config.toml --count 2 --minutes 30
"""

from __future__ import annotations

import argparse
import asyncio
import logging
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from pipeline.config import load_config  # noqa: E402
from pipeline.db import DB  # noqa: E402
from pipeline.detect.chat_stats import ChatDetector, to_candidate  # noqa: E402
from pipeline.judge.steps import step_transcribe  # noqa: E402
from pipeline.models import Status  # noqa: E402
from pipeline.sources.recorder import Recorder  # noqa: E402
from pipeline.sources.twitch_chat import read_chat  # noqa: E402

log = logging.getLogger("live_once")


async def run(cfg_path: Path, count: int, minutes: float, data_dir: Path | None) -> None:
    cfg = load_config(cfg_path)
    if data_dir:
        cfg = cfg.model_copy(update={"data_dir": data_dir})
    streamer = cfg.streamers[0]
    db = DB(cfg.db_path)
    rec = Recorder(streamer.login, cfg.data_dir, segment_s=cfg.recorder.segment_s,
                   buffer_s=cfg.recorder.buffer_s, quality=cfg.recorder.quality)
    rec_task = asyncio.create_task(rec.run())
    det = ChatDetector(streamer.login, cfg.detect)
    pending: set[asyncio.Task] = set()
    done = 0

    async def cut_later(trig) -> None:
        nonlocal done
        cand = to_candidate(trig, streamer, cfg.clip)
        await asyncio.sleep(max(cand.end_ts - time.time(), 0) + cfg.recorder.segment_s * 2)
        n = len(list((cfg.data_dir / "raw").glob("*.mp4"))) if (cfg.data_dir / "raw").exists() else 0
        clip = rec.cut(cand.start_ts, cand.end_ts, cfg.data_dir / "raw" / f"{streamer.login}_{n:03d}.mp4")
        cid = db.add_candidate(cand, raw_path=str(clip.path), raw_start_ts=clip.start_ts)
        if cid is None:
            log.info("Duplikat verworfen")
            return
        step_transcribe(db, cfg, db.claim(Status.NEW, "live_once"))
        done += 1
        log.info("Clip %s fertig geschnitten + transkribiert (%d/%d)", cid, done, count)

    deadline = time.time() + minutes * 60
    async for _, line in read_chat([streamer.login]):
        if time.time() > deadline or done >= count:
            break
        trig = det.feed(line)
        if trig and len(pending) + done < count:
            s = trig.signals
            log.info("AUSLÖSER score=%.2f z=%.1f hype=%.0f%% (%s)", trig.pre_score, s.z, s.hype_ratio * 100, s.reason)
            t = asyncio.create_task(cut_later(trig))
            pending.add(t)
            t.add_done_callback(pending.discard)
    if pending:
        await asyncio.gather(*pending)
    rec_task.cancel()
    print(db.counts())


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(message)s", datefmt="%H:%M:%S")
    ap = argparse.ArgumentParser()
    ap.add_argument("--config", type=Path, default=Path("config.toml"))
    ap.add_argument("--count", type=int, default=1)
    ap.add_argument("--minutes", type=float, default=30)
    ap.add_argument("--data-dir", type=Path)
    a = ap.parse_args()
    asyncio.run(run(a.config, a.count, a.minutes, a.data_dir))


if __name__ == "__main__":
    main()
