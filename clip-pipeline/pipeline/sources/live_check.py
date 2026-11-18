"""Live-Check ohne API-Schlüssel: streamlink liefert Kategorie und Titel mit."""

from __future__ import annotations

import asyncio
import json
from dataclasses import dataclass


@dataclass(frozen=True)
class LiveInfo:
    login: str
    category: str
    title: str


def parse_streamlink_json(login: str, raw: str) -> LiveInfo | None:
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return None
    # Mit Qualitätsangabe ("best") liefert streamlink den Stream selbst (url),
    # ohne Angabe eine Liste (streams). Beides heißt: live.
    if data.get("error") or not (data.get("url") or data.get("streams")):
        return None
    meta = data.get("metadata") or {}
    return LiveInfo(login=login, category=meta.get("category") or "", title=meta.get("title") or "")


async def check_live(login: str, timeout: float = 45) -> LiveInfo | None:
    proc = await asyncio.create_subprocess_exec(
        "streamlink", "--json", f"https://twitch.tv/{login}", "best",
        stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.DEVNULL,
    )
    try:
        out, _ = await asyncio.wait_for(proc.communicate(), timeout)
    except asyncio.TimeoutError:
        proc.kill()
        return None
    return parse_streamlink_json(login, out.decode("utf-8", "replace"))


def is_wanted(info: LiveInfo | None, games: list[str]) -> bool:
    if info is None:
        return False
    return not games or info.category.casefold() in {g.casefold() for g in games}
