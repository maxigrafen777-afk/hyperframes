"""Dauerbetrieb: mehrere Streamer beobachten und Kandidaten bis TRANSCRIBED vorbereiten.

  python -m pipeline.watch --config config.toml

- prüft jede Minute, wer live ist und eines der Spiele aus `games` spielt
- nimmt nur diese Streams auf (rollierender Puffer)
- liest alle Chats mit, schneidet bei einem Auslöser aus, transkribiert
- schreibt data/heartbeat.json, damit man von außen sieht, ob alles läuft
- räumt alte Dateien auf
Bewertet und gerendert wird in einem eigenen Schritt (tools/review.py oder per API).
"""

from __future__ import annotations

import argparse
import asyncio
import contextlib
import json
import logging
import shutil
import subprocess
import time
from pathlib import Path

from .config import Config, Streamer, load_config
from .db import DB
from .detect.chat_stats import ChatDetector, Trigger, to_candidate
from .judge.steps import step_transcribe
from .models import Status
from .sources.live_check import LiveInfo, check_live, is_wanted
from .sources.recorder import NotInBuffer, Recorder
from .sources.twitch_chat import read_chat

log = logging.getLogger("watch")

POLL_S = 60
RAW_KEEP_S = 6 * 3600       # Rohschnitte verworfener / gelieferter Clips
CLIP_KEEP_S = 3 * 24 * 3600  # fertige Clips


class Channel:
    def __init__(self, streamer: Streamer, cfg: Config, db: DB):
        self.s = streamer
        self.cfg = cfg
        self.db = db
        self.info: LiveInfo | None = None
        self.recorder: Recorder | None = None
        self.task: asyncio.Task | None = None
        self.detector: ChatDetector | None = None
        self.since = 0.0
        self.triggers = 0

    @property
    def recording(self) -> bool:
        return self.task is not None and not self.task.done()

    def start(self) -> None:
        self.recorder = Recorder(self.s.login, self.cfg.data_dir, segment_s=self.cfg.recorder.segment_s,
                                 buffer_s=self.cfg.recorder.buffer_s, quality=self.cfg.recorder.quality)
        self.task = asyncio.create_task(self.recorder.run(), name=f"rec-{self.s.login}")
        self.detector = ChatDetector(self.s.login, self.cfg.detect)  # frische Baseline je Session
        self.since = time.time()
        log.info("%s ist live (%s) – Aufnahme startet", self.s.login, self.info.category if self.info else "?")

    async def stop(self) -> None:
        if self.task:
            self.task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await self.task
        self.task = None
        self.detector = None
        log.info("%s offline oder anderes Spiel – Aufnahme gestoppt", self.s.login)

    def status(self) -> dict:
        return {
            "live": self.info is not None,
            "category": self.info.category if self.info else None,
            "recording": self.recording,
            "recording_since": self.since if self.recording else None,
            "segments": len(self.recorder.buffer.segments) if self.recorder and self.recording else 0,
            "triggers": self.triggers,
        }


