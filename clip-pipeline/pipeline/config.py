"""Einstellungen aus config.toml laden, Schlüssel aus .env / Umgebung."""

from __future__ import annotations

import os
import tomllib
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, Field, model_validator


class Rect(BaseModel):
    x: int = Field(ge=0)
    y: int = Field(ge=0)
    w: int = Field(gt=0)
    h: int = Field(gt=0)


class Streamer(BaseModel):
    platform: Literal["twitch"] = "twitch"
    login: str
    language: str = "de"
    chat_delay_s: float = Field(default=4.0, ge=0)
    facecam: Rect | None = None
    facecam_frameless: bool = False  # Greenscreen-Cam ohne Rahmen: Position aus Config übernehmen
    # Sichtbarer Gameplay-Bereich (y von/bis) bei festen schwarzen Balken; leer = automatisch erkennen
    game_area: tuple[int, int] | None = None

    @property
    def key(self) -> str:
        return f"{self.platform}:{self.login.lower()}"


class RecorderCfg(BaseModel):
    segment_s: int = Field(default=2, ge=1)
    buffer_s: int = Field(default=180, ge=30)
    quality: str = "1080p60,1080p,best"
    max_parallel: int = Field(default=6, ge=1)  # gleichzeitige Aufnahmen; Reihenfolge der Streamer = Priorität


class DetectCfg(BaseModel):
    burst_s: int = Field(default=10, ge=1)
    baseline_s: int = Field(default=300, ge=30)
    min_baseline_s: int = Field(default=120, ge=10)
    z_threshold: float = 4.0
    min_unique_users: int = 6
    min_unique_ratio: float = Field(default=0.5, ge=0, le=1)
    clip_calls_trigger: int = 3
    cooldown_s: float = 60
    min_pre_score: float = Field(default=0.35, ge=0, le=1)
    hype_words: list[str] = Field(default_factory=list)
    # Nachrichten von diesen Nutzern zählen gar nicht (Bots).
    ignore_users: list[str] = Field(default_factory=lambda: [
        "nightbot", "streamelements", "moobot", "fossabot", "streamlabs", "wizebot", "sery_bot",
    ])
    # Regex: passende Nachrichten zählen gar nicht (Vorlagen, Befehle außer !clip).
    ignore_patterns: list[str] = Field(default_factory=lambda: [r"Partner-Jubiläum", r"^!(?!clip\b)"])
    # Antwortwelle: Streamer fragt, Chat antwortet "ja/nein/1/2". Kein Highlight.
    answer_words: list[str] = Field(default_factory=lambda: [
        "ja", "jo", "joa", "jap", "jup", "nein", "ne", "nö", "nope", "doch", "yes", "yep", "no",
        "klar", "safe", "lets", "go", "logo", "auf", "jeden", "mach", "machen", "gut", "gute", "quatsch",
        "max", "mio", "k", "prozent",
        "moin", "moinsen", "hi", "hey", "hallo", "servus", "guten", "morgen", "abend", "yt", "youtube", "bye", "tschüss", "nacht",  # Begrüßungs-/Abschiedswellen
        "rot", "schwarz", "schwarze", "blau", "gelb", "grün", "weiß", "silber", "black",  # Farbwahl-Abfragen
        "o7", "f",  # Salut-/F-Wellen auf Aufforderung des Streamers
    ])
    max_answer_ratio: float = Field(default=0.35, ge=0, le=1)
    # Chor: Chat wiederholt dieselbe kurze Anweisung („Anzeige“, „Waffe im Haus“) ohne zu lachen.
    max_chorus_ratio: float = Field(default=0.22, ge=0, le=1)
    chorus_max_hype: float = Field(default=0.2, ge=0, le=1)

    @model_validator(mode="after")
    def _windows(self) -> DetectCfg:
        if self.baseline_s < self.burst_s * 3:
            raise ValueError("baseline_s muss mindestens 3x burst_s sein")
        if self.min_baseline_s > self.baseline_s:
            raise ValueError("min_baseline_s darf nicht größer als baseline_s sein")
        return self


class ClipCfg(BaseModel):
    pre_roll_s: float = 45   # Rohschnitt großzügig, damit 20-60-s-Clips möglich sind
    post_roll_s: float = 15
    max_len_s: float = 80    # Länge des Rohschnitts (nicht des fertigen Clips)


