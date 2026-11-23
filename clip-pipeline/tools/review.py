"""Kandidaten von Hand (oder durch Claude im Chat) bewerten und rendern.

  python tools/review.py status                       # Dienst + Datenbank
  python tools/review.py list                         # Kandidaten, die auf Bewertung warten
  python tools/review.py show 7                       # Prompt-Text + Kontaktabzug der Standbilder
  python tools/review.py decide 7 judgment.json       # Bewertung eintragen; bei keep -> rendern
  python tools/review.py delivered 7 | posted 7 | reject 7 [grund]
  python tools/review.py rerender 7 judgment.json     # geliefert, aber neu schneiden

Das JSON hat das Format von pipeline.models.Judgment.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
import time
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from pipeline.config import Config, load_config  # noqa: E402
from pipeline.db import DB  # noqa: E402
from pipeline.judge.judge import build_user_content, clamp  # noqa: E402
from pipeline.judge.media import Transcript, extract_frames, probe_duration  # noqa: E402
from pipeline.judge.steps import clip_dir, streamer_for  # noqa: E402
from pipeline.models import Judgment, Status  # noqa: E402
from pipeline.render.steps import step_render  # noqa: E402


def _when(ts: float) -> str:
    return datetime.fromtimestamp(ts).strftime("%d.%m. %H:%M:%S")


def cmd_status(cfg: Config, db: DB, _a) -> None:
    hb = cfg.data_dir / "heartbeat.json"
    if hb.exists():
        data = json.loads(hb.read_text())
        age = time.time() - data["ts"]
        print(f"Dienst: {'läuft' if age < 120 else f'TOT (letztes Lebenszeichen vor {age / 60:.0f} min)'}")
        for login, c in data["channels"].items():
            print(f"  {login}: live={c['live']} kategorie={c['category']} aufnahme={c['recording']} "
                  f"auslöser={c['triggers']}")
    else:
        print("Dienst: nie gestartet")
    print("Datenbank:", db.counts())


def cmd_list(cfg: Config, db: DB, _a) -> None:
    rows = db.conn.execute(
        "SELECT id FROM clips WHERE status='TRANSCRIBED' ORDER BY pre_score DESC").fetchall()
    for r in rows:
        c = db.get(r["id"])
        s = c.candidate.signals
        print(f"#{c.id} {c.streamer} {_when(c.candidate.trigger_ts)} score={c.pre_score:.2f} "
              f"z={s.z:.1f} hype={s.hype_ratio:.0%} clip-rufe={s.clip_calls} grund={s.reason}")
    if not rows:
        print("keine Kandidaten")


def cmd_show(cfg: Config, db: DB, a) -> None:
    c = db.get(a.id)
    raw = Path(c.raw_path or "")
    tr = Transcript.model_validate_json(Path(c.transcript_path or "").read_text("utf-8"))
    frames = extract_frames(raw, clip_dir(cfg, c.id) / "frames", cfg.judge.frames, cfg.judge.frame_width)
    content = build_user_content(
        frames=frames, transcript=tr, chat=c.candidate.chat,
        raw_start_ts=c.raw_start_ts if c.raw_start_ts is not None else c.start_ts,
        duration=probe_duration(raw), streamer=streamer_for(cfg, c.streamer), trigger_ts=c.candidate.trigger_ts)
    sheet = clip_dir(cfg, c.id) / "sheet.jpg"
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(clip_dir(cfg, c.id) / "frames" / "frame_%02d.jpg"),
                    "-vf", "scale=384:-2,tile=3x2", "-frames:v", "1", str(sheet)], check=True)
    print(f"# Kandidat {c.id} – Kontaktabzug: {sheet}")
    print("# Standbilder bei: " + ", ".join(f"{t:.1f}s" for t, _ in frames))
    # Nutzernamen nie ausgeben: sie sollen weder im Chat noch im Repo landen.
    text = re.sub(r"^(\s+-?[0-9.]+s) [^:]+:", r"\1 <user>:", content[-1]["text"], flags=re.MULTILINE)
    print(re.sub(r"@\w+", "@user", text))


def _apply(cfg: Config, db: DB, cid: int, j: Judgment, *, rerender: bool) -> None:
    c = db.get(cid)
    duration = probe_duration(Path(c.raw_path or ""))
    # CLIP_SHORT=1: kurzer Reichweiten-Clip (15–35 s) statt Creator-Rewards-Länge (23.11.)
    short = os.environ.get("CLIP_SHORT") == "1"
    j = clamp(j, duration, streamer_for(cfg, c.streamer).facecam is not None,
              15 if short else cfg.judge.min_len_s, 35 if short else cfg.judge.max_len_s)
    if rerender:
        db.advance(cid, Status.JUDGED, judgment=j)
    elif not j.final_keep(cfg.judge.min_hype):
        reason = "spoiler" if j.flags.story_spoiler else "cutscene" if j.flags.cutscene else f"hype {j.hype}"
        db.advance(cid, Status.REJECTED, judgment=j, error=reason)
        print(f"#{cid} verworfen ({reason})")
        return
    else:
        db.advance(cid, Status.JUDGED, judgment=j)
    out = step_render(db, cfg, db.get(cid))
    print(f"#{cid} gerendert: {out}")
    print(f"#{cid} text: {out.parent / 'post.txt'}")


def cmd_decide(cfg: Config, db: DB, a) -> None:
    _apply(cfg, db, a.id, Judgment.model_validate_json(Path(a.judgment).read_text("utf-8")), rerender=False)


def cmd_rerender(cfg: Config, db: DB, a) -> None:
    _apply(cfg, db, a.id, Judgment.model_validate_json(Path(a.judgment).read_text("utf-8")), rerender=True)


def _move(to: Status):
    def run(cfg: Config, db: DB, a) -> None:
        db.advance(a.id, to, **({"error": a.reason} if getattr(a, "reason", None) else {}))
        print(f"#{a.id} -> {to}")
    return run


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--config", type=Path, default=Path("config.toml"))
    ap.add_argument("--data-dir", type=Path)
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("status")
    sub.add_parser("list")
    for name in ("show", "delivered", "posted"):
        sub.add_parser(name).add_argument("id", type=int)
    rj = sub.add_parser("reject")
    rj.add_argument("id", type=int)
    rj.add_argument("reason", nargs="?", default="manuell verworfen")
    for name in ("decide", "rerender"):
        p = sub.add_parser(name)
        p.add_argument("id", type=int)
        p.add_argument("judgment")
    a = ap.parse_args()
    cfg = load_config(a.config)
    if a.data_dir:
        cfg = cfg.model_copy(update={"data_dir": a.data_dir})
    db = DB(cfg.db_path)
    {
        "status": cmd_status, "list": cmd_list, "show": cmd_show, "decide": cmd_decide,
        "rerender": cmd_rerender, "delivered": _move(Status.DELIVERED), "posted": _move(Status.POSTED),
        "reject": _move(Status.REJECTED),
    }[a.cmd](cfg, db, a)


if __name__ == "__main__":
    main()