class Watcher:
    def __init__(self, cfg: Config):
        self.cfg = cfg
        self.db = DB(cfg.db_path)
        self.channels = {s.login.lower(): Channel(s, cfg, self.db) for s in cfg.streamers}
        self.work = asyncio.Event()
        self.started = time.time()

    async def poll_live(self) -> None:
        sem = asyncio.Semaphore(5)  # Live-Checks parallel, aber nicht alle auf einmal

        async def check(ch: Channel) -> None:
            async with sem:
                ch.info = await check_live(ch.s.login)

        order = list(self.channels.values())  # Reihenfolge in der Config = Priorität
        while True:
            await asyncio.gather(*(check(ch) for ch in order))
            for ch in order:
                if ch.recording and not is_wanted(ch.info, self.cfg.games):
                    await ch.stop()
            limit = self.cfg.recorder.max_parallel
            wanted = [ch for ch in order if is_wanted(ch.info, self.cfg.games)][:limit]
            for ch in order:  # wer nicht mehr unter den Top-N ist, macht Platz
                if ch.recording and ch not in wanted:
                    log.info("%s pausiert: Platz für höher priorisierten Streamer", ch.s.login)
                    await ch.stop()
            for ch in wanted:
                if not ch.recording:
                    ch.start()
                    asyncio.create_task(self.snapshot(ch))
            await asyncio.sleep(POLL_S)

    async def snapshot(self, ch: Channel) -> None:
        """Ein Standbild pro Session, um die Facecam-Position zu prüfen."""
        await asyncio.sleep(20)
        if not ch.recorder or not ch.recorder.buffer.segments:
            return
        out = self.cfg.data_dir / "snapshots" / f"{ch.s.login}.jpg"
        out.parent.mkdir(parents=True, exist_ok=True)
        seg = ch.recorder.buffer.segments[-1].path
        await asyncio.to_thread(subprocess.run, ["ffmpeg", "-v", "error", "-y", "-i", str(seg),
                                                 "-frames:v", "1", str(out)], check=False)

    async def read_chats(self) -> None:
        logins = list(self.channels)
        async for login, line in read_chat(logins):
            ch = self.channels.get(login)
            if not ch or not ch.recording or not ch.detector:
                continue
            trig = ch.detector.feed(line)
            if trig:
                ch.triggers += 1
                s = trig.signals
                log.info("%s AUSLÖSER score=%.2f z=%.1f hype=%.0f%% %s", login, trig.pre_score, s.z,
                         s.hype_ratio * 100, s.reason)
                asyncio.create_task(self.cut(ch, trig))

    async def cut(self, ch: Channel, trig: Trigger) -> None:
        cand = to_candidate(trig, ch.s, self.cfg.clip)
        await asyncio.sleep(max(cand.end_ts - time.time(), 0) + self.cfg.recorder.segment_s * 2)
        if not ch.recorder:
            return
        name = f"{ch.s.login}_{int(cand.trigger_ts)}.mp4"
        try:
            clip = await asyncio.to_thread(ch.recorder.cut, cand.start_ts, cand.end_ts,
                                           self.cfg.data_dir / "raw" / name)
        except (NotInBuffer, subprocess.CalledProcessError) as e:
            log.warning("%s: Ausschneiden fehlgeschlagen: %s", ch.s.login, e)
            return
        cid = self.db.add_candidate(cand, raw_path=str(clip.path), raw_start_ts=clip.start_ts)
        if cid is None:
            clip.path.unlink(missing_ok=True)
            log.info("%s: Duplikat, schwächer als ein vorhandener Kandidat", ch.s.login)
        else:
            self.work.set()

    async def transcribe_worker(self) -> None:
        """Ein Worker, damit Whisper nicht doppelt die CPU belegt."""
        while True:
            clip = self.db.claim(Status.NEW, "watch", lease_s=600)
            if clip is None:
                self.work.clear()
                with contextlib.suppress(asyncio.TimeoutError):
                    await asyncio.wait_for(self.work.wait(), timeout=30)
                continue
            try:
                await asyncio.to_thread(step_transcribe, self.db, self.cfg, clip)
            except Exception as e:  # ein kaputter Clip darf den Dienst nicht stoppen
                log.exception("Transkription Clip %s fehlgeschlagen", clip.id)
                self.db.fail(clip.id, repr(e))

    async def cleanup(self) -> None:
        while True:
            now = time.time()
            for c in self.db.old_finished(RAW_KEEP_S):
                if c.raw_path:
                    Path(c.raw_path).unlink(missing_ok=True)
            for d in (self.cfg.data_dir / "clips").glob("*/frames"):
                if now - d.stat().st_mtime > RAW_KEEP_S:
                    shutil.rmtree(d, ignore_errors=True)
            for f in (self.cfg.data_dir / "clips").glob("*/clip.mp4"):
                if now - f.stat().st_mtime > CLIP_KEEP_S:
                    f.unlink(missing_ok=True)
            await asyncio.sleep(3600)

    async def heartbeat(self) -> None:
        path = self.cfg.data_dir / "heartbeat.json"
        while True:
            path.write_text(json.dumps({
                "ts": time.time(), "started": self.started, "db": self.db.counts(),
                "channels": {k: c.status() for k, c in self.channels.items()},
            }, indent=1), encoding="utf-8")
            await asyncio.sleep(30)

    async def run(self) -> None:
        parts = (self.poll_live, self.read_chats, self.transcribe_worker, self.cleanup, self.heartbeat)
        await asyncio.gather(*(supervise(fn.__name__, fn) for fn in parts))


async def supervise(name: str, factory) -> None:
    """Startet einen abgestürzten Teil neu, statt den ganzen Dienst sterben zu lassen."""
    backoff = 2.0
    while True:
        try:
            await factory()
            return
        except asyncio.CancelledError:
            raise
        except Exception:
            log.exception("%s abgestürzt, Neustart in %.0fs", name, backoff)
            await asyncio.sleep(backoff)
            backoff = min(backoff * 2, 120)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--config", type=Path, default=Path("config.toml"))
    ap.add_argument("--data-dir", type=Path)
    a = ap.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s",
                        datefmt="%Y-%m-%d %H:%M:%S")
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("httpx2").setLevel(logging.WARNING)
    cfg = load_config(a.config)
    if a.data_dir:
        cfg = cfg.model_copy(update={"data_dir": a.data_dir})
    asyncio.run(Watcher(cfg).run())


if __name__ == "__main__":
    main()