class JudgeCfg(BaseModel):
    min_hype: int = Field(default=7, ge=1, le=10)
    min_len_s: float = 20    # fertiger Clip
    max_len_s: float = 60
    model: str = "claude-opus-5-5"
    effort: Literal["low", "medium", "high", "xhigh", "max"] = "medium"
    frames: int = Field(default=6, ge=1, le=20)   # Standbilder pro Kandidat
    frame_width: int = Field(default=768, ge=256)  # kleiner = günstiger


class WhisperCfg(BaseModel):
    model: str = "small"          # tiny/base/small/medium; ohne GPU: small
    compute_type: str = "int8"    # schnell auf der CPU
    threads: int = 0              # 0 = alle Kerne
    # Begriffe, die Whisper sonst verhört (Spielnamen, Orte, Marken, Insider).
    vocabulary: list[str] = Field(default_factory=list)
    # Feste Korrekturen für Wörter, die Whisper trotzdem verhört (ganzes Wort, Groß/klein egal).
    corrections: dict[str, str] = Field(default_factory=dict)


class RenderCfg(BaseModel):
    # Musik darf nie veröffentlicht werden: nur die per Demucs getrennte Stimmspur verwenden.
    remove_music: bool = True
    show_credit: bool = False   # Twitch-Name im Video (Quelle steht immer im Post-Text)
    auto_facecam: bool = True   # Cam-Position pro Clip suchen (Streamer verschieben sie)
    facecam_min_score: float = 6.0
    # In den Untertiteln maskiert (der Ton bleibt). TikTok drosselt Schimpfwörter im Bild.
    censor: list[str] = Field(default_factory=lambda: [
        "scheiße", "scheisse", "schwanz", "fick", "ficken", "fotze", "hurensohn", "wichser", "arschloch", "fuck", "shit",
    ])


class Config(BaseModel):
    data_dir: Path = Path("data")
    games: list[str] = Field(default_factory=list)
    recorder: RecorderCfg = RecorderCfg()
    detect: DetectCfg = DetectCfg()
    clip: ClipCfg = ClipCfg()
    judge: JudgeCfg = JudgeCfg()
    whisper: WhisperCfg = WhisperCfg()
    render: RenderCfg = RenderCfg()
    streamers: list[Streamer] = Field(default_factory=list)

    @model_validator(mode="after")
    def _buffer_long_enough(self) -> Config:
        # Der Puffer muss alles fassen, was nach dem Auslösen noch gebraucht wird.
        max_delay = max((s.chat_delay_s for s in self.streamers), default=0)
        need = self.clip.pre_roll_s + self.clip.post_roll_s + max_delay + self.detect.burst_s
        if self.recorder.buffer_s < need * 1.5:
            raise ValueError(f"recorder.buffer_s zu klein: mindestens {need * 1.5:.0f}s nötig")
        return self

    @property
    def db_path(self) -> Path:
        return self.data_dir / "pipeline.sqlite3"


class Secrets(BaseModel):
    twitch_client_id: str = ""
    twitch_client_secret: str = ""
    telegram_bot_token: str = ""
    telegram_chat_id: str = ""

    def __repr__(self) -> str:  # nie Schlüssel in Logs
        return "Secrets(***)"

    __str__ = __repr__


def load_dotenv(path: Path) -> None:
    """Minimaler .env-Leser. Bereits gesetzte Umgebungsvariablen gewinnen."""
    if not path.exists():
        return
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        name, _, value = line.partition("=")
        os.environ.setdefault(name.strip(), value.strip().strip('"').strip("'"))


def load_config(path: Path | str = "config.toml") -> Config:
    with open(path, "rb") as f:
        return Config.model_validate(tomllib.load(f))


def load_secrets(env_file: Path | str = ".env") -> Secrets:
    load_dotenv(Path(env_file))
    return Secrets(
        twitch_client_id=os.environ.get("TWITCH_CLIENT_ID", ""),
        twitch_client_secret=os.environ.get("TWITCH_CLIENT_SECRET", ""),
        telegram_bot_token=os.environ.get("TELEGRAM_BOT_TOKEN", ""),
        telegram_chat_id=os.environ.get("TELEGRAM_CHAT_ID", ""),
    )
