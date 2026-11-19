"""Manuellen Kandidaten aus dem laufenden Puffer anlegen (Nutzer-Tipp: „das eben bei X war gut“).

  python3 tools/cut_now.py <login> <sekunden_zurück> [länge]

Schneidet [jetzt - zurück, jetzt - zurück + länge] aus data/buffer/<login>/ und legt den
Rohschnitt als Kandidat (NEW) an; der Dienst transkribiert ihn wie jeden anderen.
"""
import sys, time
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from pipeline.config import load_config
from pipeline.db import DB
from pipeline.models import Candidate, Signals
from pipeline.sources.recorder import SegmentBuffer

login, back = sys.argv[1], float(sys.argv[2])
length = float(sys.argv[3]) if len(sys.argv) > 3 else 70
cfg = load_config("config.toml")
buf = SegmentBuffer(cfg.data_dir / "buffer" / login, buffer_s=cfg.recorder.buffer_s)
buf.poll()
start = time.time() - back
end = min(start + length, time.time() - 4)
out = cfg.data_dir / "raw" / f"{login}_manual_{int(start)}.mp4"
clip = buf.cut(start, end, out)
sig = Signals(burst=0, median=0, mad=0, z=0, unique_users=0, unique_ratio=0, hype_ratio=1.0, clip_calls=9, reason="clip_calls")
cand = Candidate(streamer=f"twitch:{login}", trigger_ts=end, moment_ts=start + length / 2, start_ts=start, end_ts=end,
                 pre_score=1.0, signals=sig, chat=[])
cid = DB(cfg.db_path).add_candidate(cand, raw_path=str(clip.path), raw_start_ts=clip.start_ts)
print("Kandidat", cid, clip.path)
