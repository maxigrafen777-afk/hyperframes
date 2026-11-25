"""Austauschbare Text-to-Speech-Anbieter (ElevenLabs, Piper lokal) mit Wort-Zeitstempeln."""

from __future__ import annotations

from pathlib import Path

from ..config import Settings, elevenlabs_key
from . import engine

PROVIDERS = {
    "elevenlabs": "ElevenLabs (natürlich, Cloud, Key nötig)",
    "piper": "Piper „Thorsten“ (lokal, kostenlos, männlich)",
}
NEWS_VOICES = {
    # ElevenLabs-Stimmen aus der Standardbibliothek, die Deutsch über das Multilingual-Modell sprechen
    "pNInz6obpgDQGcFmaJgB": "Adam – männlich, tief, Nachrichten",
    "onwK4e9ZLuTAKqWW03F9": "Daniel – männlich, sachlich, Nachrichtensprecher",
    "JBFqnCBsd6RMkjVDRZzb": "George – männlich, warm, Erzähler",
    "TX3LPaxmHKxFdv7VOQHJ": "Liam – männlich, jung, energisch",
}


def active_provider(settings: Settings) -> str:
    return engine.provider_for(settings)


def synthesize(scenes: list[dict], out_dir: Path, settings: Settings | None = None, log=print) -> dict:
    s = settings or Settings.load()
    res = engine.synthesize([{"id": sc["id"], "text": sc["text"]} for sc in scenes], out_dir, s, log=log)
    res["file_abs"] = str(out_dir / "voiceover.wav")
    mp3 = out_dir / "voiceover.mp3"
    import subprocess

    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", res["file_abs"], "-b:a", "192k", str(mp3)], check=True)
    res["mp3_abs"] = str(mp3)
    return res


def available() -> dict:
    return {"elevenlabs": bool(elevenlabs_key()), "piper": True}
