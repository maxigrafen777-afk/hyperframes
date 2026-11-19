"""Stimmspur + Transkript eines Clips neu erzeugen (nach dem Sync-Fix vom 19.11.) und neu rendern.

  python3 tools/redo_audio.py <clip-id> <judgment.json>
"""
import subprocess, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from pipeline.audio import separate_vocals
from pipeline.config import load_config
from pipeline.db import DB
from pipeline.judge.media import transcribe
from pipeline.judge.steps import clip_dir, streamer_for

cid, judgment = int(sys.argv[1]), sys.argv[2]
cfg = load_config("config.toml"); db = DB(cfg.db_path); c = db.get(cid)
vocals = clip_dir(cfg, cid) / "vocals.wav"
music = separate_vocals(Path(c.raw_path), vocals)
tr = transcribe(vocals, streamer_for(cfg, c.streamer).language, cfg.whisper)
tr = tr.model_copy(update={"music_seconds": music, "vocals_path": str(vocals)})
Path(c.transcript_path).write_text(tr.model_dump_json(), encoding="utf-8")
subprocess.run([sys.executable, "tools/review.py", "rerender", str(cid), judgment], check=True)
subprocess.run([sys.executable, "tools/review.py", "delivered", str(cid)], check=False)
