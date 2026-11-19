"""Datenmodelle: Status, Kandidat, KI-Bewertung."""

from __future__ import annotations

from enum import StrEnum
from typing import Literal

from pydantic import BaseModel, Field, model_validator


class Status(StrEnum):
    NEW = "NEW"                  # Rohschnitt liegt vor
    TRANSCRIBED = "TRANSCRIBED"  # Whisper fertig (Wort-Zeitstempel)
    JUDGED = "JUDGED"            # KI sagt: behalten
    RENDERED = "RENDERED"        # 9:16 mit Untertiteln fertig
    DELIVERED = "DELIVERED"      # aufs Handy geschickt
    POSTED = "POSTED"            # du hast "gepostet" gedrückt
    REJECTED = "REJECTED"
    FAILED = "FAILED"


# Erlaubte Übergänge. Alles andere ist ein Programmierfehler.
TRANSITIONS: dict[Status, set[Status]] = {
    Status.NEW: {Status.TRANSCRIBED, Status.REJECTED, Status.FAILED},
    Status.TRANSCRIBED: {Status.JUDGED, Status.REJECTED, Status.FAILED},
    Status.JUDGED: {Status.RENDERED, Status.REJECTED, Status.FAILED},
    Status.RENDERED: {Status.DELIVERED, Status.FAILED, Status.JUDGED, Status.REJECTED},  # JUDGED = vor Versand neu rendern
    Status.DELIVERED: {Status.POSTED, Status.REJECTED, Status.JUDGED},  # JUDGED = neu rendern
    Status.POSTED: set(),
    Status.REJECTED: {Status.JUDGED},  # Neubewertung (Nutzer: zu streng)
    Status.FAILED: {Status.NEW},  # manuell neu anstoßen
}

TERMINAL = {Status.POSTED, Status.REJECTED, Status.FAILED}


class ChatLine(BaseModel):
    ts: float
    user: str
    text: str


class Signals(BaseModel):
    """Was der Chat-Detektor im Moment des Auslösens gemessen hat."""

    burst: int
    median: float
    mad: float
    z: float
    unique_users: int
    unique_ratio: float
    hype_ratio: float
    clip_calls: int
    reason: Literal["z", "clip_calls"]


class Candidate(BaseModel):
    streamer: str                 # "twitch:login"
    trigger_ts: float             # Wanduhrzeit (Unix) des Chat-Ausschlags
    moment_ts: float              # geschätzter Moment im Bild (trigger - chat_delay)
    start_ts: float
    end_ts: float
    pre_score: float = Field(ge=0, le=1)
    signals: Signals
    chat: list[ChatLine] = Field(default_factory=list)
    live: bool = True

    @model_validator(mode="after")
    def _order(self) -> Candidate:
        if not self.start_ts < self.end_ts:
            raise ValueError("start_ts muss vor end_ts liegen")
        return self


class Flags(BaseModel):
    cutscene: bool = False
    story_spoiler: bool = False
    needs_context: bool = False


class Judgment(BaseModel):
    """Festes JSON-Format der KI-Antwort. Zeiten relativ zum Rohschnitt."""

    keep: bool
    hype: int = Field(ge=1, le=10)
    category: str = ""
    summary: str = ""
    # Ohne harte Grenzen: clamp() bringt die Zeiten auf die Cliplänge.
    start_s: float
    end_s: float
    peak_s: float
    subject_x: float = Field(default=0.5, ge=0, le=1)
    layout: Literal["split", "blur"] = "split"
    hook: str = ""
    title: str = ""
    caption: str = ""
    hashtags: list[str] = Field(default_factory=list)
    flags: Flags = Flags()

    @model_validator(mode="after")
    def _times(self) -> Judgment:
        # Reparieren statt ablehnen: eine verworfene KI-Antwort kostet Geld.
        if self.end_s < self.start_s:
            self.start_s, self.end_s = self.end_s, self.start_s
        self.peak_s = min(max(self.peak_s, self.start_s), self.end_s)
        return self

    def final_keep(self, min_hype: int) -> bool:
        """KI-Entscheidung plus harte Regeln, auf die wir uns nicht verlassen."""
        return (
            self.keep
            and self.hype >= min_hype
            and not self.flags.cutscene
            and not self.flags.story_spoiler
        )
