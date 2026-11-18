"""KI-Bewertung mit Claude: Standbilder + Transkript + Lautstärke + Chat -> Judgment (festes JSON)."""

from __future__ import annotations

import base64
import logging
from pathlib import Path
from typing import Any

from ..config import JudgeCfg, Streamer
from ..models import ChatLine, Judgment
from .media import Transcript, loud_spikes

log = logging.getLogger(__name__)

SYSTEM = """\
Du bist ein strenger Shorts-Editor für TikTok. Du bewertest Momente aus Livestreams \
von Grand Theft Auto VI und entscheidest, ob daraus ein Clip wird, der auf TikTok \
funktioniert.

Skala für "hype" (sei streng, die meisten Momente sind Mittelmaß):
1-3  nichts passiert, Smalltalk, Menü, Laden
4-5  ganz nett, aber ohne Kontext langweilig
6    solide, aber kein Grund zu teilen
7    klarer Moment: echter Lacher, Fail, Schreck, starke Reaktion
8-9  sehr stark: würde man Freunden schicken
10   außergewöhnlich, kommt selten vor

Regeln:
- Nichts erfinden. Beschreibe nur, was auf den Bildern, im Transkript oder im Chat zu sehen ist.
- Alle Zeiten in Sekunden relativ zum Anfang dieses Rohschnitts.
- start_s / end_s: der engste Schnitt, der den Moment trägt. Kurz vor dem Auslöser \
anfangen, kurz nach der Reaktion aufhören. Idealerweise 12-45 Sekunden. peak_s ist \
der Höhepunkt.
- Der Chat reagiert erst einige Sekunden nach dem Geschehen. Der Höhepunkt liegt \
also vor dem Chat-Ausschlag.
- subject_x: waagrechte Position (0 = links, 1 = rechts) der Action im Gameplay, \
ohne die Facecam. Im Zweifel 0.5.
- layout: "split", wenn die Facecam-Reaktion wichtig ist, sonst "blur".
- flags.cutscene = true bei Zwischensequenzen. flags.story_spoiler = true, wenn \
Handlung der Story verraten wird. flags.needs_context = true, wenn man den Moment \
ohne Vorwissen nicht versteht.
- keep = false, wenn hype unter {min_hype} liegt, bei Cutscenes oder bei Spoilern.
- hook: max. 6 Wörter, wird die ersten Sekunden groß eingeblendet. Neugierig machen, \
nicht die Pointe verraten.
- title, caption und hook in der Sprache des Streamers ({language}). caption: 1-2 \
kurze Sätze. hashtags: 3-6 passende, ohne '#'.
"""


SKILL_FILE = Path(__file__).resolve().parents[2] / "skill" / "SKILL.md"


def learned_rules(path: Path = SKILL_FILE) -> str:
    """Bewertungsregeln aus dem Skill (eine Quelle für Hand- und API-Bewertung)."""
    if not path.exists():
        return ""
    text = path.read_text("utf-8")
    start, end = "<!-- judge-rules:start -->", "<!-- judge-rules:end -->"
    if start not in text or end not in text:
        return ""
    return text.split(start, 1)[1].split(end, 1)[0].strip()


def system_prompt(min_hype: int, language: str) -> str:
    rules = learned_rules()
    base = SYSTEM.format(min_hype=min_hype, language=language)
    return base + ("\nGelernte Regeln aus bisherigen Streams:\n" + rules + "\n" if rules else "")


def _mmss(t: float) -> str:
    return f"{t:5.1f}s"


def build_user_content(
    *,
    frames: list[tuple[float, Path]],
    transcript: Transcript,
    chat: list[ChatLine],
    raw_start_ts: float,
    duration: float,
    streamer: Streamer,
    trigger_ts: float,
) -> list[dict[str, Any]]:
    content: list[dict[str, Any]] = []
    for t, path in frames:
        content.append({"type": "text", "text": f"Standbild bei {_mmss(t)}:"})
        content.append({
            "type": "image",
            "source": {"type": "base64", "media_type": "image/jpeg",
                       "data": base64.b64encode(path.read_bytes()).decode()},
        })

    lines = [
        f"Streamer: {streamer.login} (Twitch, Sprache {streamer.language})",
        f"Länge des Rohschnitts: {duration:.1f}s",
        f"Chat-Ausschlag bei {_mmss(trigger_ts - raw_start_ts)} "
        f"(Chat hinkt etwa {streamer.chat_delay_s:.0f}s hinterher)",
        f"Facecam vorhanden: {'ja' if streamer.facecam else 'nein'}",
        "",
        "Transkript (Zeit: Wörter):",
    ]
    # Wörter zu Zeilen von ~3 Sekunden bündeln
    row: list[str] = []
    row_start = None
    for w in transcript.words:
        if row_start is None:
            row_start = w.start
        row.append(w.word.strip())
        if w.end - row_start >= 3:
            lines.append(f"  {_mmss(row_start)}: {' '.join(row)}")
            row, row_start = [], None
    if row and row_start is not None:
        lines.append(f"  {_mmss(row_start)}: {' '.join(row)}")
    if not transcript.words:
        lines.append("  (keine Sprache erkannt)")

    spikes = loud_spikes(transcript.loudness_db)
    lines += [
        "",
        "Lautstärke je Sekunde (dBFS): " + " ".join(f"{v:.0f}" for v in transcript.loudness_db),
        "Deutlich laute Sekunden: " + (", ".join(f"{s}s" for s in spikes) or "keine"),
        "",
        "Chat (Zeit relativ zum Rohschnitt):",
    ]
    for c in chat:
        lines.append(f"  {_mmss(c.ts - raw_start_ts)} {c.user}: {c.text[:200]}")
    lines += ["", "Bewerte diesen Moment."]
    content.append({"type": "text", "text": "\n".join(lines)})
    return content


class JudgeError(RuntimeError):
    pass


def clamp(j: Judgment, duration: float, has_facecam: bool) -> Judgment:
    """KI-Schnittpunkte in gültige Grenzen bringen."""
    start = min(max(j.start_s, 0.0), max(duration - 1, 0.0))
    end = min(max(j.end_s, start + 1), duration)
    peak = min(max(j.peak_s, start), end)
    layout = j.layout if has_facecam else "blur"
    return j.model_copy(update={"start_s": start, "end_s": end, "peak_s": peak, "layout": layout})


def judge(
    client: Any,  # anthropic.Anthropic
    cfg: JudgeCfg,
    *,
    streamer: Streamer,
    content: list[dict[str, Any]],
    duration: float,
) -> Judgment:
    response = client.beta.messages.parse(
        model=cfg.model,
        max_tokens=16000,
        betas=["server-side-fallback-2026-07-01"],
        fallbacks="default",  # lehnt das Modell ab, springt automatisch ein anderes ein
        output_config={"effort": cfg.effort},
        system=system_prompt(cfg.min_hype, streamer.language),
        messages=[{"role": "user", "content": content}],
        output_format=Judgment,
    )
    if response.stop_reason == "refusal":
        raise JudgeError("KI hat die Bewertung abgelehnt")
    if response.stop_reason == "max_tokens" or response.parsed_output is None:
        raise JudgeError(f"keine gültige Antwort (stop_reason={response.stop_reason})")
    usage = response.usage
    log.info("Bewertung: %s in / %s out Tokens", usage.input_tokens, usage.output_tokens)
    return clamp(response.parsed_output, duration, streamer.facecam is not None)
