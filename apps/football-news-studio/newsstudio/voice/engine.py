"""SPRACHGENERIERUNG: deutsches Voice-over mit Wort-Zeitstempeln.

Anbieter
  * ElevenLabs (natürlichste Stimme, liefert Zeichen-Zeitstempel) – benötigt ELEVENLABS_API_KEY
  * Piper „Thorsten“ (lokal, kostenlos, offline) – Wortzeiten werden pro Szene geschätzt
Jede Szene wird einzeln synthetisiert, dadurch sind Szenengrenzen exakt bekannt.
"""

from __future__ import annotations

import base64
import json
import re
import wave
from pathlib import Path

import numpy as np
import requests

from .. import audio
from ..config import MODELS_DIR, PIPER_VOICE_URLS, Settings, elevenlabs_key
from ..speech import spoken_tokens

GAP = 0.32  # Pause zwischen Szenen (s)
LEAD_IN = 0.15


def _tokens(text: str) -> tuple[str, list[dict]]:
    """Sprechtext + Zeichenbereiche je Anzeige-Token."""
    parts, spans, pos = [], [], 0
    for disp, sp in spoken_tokens(text):
        if parts:
            pos += 1
        spans.append({"text": disp, "a": pos, "b": pos + len(sp)})
        parts.append(sp)
        pos += len(sp)
    return " ".join(parts), spans


# ---- ElevenLabs -------------------------------------------------------------


def _eleven(speech: str, prev: str, nxt: str, settings: Settings, speed: float) -> tuple[np.ndarray, dict]:
    key = elevenlabs_key()
    r = requests.post(
        f"https://api.elevenlabs.io/v1/text-to-speech/{settings.elevenlabs_voice_id}/with-timestamps",
        params={"output_format": "mp3_44100_128"},
        headers={"xi-api-key": key or "", "Content-Type": "application/json"},
        json={
            "text": speech,
            "model_id": settings.elevenlabs_model,
            "previous_text": prev or None,
            "next_text": nxt or None,
            "voice_settings": {"stability": 0.45, "similarity_boost": 0.8, "style": 0.35,
                               "use_speaker_boost": True, "speed": speed},
        },
        timeout=120,
    )
    if r.status_code != 200:
        raise RuntimeError(f"ElevenLabs HTTP {r.status_code}: {r.text[:300]}")
    data = r.json()
    tmp = MODELS_DIR / "_tmp_eleven.mp3"
    tmp.write_bytes(base64.b64decode(data["audio_base64"]))
    pcm = audio.decode(tmp)
    tmp.unlink(missing_ok=True)
    return pcm, data.get("alignment") or data.get("normalized_alignment") or {}


def _times_from_alignment(spans: list[dict], align: dict, offset: float) -> list[dict]:
    starts = align.get("character_start_times_seconds", [])
    ends = align.get("character_end_times_seconds", [])
    words = []
    for s in spans:
        a, b = s["a"], max(s["a"], s["b"] - 1)
        if a < len(starts) and b < len(ends):
            st = max(float(starts[a]) + offset, offset + (0.0 if not words else 0.0))
            words.append({"text": s["text"], "start": round(st, 3), "end": round(max(st + 0.05, float(ends[b]) + offset), 3)})
    return words


# ---- Piper ------------------------------------------------------------------

_piper_cache: dict = {}


def ensure_piper_voice(name: str) -> Path:
    model = MODELS_DIR / "piper" / f"{name}.onnx"
    if not model.exists():
        base = PIPER_VOICE_URLS[name]
        model.parent.mkdir(parents=True, exist_ok=True)
        for suffix in (".onnx", ".onnx.json"):
            r = requests.get(base + name + suffix, timeout=600)
            r.raise_for_status()
            (model.parent / (name + suffix)).write_bytes(r.content)
    return model


def _piper(speech: str, settings: Settings, length_scale: float) -> np.ndarray:
    from piper import PiperVoice, SynthesisConfig

    model = ensure_piper_voice(settings.piper_voice)
    if str(model) not in _piper_cache:
        _piper_cache[str(model)] = PiperVoice.load(str(model))
    voice = _piper_cache[str(model)]
    tmp = MODELS_DIR / "_tmp_piper.wav"
    with wave.open(str(tmp), "wb") as w:
        voice.synthesize_wav(speech, w, syn_config=SynthesisConfig(length_scale=length_scale))
    pcm = audio.decode(tmp)
    tmp.unlink(missing_ok=True)
    return pcm


