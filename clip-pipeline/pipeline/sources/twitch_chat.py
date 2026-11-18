"""Twitch-Chat lesen: IRC über WebSocket, anonym (kein Token nötig)."""

from __future__ import annotations

import asyncio
import logging
import random
import time
from collections.abc import AsyncIterator, Callable

from ..models import ChatLine

log = logging.getLogger(__name__)

TWITCH_IRC = "wss://irc-ws.chat.twitch.tv:443"


def _unescape_tag(v: str) -> str:
    return v.replace(r"\s", " ").replace(r"\:", ";").replace(r"\\", "\\")


def parse_privmsg(raw: str, now: float) -> tuple[str, ChatLine] | None:
    """Eine IRC-Zeile parsen. Gibt (kanal, ChatLine) für PRIVMSG zurück, sonst None.

    Beispiel:
    @display-name=Foo;tmi-sent-ts=1700000000000 :foo!foo@foo.tmi.twitch.tv PRIVMSG #kanal :hallo
    """
    tags: dict[str, str] = {}
    rest = raw
    if rest.startswith("@"):
        tag_str, _, rest = rest[1:].partition(" ")
        for kv in tag_str.split(";"):
            k, _, v = kv.partition("=")
            tags[k] = _unescape_tag(v)
    if not rest.startswith(":"):
        return None
    prefix, _, rest = rest[1:].partition(" ")
    cmd, _, rest = rest.partition(" ")
    if cmd != "PRIVMSG":
        return None
    channel, _, text = rest.partition(" :")
    user = tags.get("display-name") or prefix.split("!", 1)[0]
    try:
        ts = int(tags["tmi-sent-ts"]) / 1000
    except (KeyError, ValueError):
        ts = now
    return channel.lstrip("#").lower(), ChatLine(ts=ts, user=user, text=text.rstrip("\r\n"))


async def read_chat(
    channels: list[str],
    *,
    url: str = TWITCH_IRC,
    clock: Callable[[], float] = time.time,
) -> AsyncIterator[tuple[str, ChatLine]]:
    """Liefert endlos (kanal, ChatLine). Verbindet bei Abbruch neu (Backoff)."""
    import websockets  # erst hier, damit Tests ohne Netzwerk laufen

    backoff = 1.0
    while True:
        try:
            async with websockets.connect(url, ping_interval=60) as ws:
                await ws.send("CAP REQ :twitch.tv/tags")
                await ws.send("PASS SCHMOOPIIE")
                await ws.send(f"NICK justinfan{random.randint(10000, 99999)}")
                for ch in channels:
                    await ws.send(f"JOIN #{ch.lower()}")
                log.info("Chat verbunden: %s", ", ".join(channels))
                backoff = 1.0
                async for frame in ws:
                    for raw in str(frame).split("\r\n"):
                        if not raw:
                            continue
                        if raw.startswith("PING"):
                            await ws.send("PONG" + raw[4:])
                            continue
                        if " RECONNECT" in raw[:80]:
                            raise ConnectionError("Twitch verlangt Reconnect")
                        msg = parse_privmsg(raw, clock())
                        if msg:
                            yield msg
        except asyncio.CancelledError:
            raise
        except Exception as e:  # Netz weg, Server-Reset, ...
            log.warning("Chat getrennt (%s), neuer Versuch in %.0fs", e, backoff)
            await asyncio.sleep(backoff)
            backoff = min(backoff * 2, 60)
