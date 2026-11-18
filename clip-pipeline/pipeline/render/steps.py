"""Worker-Schritt JUDGED -> RENDERED: Video + fertiger Textblock zum Posten."""

from __future__ import annotations

import logging
import re
from pathlib import Path

from ..config import Config
from ..audio import separate_vocals
from ..db import DB, Clip
from ..judge.media import Transcript
from ..judge.steps import clip_dir, streamer_for
from ..models import Judgment, Status
from .export import RenderJob, render

log = logging.getLogger(__name__)


def credit_for(streamer_key: str) -> str:
    platform, login = streamer_key.split(":", 1)
    return f"{platform}.tv/{login}" if platform == "twitch" else login


def post_text(j: Judgment, streamer_key: str) -> str:
    """Textblock zum Kopieren: Caption, Hashtags, Quelle."""
    tags = []
    for t in j.hashtags:
        t = re.sub(r"[^\wäöüÄÖÜß]", "", t)
        if t and t.lower() not in {x.lower() for x in tags}:
            tags.append(t)
    login = streamer_key.split(":", 1)[1]
    if login.lower() not in {t.lower() for t in tags}:
        tags.append(login)
    lines = [j.caption.strip(), "", " ".join(f"#{t}" for t in tags), "", f"🎥 Quelle: {credit_for(streamer_key)}"]
    return "\n".join(lines).strip() + "\n"


def step_render(db: DB, cfg: Config, clip: Clip) -> Path:
    if not clip.raw_path or not clip.transcript_path or clip.judgment is None:
        raise ValueError("Rohschnitt, Transkript oder Bewertung fehlt")
    j = clip.judgment
    streamer = streamer_for(cfg, clip.streamer)
    transcript = Transcript.model_validate_json(Path(clip.transcript_path).read_text("utf-8"))
    out_dir = clip_dir(cfg, clip.id)
    audio = None
    if cfg.render.remove_music:
        # Ohne Stimmspur wird nie gerendert: Musik darf nicht veröffentlicht werden.
        if transcript.vocals_path and Path(transcript.vocals_path).exists():
            audio = Path(transcript.vocals_path)
        else:
            audio = out_dir / "vocals.wav"
            separate_vocals(Path(clip.raw_path), audio)
    out = render(RenderJob(
        raw=Path(clip.raw_path), out=out_dir / "clip.mp4",
        start_s=j.start_s, end_s=j.end_s, subject_x=j.subject_x, layout=j.layout,
        facecam=streamer.facecam, words=transcript.words, hook=j.hook,
        credit=credit_for(clip.streamer) if cfg.render.show_credit else "",
        censor=tuple(cfg.render.censor), audio=audio, area=streamer.game_area,
    ))
    (out_dir / "post.txt").write_text(
        f"{j.title.strip()}\n\n" + post_text(j, clip.streamer), encoding="utf-8")
    db.advance(clip.id, Status.RENDERED, render_path=str(out))
    log.info("Clip %s gerendert: %s", clip.id, out)
    return out