def _estimate_times(spans: list[dict], speech: str, dur: float, offset: float) -> list[dict]:
    weights = []
    for s in spans:
        chunk = speech[s["a"]: s["b"]]
        w = len(re.sub(r"\W", "", chunk)) + 1.5
        if re.search(r"[,;:]$", chunk):
            w += 3
        if re.search(r"[.!?]$", chunk):
            w += 5
        weights.append(w)
    total = sum(weights) or 1
    t = 0.0
    out = []
    for s, w in zip(spans, weights):
        d = dur * w / total
        out.append({"text": s["text"], "start": round(offset + t, 3), "end": round(offset + t + d * 0.85, 3)})
        t += d
    return out


# ---- Hauptfunktion ----------------------------------------------------------


def provider_for(settings: Settings) -> str:
    if settings.tts_provider == "elevenlabs" or (settings.tts_provider == "auto" and elevenlabs_key()):
        return "elevenlabs"
    return "piper"


def synthesize(scenes: list[dict], out_dir: Path, settings: Settings | None = None, log=print,
               speed: float | None = None, _attempt: int = 0) -> dict:
    settings = settings or Settings.load()
    provider = provider_for(settings)
    out_dir.mkdir(parents=True, exist_ok=True)
    speed = speed or (settings.elevenlabs_speed if provider == "elevenlabs" else 1.0)
    chunks: list[np.ndarray] = [np.zeros(int(LEAD_IN * audio.SR), dtype=np.float32)]
    t = LEAD_IN
    words: list[dict] = []
    scene_times: list[dict] = []
    speeches = [_tokens(s["text"]) for s in scenes]
    for i, (sc, (speech, spans)) in enumerate(zip(scenes, speeches)):
        if provider == "elevenlabs":
            try:
                prev = speeches[i - 1][0] if i else ""
                nxt = speeches[i + 1][0] if i + 1 < len(speeches) else ""
                pcm, align = _eleven(speech, prev, nxt, settings, max(0.7, min(1.2, speed)))
                pcm, cut = audio.trim_silence(pcm)
                w = _times_from_alignment(spans, align, t - float(cut))
                for x in w:
                    x["start"] = max(x["start"], round(t, 3))
            except Exception as e:
                if settings.tts_provider == "elevenlabs":
                    raise
                log(f"ElevenLabs fehlgeschlagen ({e}) – wechsle auf Piper")
                settings.tts_provider = "piper"
                return synthesize(scenes, out_dir, settings, log)
        else:
            pcm = _piper(speech, settings, settings.piper_length_scale / speed)
            pcm, _ = audio.trim_silence(pcm)
            w = _estimate_times(spans, speech, len(pcm) / audio.SR, t)
        dur = len(pcm) / audio.SR
        scene_times.append({"id": sc["id"], "start": round(t, 3), "end": round(t + dur, 3)})
        words.extend({"scene": sc["id"], **x} for x in w)
        chunks.append(pcm)
        gap = GAP + (0.25 if i == 0 else 0)
        chunks.append(np.zeros(int(gap * audio.SR), dtype=np.float32))
        t += dur + gap
        log(f"Voice-over Szene {sc['id']}: {dur:.1f} s")
    full = np.concatenate(chunks + [np.zeros(int(0.6 * audio.SR), dtype=np.float32)])
    raw = out_dir / "voiceover_raw.wav"
    audio.write_wav(raw, full)
    final = out_dir / "voiceover.wav"
    audio.loudnorm(raw, final, -16.0)
    raw.unlink(missing_ok=True)
    total = audio.duration(final)

    # Länge in den Zielkorridor bringen (einmalige Neusynthese mit angepasstem Tempo)
    if _attempt == 0 and (total > settings.target_max_seconds or total < settings.target_min_seconds):
        factor = total / (settings.target_max_seconds - 3 if total > settings.target_max_seconds else settings.target_min_seconds + 3)
        new_speed = max(0.85, min(1.2, speed * factor))
        if abs(new_speed - speed) > 0.02:
            log(f"Länge {total:.1f} s außerhalb {settings.target_min_seconds}–{settings.target_max_seconds} s – Tempo {new_speed:.2f}")
            return synthesize(scenes, out_dir, settings, log, speed=new_speed, _attempt=1)

    result = {
        "provider": provider,
        "voice": settings.elevenlabs_voice_id if provider == "elevenlabs" else settings.piper_voice,
        "speed": round(speed, 3),
        "file": "voice/voiceover.wav",
        "duration": round(total, 3),
        "scene_times": scene_times,
        "words": words,
        "text_hash": text_hash(scenes),
    }
    (out_dir / "timing.json").write_text(json.dumps(result, ensure_ascii=False, indent=1), "utf-8")
    log(f"Voice-over fertig: {total:.1f} s ({provider})")
    return result


def text_hash(scenes: list[dict]) -> str:
    import hashlib

    return hashlib.sha256("\n".join(s["text"] for s in scenes).encode()).hexdigest()[:16]
