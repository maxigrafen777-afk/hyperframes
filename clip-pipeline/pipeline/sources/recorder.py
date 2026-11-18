"""Stream aufnehmen: streamlink -> ffmpeg (ohne Neukodierung) -> kurze Segmente.

Ein rollierender Puffer hält nur die letzten `buffer_s` Sekunden. Jedes
Segment bekommt eine Wanduhrzeit: Ende = Moment, in dem ffmpeg es
abgeschlossen hat (Zeile in der Segmentliste), Start = Ende - Dauer.
Damit liegen Video und Chat auf derselben Uhr; der feste Versatz des
Streams steckt in `chat_delay_s` des Streamers.
"""

from __future__ import annotations

import asyncio
import contextlib
import logging
import os
import shutil
import subprocess
import tempfile
import time
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path

log = logging.getLogger(__name__)


@dataclass(frozen=True)
class Segment:
    path: Path
    start_ts: float
    end_ts: float


@dataclass(frozen=True)
class RawClip:
    path: Path
    start_ts: float  # Wanduhrzeit des ersten Bildes im Rohschnitt
    end_ts: float


class NotInBuffer(LookupError):
    pass


def streamlink_cmd(login: str, quality: str) -> list[str]:
    return [
        "streamlink", "--stdout", "--twitch-disable-ads", "--twitch-low-latency",
        "--retry-open", "3", f"https://twitch.tv/{login}", quality,
    ]


def ffmpeg_segment_cmd(seg_dir: Path, segment_s: int) -> list[str]:
    return [
        "ffmpeg", "-hide_banner", "-loglevel", "error", "-i", "pipe:0",
        "-map", "0:v:0?", "-map", "0:a:0?", "-c", "copy",
        "-f", "segment", "-segment_time", str(segment_s), "-segment_format", "mpegts",
        "-reset_timestamps", "1",
        "-segment_list", str(seg_dir / "list.csv"), "-segment_list_type", "csv",
        "-segment_list_flags", "+live",
        str(seg_dir / "seg_%07d.ts"),
    ]


class SegmentBuffer:
    """Index der Segmente auf der Platte. Unabhängig von Prozessen testbar."""

    def __init__(self, seg_dir: Path, buffer_s: float, clock: Callable[[], float] = time.time):
        self.dir = seg_dir
        self.buffer_s = buffer_s
        self.clock = clock
        self.segments: list[Segment] = []
        self._list_pos = 0

    def poll(self) -> int:
        """Neue Zeilen der Segmentliste einlesen. Gibt Anzahl neuer Segmente zurück."""
        lst = self.dir / "list.csv"
        if not lst.exists():
            return 0
        with lst.open(encoding="utf-8") as f:
            f.seek(self._list_pos)
            chunk = f.read()
        lines = chunk.split("\n")
        complete, rest = lines[:-1], lines[-1]  # letzte Zeile evtl. halb geschrieben
        self._list_pos += len(chunk.encode("utf-8")) - len(rest.encode("utf-8"))
        batch: list[tuple[str, float]] = []
        for line in complete:
            parts = line.strip().split(",")
            if len(parts) >= 3:
                batch.append((parts[0], max(float(parts[2]) - float(parts[1]), 0.0)))
        # Kamen mehrere Segmente auf einmal, endet das letzte jetzt und die
        # anderen liegen lückenlos davor.
        t = self.clock()
        placed: list[Segment] = []
        for name, dur in reversed(batch):
            placed.append(Segment(self.dir / name, t - dur, t))
            t -= dur
        placed.reverse()
        if placed and self.segments and placed[0].start_ts < self.segments[-1].end_ts:
            # Abfrage-Jitter: nie mit dem vorigen Segment überlappen
            first = placed[0]
            placed[0] = Segment(first.path, self.segments[-1].end_ts, max(first.end_ts, self.segments[-1].end_ts))
        self.segments.extend(placed)
        return len(placed)

    def prune(self) -> int:
        cutoff = self.clock() - self.buffer_s
        old = [s for s in self.segments if s.end_ts < cutoff]
        for s in old:
            s.path.unlink(missing_ok=True)
        self.segments = [s for s in self.segments if s.end_ts >= cutoff]
        return len(old)

    def covering(self, start_ts: float, end_ts: float) -> list[Segment]:
        segs = [s for s in self.segments if s.end_ts > start_ts and s.start_ts < end_ts]
        if not segs:
            raise NotInBuffer(f"{start_ts:.1f}-{end_ts:.1f} liegt nicht im Puffer")
        if segs[0].start_ts > start_ts + 2 or segs[-1].end_ts < end_ts - 2:
            raise NotInBuffer("Zeitraum nur teilweise im Puffer")
        return segs

    def cut(self, start_ts: float, end_ts: float, out: Path) -> RawClip:
        """Zeitraum ausschneiden: Segmente verlustfrei zusammenfügen.

        Geschnitten wird auf Segmentgrenzen (Keyframes), also etwas großzügiger
        als verlangt. Den genauen Schnitt macht später das Rendering anhand
        von RawClip.start_ts."""
        segs = self.covering(start_ts, end_ts)
        out.parent.mkdir(parents=True, exist_ok=True)
        with tempfile.NamedTemporaryFile("w", suffix=".txt", delete=False, dir=out.parent) as f:
            for s in segs:
                f.write(f"file '{s.path.resolve()}'\n")
            listfile = Path(f.name)
        try:
            subprocess.run(
                ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
                 "-f", "concat", "-safe", "0", "-i", str(listfile),
                 "-c", "copy", "-fflags", "+genpts", str(out)],
                check=True, capture_output=True, text=True,
            )
        finally:
            listfile.unlink(missing_ok=True)
        return RawClip(out, segs[0].start_ts, segs[-1].end_ts)


