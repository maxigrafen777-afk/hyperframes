"""Pfade und Einstellungen. Alles wird lokal unter ``data/`` gespeichert."""

from __future__ import annotations

import json
import os
from dataclasses import asdict, dataclass, field
from pathlib import Path

APP_ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = Path(os.environ.get("FSS_DATA_DIR", APP_ROOT / "data"))
PROJECTS_DIR = DATA_DIR / "projects"
CACHE_DIR = DATA_DIR / "cache"
MUSIC_LIBRARY_DIR = DATA_DIR / "music-library"
MODELS_DIR = Path(os.environ.get("FSS_MODELS_DIR", APP_ROOT / "models"))
WEB_DIR = APP_ROOT / "web"
SETTINGS_FILE = DATA_DIR / "settings.json"
DB_FILE = DATA_DIR / "studio.db"

# HyperFrames-CLI-Version, mit der gerendert wird (fest gepinnt für reproduzierbare Renders).
HYPERFRAMES_VERSION = os.environ.get("FSS_HYPERFRAMES_VERSION", "0.9.94")

USER_AGENT = "FootballStoryStudio/0.1 (local research tool; https://github.com/heygen-com/hyperframes)"

PIPER_VOICE_URLS = {
    "de_DE-thorsten-high": "https://huggingface.co/rhasspy/piper-voices/resolve/main/de/de_DE/thorsten/high/",
}


@dataclass
class Settings:
    # Themenfinder
    daily_topic_count: int = 10
    topic_cooldown_days: int = 60
    # Automatisierung
    automation_enabled: bool = True
    daily_run_time: str = "07:00"  # lokale Uhrzeit HH:MM
    auto_prepare_count: int = 2  # so viele Ideen werden täglich automatisch recherchiert + geskriptet
    render_preview_after_approval: bool = True
    # Skript
    script_engine: str = "auto"  # auto | claude | regelbasiert
    claude_model: str = "claude-opus-5-5"
    target_min_seconds: int = 60
    target_max_seconds: int = 120
    # Stimme
    tts_provider: str = "auto"  # auto | elevenlabs | piper
    elevenlabs_voice_id: str = "pNInz6obpgDQGcFmaJgB"
    elevenlabs_model: str = "eleven_multilingual_v2"
    elevenlabs_speed: float = 1.0
    piper_voice: str = "de_DE-thorsten-high"
    piper_length_scale: float = 0.95
    # Musik
    music_source: str = "generated"  # generated | library
    music_volume_db: float = -17.0
    # Bilder
    use_commons_photos: bool = True
    allowed_photo_licenses: list[str] = field(
        default_factory=lambda: ["cc0", "pd", "cc-by-2.0", "cc-by-2.5", "cc-by-3.0", "cc-by-4.0"]
    )
    # Video
    fps: int = 30
    accent_color: str = "#c6ff3d"

    @classmethod
    def load(cls) -> "Settings":
        s = cls()
        if SETTINGS_FILE.exists():
            raw = json.loads(SETTINGS_FILE.read_text("utf-8"))
            for k, v in raw.items():
                if hasattr(s, k):
                    setattr(s, k, v)
        return s

    def save(self) -> None:
        ensure_dirs()
        SETTINGS_FILE.write_text(json.dumps(asdict(self), indent=2, ensure_ascii=False), "utf-8")

    def update(self, values: dict) -> "Settings":
        defaults = Settings()
        for k, v in values.items():
            if not hasattr(defaults, k):
                continue
            current = getattr(defaults, k)
            if isinstance(current, bool):
                v = bool(v)
            elif isinstance(current, int) and not isinstance(current, bool):
                v = int(v)
            elif isinstance(current, float):
                v = float(v)
            setattr(self, k, v)
        self.save()
        return self


def ensure_dirs() -> None:
    for d in (DATA_DIR, PROJECTS_DIR, CACHE_DIR, MUSIC_LIBRARY_DIR, MODELS_DIR):
        d.mkdir(parents=True, exist_ok=True)


def anthropic_available() -> bool:
    return bool(os.environ.get("ANTHROPIC_API_KEY") or os.environ.get("ANTHROPIC_AUTH_TOKEN"))


def elevenlabs_key() -> str | None:
    return os.environ.get("ELEVENLABS_API_KEY") or None
