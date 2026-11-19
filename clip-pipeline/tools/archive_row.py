"""Archiv-Zeile (JSON) für einen gelieferten Clip bauen.

  python3 tools/archive_row.py <clip-id> <asset-id>  ->  data/archive/rows/<id>.json

Die Zeile wird danach mit ArtifactData ins Clip-Archiv geschrieben (collection "clips", doc_id "c<id>").
"""
import json, subprocess, sys
from datetime import datetime, timezone
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from pipeline.db import DB

cid, asset = int(sys.argv[1]), sys.argv[2]
root = Path(__file__).resolve().parent.parent
db = DB(root / "data/pipeline.sqlite3")
c = db.get(cid)
post = (root / f"data/clips/{cid}/post.txt").read_text("utf-8")
title, _, rest = post.partition("\n")
src = root / f"data/archive/{cid}.mp4"
dur = float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(src)],
                           capture_output=True, text=True).stdout or 0)
row = {"nr": cid, "title": title.strip(), "streamer": c.streamer.split(":", 1)[1], "post": rest.strip(),
       "hook": c.judgment.hook if c.judgment else "", "asset": asset, "url": f"/_blob/{asset}",
       "seconds": round(dur, 1), "posted": c.status.value == "POSTED",
       "deliveredAt": datetime.fromtimestamp(src.stat().st_mtime, timezone.utc).isoformat()}
out = root / f"data/archive/rows/{cid}.json"
out.parent.mkdir(parents=True, exist_ok=True)
out.write_text(json.dumps(row, ensure_ascii=False, indent=1), "utf-8")
idx = root / "data/archive/index.json"
m = json.loads(idx.read_text()) if idx.exists() else {}
m[str(cid)] = asset
idx.write_text(json.dumps(m, indent=1))
print(out)
