"""Twitch Helix: wer ist live, und spielt er eines der gewünschten Spiele?

Nutzt das App-Token (Client-Credentials), also nur Client-ID und Secret.
"""

from __future__ import annotations

import asyncio
import json
import logging
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from typing import Any

log = logging.getLogger(__name__)

TOKEN_URL = "https://id.twitch.tv/oauth2/token"
STREAMS_URL = "https://api.twitch.tv/helix/streams"


@dataclass(frozen=True)
class LiveStream:
    login: str
    title: str
    game: str
    viewers: int
    language: str
    started_at: str


def parse_streams(payload: dict[str, Any]) -> list[LiveStream]:
    return [
        LiveStream(
            login=d["user_login"].lower(),
            title=d.get("title", ""),
            game=d.get("game_name", ""),
            viewers=int(d.get("viewer_count", 0)),
            language=d.get("language", ""),
            started_at=d.get("started_at", ""),
        )
        for d in payload.get("data", [])
        if d.get("type") == "live"
    ]


def wanted(streams: list[LiveStream], games: list[str]) -> dict[str, LiveStream]:
    """Nur Streams im gewünschten Spiel (leere Liste = alle)."""
    allowed = {g.casefold() for g in games}
    return {s.login: s for s in streams if not allowed or s.game.casefold() in allowed}


class TwitchAPI:
    def __init__(self, client_id: str, client_secret: str):
        if not client_id or not client_secret:
            raise ValueError("TWITCH_CLIENT_ID und TWITCH_CLIENT_SECRET in .env eintragen")
        self.client_id = client_id
        self.client_secret = client_secret
        self._token = ""
        self._token_expires = 0.0

    def _request(self, req: urllib.request.Request) -> dict[str, Any]:
        with urllib.request.urlopen(req, timeout=15) as r:
            return json.loads(r.read())

    def _refresh_token(self) -> None:
        body = urllib.parse.urlencode({
            "client_id": self.client_id,
            "client_secret": self.client_secret,
            "grant_type": "client_credentials",
        }).encode()
        data = self._request(urllib.request.Request(TOKEN_URL, data=body, method="POST"))
        self._token = data["access_token"]
        self._token_expires = time.time() + int(data.get("expires_in", 3600)) - 300

    def _streams_sync(self, logins: list[str]) -> list[LiveStream]:
        out: list[LiveStream] = []
        for i in range(0, len(logins), 100):  # Helix: max. 100 pro Anfrage
            query = urllib.parse.urlencode([("user_login", l) for l in logins[i : i + 100]])
            for attempt in (1, 2):
                if time.time() >= self._token_expires:
                    self._refresh_token()
                req = urllib.request.Request(
                    f"{STREAMS_URL}?{query}",
                    headers={"Client-Id": self.client_id, "Authorization": f"Bearer {self._token}"},
                )
                try:
                    out += parse_streams(self._request(req))
                    break
                except urllib.error.HTTPError as e:
                    if e.code == 401 and attempt == 1:  # Token abgelaufen
                        self._token_expires = 0
                        continue
                    raise
        return out

    async def live_streams(self, logins: list[str]) -> list[LiveStream]:
        return await asyncio.to_thread(self._streams_sync, logins)
