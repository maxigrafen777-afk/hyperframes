"""Detektor an einem aufgezeichneten Chatlog testen.

Format: JSON Lines, eine Nachricht pro Zeile:
  {"ts": 1700000000.5, "user": "foo", "text": "KEKW"}

  python tools/replay_chatlog.py chat.jsonl --config config.toml
  python tools/replay_chatlog.py --record kanal chat.jsonl   # live mitschreiben
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from pipeline.config import Config, DetectCfg, Streamer, load_config  # noqa: E402
from pipeline.detect.chat_stats import ChatDetector, to_candidate  # noqa: E402
from pipeline.models import ChatLine  # noqa: E402


def replay(path: Path, cfg: Config) -> int:
    det = ChatDetector("replay", cfg.detect)
    streamer = cfg.streamers[0] if cfg.streamers else Streamer(login="replay")
    hits = 0
    with path.open(encoding="utf-8") as f:
        for raw in f:
            if not raw.strip():
                continue
            trig = det.feed(ChatLine.model_validate(json.loads(raw)))
            if trig is None:
                continue
            hits += 1
            cand = to_candidate(trig, streamer, cfg.clip)
            s = trig.signals
            when = datetime.fromtimestamp(trig.ts).strftime("%H:%M:%S")
            print(
                f"[{when}] score={trig.pre_score:.2f} grund={s.reason} z={s.z:.1f} "
                f"burst={s.burst} (median {s.median:.0f}) nutzer={s.unique_users} "
                f"hype={s.hype_ratio:.0%} clip-rufe={s.clip_calls} "
                f"-> schnitt {cand.end_ts - cand.start_ts:.0f}s"
            )
            for line in trig.chat[-5:]:
                print(f"      {line.user}: {line.text}")
    print(f"\n{hits} Auslöser")
    return hits


async def record(channel: str, out: Path) -> None:
    from pipeline.sources.twitch_chat import read_chat

    with out.open("a", encoding="utf-8") as f:
        async for _, line in read_chat([channel]):
            f.write(line.model_dump_json() + "\n")
            f.flush()


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("chatlog", type=Path)
    ap.add_argument("--config", type=Path)
    ap.add_argument("--record", metavar="KANAL", help="Chat live in die Datei schreiben (Strg+C beendet)")
    args = ap.parse_args()
    if args.record:
        try:
            asyncio.run(record(args.record, args.chatlog))
        except KeyboardInterrupt:
            pass
        return
    cfg = load_config(args.config) if args.config else Config(detect=DetectCfg(hype_words=["KEKW", "LUL", "💀", "😂"]))
    replay(args.chatlog, cfg)


if __name__ == "__main__":
    main()
