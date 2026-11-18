"""Worker-Schritte: NEW -> TRANSCRIBED -> JUDGED (oder REJECTED)."""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

from ..config import Config, Streamer
from ..db import DB, Clip
from ..models import Status
from .judge import build_user_content, judge
from ..audio import separate_vocals
from .media import Transcript, extract_frames, probe_duration, transcribe

log = logging.getLogger(__name__)


def clip_dir(cfg: Config, clip_id: int) -> Path:
    return cfg.data_dir / "clips" / str(clip_id)


def streamer_for(cfg: Config, key: str) -> Streamer:
    for s in cfg.streamers:
        if s.key == key:
            return s
    raise KeyError(f"Streamer {key} nicht in der Config")


def step_transcribe(db: DB, cfg: Config, clip: Clip) -> None:
    if not clip.raw_path:
        raise ValueError("Clip hat keinen Rohschnitt")
    streamer = streamer_for(cfg, clip.streamer)
    source = Path(clip.raw_path)
    music: list[int] = []
    vocals: Path | None = None
    if cfg.render.remove_music:
        # Erst Musik entfernen, dann transkribieren: sauberere Sprache, gleiche Spur fürs Rendering.
        vocals = clip_dir(cfg, clip.id) / "vocals.wav"
        music = separate_vocals(source, vocals)
        source = vocals
    tr = transcribe(source, streamer.language, cfg.whisper)
    tr = tr.model_copy(update={"music_seconds": music, "vocals_path": str(vocals) if vocals else None})
    out = clip_dir(cfg, clip.id) / "transcript.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(tr.model_dump_json(), encoding="utf-8")
    db.advance(clip.id, Status.TRANSCRIBED, transcript_path=str(out))
    log.info("Clip %s: %d Wörter transkribiert", clip.id, len(tr.words))


def step_judge(db: DB, cfg: Config, client: Any, clip: Clip) -> Status:
    if not clip.raw_path or not clip.transcript_path:
        raise ValueError("Rohschnitt oder Transkript fehlt")
    streamer = streamer_for(cfg, clip.streamer)
    raw = Path(clip.raw_path)
    duration = probe_duration(raw)
    transcript = Transcript.model_validate_json(Path(clip.transcript_path).read_text("utf-8"))
    frames = extract_frames(raw, clip_dir(cfg, clip.id) / "frames", cfg.judge.frames, cfg.judge.frame_width)
    content = build_user_content(
        frames=frames,
        transcript=transcript,
        chat=clip.candidate.chat,
        raw_start_ts=clip.raw_start_ts if clip.raw_start_ts is not None else clip.start_ts,
        duration=duration,
        streamer=streamer,
        trigger_ts=clip.candidate.trigger_ts,
    )
    j = judge(client, cfg.judge, streamer=streamer, content=content, duration=duration)
    if j.final_keep(cfg.judge.min_hype):
        db.advance(clip.id, Status.JUDGED, judgment=j)
        log.info("Clip %s behalten: hype %d – %s", clip.id, j.hype, j.summary)
        return Status.JUDGED
    reason = "spoiler" if j.flags.story_spoiler else "cutscene" if j.flags.cutscene else f"hype {j.hype}"
    db.advance(clip.id, Status.REJECTED, judgment=j, error=reason)
    log.info("Clip %s verworfen (%s)", clip.id, reason)
    return Status.REJECTED
