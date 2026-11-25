"""Pfade und Einstellungen. Alles liegt lokal unter ``data/`` bzw. ``media/``."""

from __future__ import annotations

import json
import os
from dataclasses import asdict, dataclass, field
from pathlib import Path

APP_ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = Path(os.environ.get("NS_DATA_DIR", APP_ROOT / "data"))
MEDIA_DIR = Path(os.environ.get("NS_MEDIA_DIR", APP_ROOT / "media"))
MODELS_DIR = Path(os.environ.get("NS_MODELS_DIR", APP_ROOT / "models"))
WEB_DIR = APP_ROOT / "web"
USER_AGENT = "FootballNewsStudio/0.1 (+local editorial research tool)"

PIPER_VOICE_URLS = {
    "de_DE-thorsten-high": "https://huggingface.co/rhasspy/piper-voices/resolve/main/de/de_DE/thorsten/high/",
}


def data_dir() -> Path:
    return DATA_DIR


def paths() -> dict[str, Path]:
    d = DATA_DIR
    return {
        "data": d,
        "db": d / "studio.db",
        "settings": d / "settings.json",
        "cache": d / "cache",
        "proxies": d / "proxies",
        "projects": d / "projects",
        "media": MEDIA_DIR,
    }


def ensure_dirs() -> None:
    for k, p in paths().items():
        if k in ("db", "settings"):
            p.parent.mkdir(parents=True, exist_ok=True)
        else:
            p.mkdir(parents=True, exist_ok=True)
    for sub in ("maxppp", "pressbox", "eigene"):
        (MEDIA_DIR / sub).mkdir(parents=True, exist_ok=True)


@dataclass
class Settings:
    # Ausgabe
    platform: str = "tiktok"
    fps: int = 30
    width: int = 1080
    height: int = 1920
    target_min_seconds: int = 60
    target_max_seconds: int = 120
    brand_name: str = "FUSSBALL NEWS"
    brand_color: str = "#E10600"
    accent_color: str = "#FFD400"
    # Schnitt
    max_still_seconds: float = 3.2
    min_cut_seconds: float = 1.6
    video_share_target: float = 0.5
    # Recherche
    news_lookback_hours: int = 48
    # Skript
    script_engine: str = "auto"  # auto | claude | briefing
    claude_model: str = "claude-opus-5-5"
    # Stimme
    tts_provider: str = "auto"  # auto | elevenlabs | piper
    elevenlabs_voice_id: str = "pNInz6obpgDQGcFmaJgB"
    elevenlabs_model: str = "eleven_multilingual_v2"
    elevenlabs_speed: float = 1.05
    piper_voice: str = "de_DE-thorsten-high"
    piper_length_scale: float = 0.92
    # Ton
    music_volume_db: float = -20.0
    music_source: str = "generated"
    # Lizenz
    license_warn_days: int = 30
    # interne Kompatibilität mit übernommenen Modulen
    target_seconds: tuple = field(default=(60, 120))

    @classmethod
    def load(cls) -> "Settings":
        s = cls()
        f = paths()["settings"]
        if f.exists():
            for k, v in json.loads(f.read_text("utf-8")).items():
                if hasattr(s, k):
                    setattr(s, k, v)
        return s

    def save(self) -> None:
        ensure_dirs()
        d = asdict(self)
        d.pop("target_seconds", None)
        paths()["settings"].write_text(json.dumps(d, indent=2, ensure_ascii=False), "utf-8")

    def update(self, values: dict) -> "Settings":
        base = Settings()
        for k, v in values.items():
            if not hasattr(base, k) or k == "target_seconds":
                continue
            cur = getattr(base, k)
            if isinstance(cur, bool):
                v = bool(v)
            elif isinstance(cur, int):
                v = int(v)
            elif isinstance(cur, float):
                v = float(v)
            setattr(self, k, v)
        self.save()
        return self


def anthropic_available() -> bool:
    return bool(os.environ.get("ANTHROPIC_API_KEY") or os.environ.get("ANTHROPIC_AUTH_TOKEN"))


def elevenlabs_key() -> str | None:
    return os.environ.get("ELEVENLABS_API_KEY") or None