class Recorder:
    """Nimmt einen Kanal auf, solange `run()` läuft. Startet bei Abbruch neu."""

    def __init__(
        self,
        login: str,
        work_dir: Path,
        *,
        segment_s: int = 2,
        buffer_s: float = 180,
        quality: str = "best",
        source_cmd: list[str] | None = None,  # für Tests: statt streamlink
    ):
        self.login = login
        self.seg_dir = work_dir / "buffer" / login
        self.segment_s = segment_s
        self.source_cmd = source_cmd or streamlink_cmd(login, quality)
        self.buffer = SegmentBuffer(self.seg_dir, buffer_s)
        self.running = False

    def _reset_dir(self) -> None:
        shutil.rmtree(self.seg_dir, ignore_errors=True)
        self.seg_dir.mkdir(parents=True, exist_ok=True)
        self.buffer.segments.clear()
        self.buffer._list_pos = 0

    async def _run_once(self) -> int:
        self._reset_dir()
        # streamlink schreibt direkt in ffmpeg, ohne Umweg über Python
        rfd, wfd = os.pipe()
        try:
            src = await asyncio.create_subprocess_exec(
                *self.source_cmd, stdout=wfd, stderr=subprocess.DEVNULL
            )
            enc = await asyncio.create_subprocess_exec(
                *ffmpeg_segment_cmd(self.seg_dir, self.segment_s), stdin=rfd,
                stderr=subprocess.DEVNULL,
            )
        finally:
            os.close(rfd)
            os.close(wfd)
        self.running = True
        try:
            while enc.returncode is None:
                self.buffer.poll()
                self.buffer.prune()
                with contextlib.suppress(asyncio.TimeoutError):
                    await asyncio.wait_for(enc.wait(), timeout=0.5)
            self.buffer.poll()
            return enc.returncode or 0
        finally:
            self.running = False
            for p in (src, enc):
                if p.returncode is None:
                    p.terminate()
                    with contextlib.suppress(asyncio.TimeoutError, ProcessLookupError):
                        await asyncio.wait_for(p.wait(), timeout=5)
                    if p.returncode is None:
                        p.kill()

    async def run(self, *, restart: bool = True) -> None:
        backoff = 2.0
        while True:
            started = time.monotonic()
            code = await self._run_once()
            log.info("Aufnahme %s beendet (code %s)", self.login, code)
            if not restart:
                return
            if time.monotonic() - started > 60:
                backoff = 2.0
            await asyncio.sleep(backoff)
            backoff = min(backoff * 2, 60)

    def cut(self, start_ts: float, end_ts: float, out: Path) -> RawClip:
        self.buffer.poll()
        return self.buffer.cut(start_ts, end_ts, out)
