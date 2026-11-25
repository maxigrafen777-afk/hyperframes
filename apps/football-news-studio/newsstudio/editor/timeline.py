"""Schnittliste: Szenen (mit Voice-Timing) → einzelne Schnitte mit Medien, Bewegung, Übergang, Overlays.

Regeln: keine Standbilder länger als ``max_still_seconds``; Wechsel Foto/Video; jede Datei/jeder Shot
möglichst nur einmal; ohne passendes lizenziertes Material → eigene Titelgrafik + Warnung.
"""

from __future__ import annotations

import math

from ..config import Settings
from ..scenes import matcher

XFADE = {"whip": "slideleft", "flash": "fadewhite", "zoom": "zoomin", "fade": "fade"}
TRANS_DUR = 0.22


def plan(script: dict, voice: dict, settings: Settings | None = None, overrides: dict | None = None) -> dict:
    s = settings or Settings.load()
    overrides = overrides or {}
    times = {t["id"]: t for t in voice["scene_times"]}
    scenes = script["scenes"]
    total = voice["duration"]
    media = matcher._usable_media(s)
    used_media: set = set()
    used_shots: set = set()
    media_count: dict = {}
    shot_count: dict = {}
    cuts, warnings = [], []
    for i, sc in enumerate(scenes):
        start = 0.0 if i == 0 else times[sc["id"]]["start"] - 0.08
        end = (times[scenes[i + 1]["id"]]["start"] - 0.08) if i + 1 < len(scenes) else total
        dur = end - start
        res = matcher.candidates(sc["text"], s, used_media, used_shots, media=media)
        for w in res["warnings"]:
            if i == len(scenes) - 1 and "Keine Person" in w:
                continue  # Abspann ist bewusst eine Grafik
            warnings.append({"scene": sc["id"], "message": w})
        n = max(1, math.ceil(dur / s.max_still_seconds))
        lens = [dur / n] * n
        prefer_video = sc.get("media_kind") == "video"
        t = start
        last_kind = cuts[-1]["kind"] if cuts else None
        for k, ln in enumerate(lens):
            key = f"{sc['id']}#{k}"
            opt = None
            if key in overrides:
                ov = overrides[key]
                opt = next((o for o in res["options"] if o["media_id"] == ov.get("media_id")
                            and (o["shot"] or {}).get("id") == ov.get("shot_id")), None)
            if opt is None and res["options"]:
                ranked = sorted(res["options"], key=lambda o: -(
                    o["score"]
                    - 70 * shot_count.get((o["shot"] or {}).get("id"), 0)
                    - (45 if o["kind"] == "foto" else 20) * media_count.get(o["media_id"], 0)
                    + (8 if prefer_video and o["kind"] == "video" else 0)
                    + (6 if last_kind and o["kind"] != last_kind else 0)
                    - (25 if o["kind"] == "video" and o["shot"] and (o["shot"]["end"] - o["shot"]["start"]) < ln * 0.6 else 0)))
                opt = ranked[0]
            cut = {"scene": sc["id"], "index": k, "start": round(t, 3), "duration": round(ln, 3),
                   "motion": sc.get("motion") if k == 0 else ["zoom_in", "pan_right", "zoom_out", "pan_left"][(i + k) % 4],
                   "transition_in": (sc.get("transition") if k == 0 and i > 0 else "cut"),
                   "graphic": sc.get("graphic") or {"type": "none"}, "sources": sc.get("sources", [])}
            if opt:
                cut.update(kind=opt["kind"], media_id=opt["media_id"], path=opt["path"], credit=opt["credit"],
                           focus_x=opt["focus_x"], focus_y=opt["focus_y"], score=opt["score"], why=opt["why"],
                           filename=opt["filename"])
                if opt["kind"] == "video":
                    sh = opt["shot"] or {"id": None, "start": 0, "end": opt.get("duration") or ln}
                    shot_len = sh["end"] - sh["start"]
                    offset = max(0.0, min(shot_len - ln, shot_len * 0.15)) if shot_len > ln else 0.0
                    cut.update(shot_id=sh["id"], src_in=round(sh["start"] + offset, 3),
                               src_len=round(min(shot_len, ln), 3))
                    used_shots.add(sh["id"])
                    shot_count[sh["id"]] = shot_count.get(sh["id"], 0) + 1
                used_media.add(opt["media_id"])
                media_count[opt["media_id"]] = media_count.get(opt["media_id"], 0) + 1
            else:
                cut.update(kind="grafik", credit="", filename="", why=["kein lizenziertes Material"])
            cuts.append(cut)
            last_kind = cut["kind"]
            t += ln
    stills = [c for c in cuts if c["kind"] != "video"]
    video_share = 1 - sum(c["duration"] for c in stills) / max(0.01, total)
    return {"cuts": cuts, "warnings": warnings, "duration": total, "video_share": round(video_share, 2),
            "used_media": sorted(used_media)}
