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
- start_s / end_s: Länge {min_len:.0f}-{max_len:.0f} Sekunden (meist 25-45). Am ersten Satz \
einsteigen, der den Moment verständlich macht, nach der Reaktion 0,5-1 s stehen lassen. \
Kein Leerlauf: lieber kürzer und dicht. peak_s ist der Höhepunkt.
- Der Chat reagiert erst einige Sekunden nach dem Geschehen. Der Höhepunkt liegt \
also vor dem Chat-Ausschlag.
- subject_x: waagrechte Position (0 = links, 1 = rechts) der Action im Gameplay, \
ohne die Facecam. Im Zweifel 0.5.
- layout: "split", wenn die Facecam-Reaktion wichtig ist, sonst "blur".
- flags.cutscene = true bei Zwischensequenzen. flags.story_spoiler = true, wenn \
Handlung der Story verraten wird. flags.needs_context = true, wenn man den Moment \
ohne Vorwissen nicht versteht.
- keep = false, wenn hype unter {min_hype} liegt, bei Cutscenes oder bei Spoilern.
- hook: DAS WICHTIGSTE FELD. Er steht in den ersten Sekunden groß im Bild und \
entscheidet, ob jemand weiterschaut. Max. 7 Wörter, konkret, macht eine Frage oder \
Spannung auf, verrät die Pointe nicht und ist durch Bild/Transkript belegt. Muster, die \
funktionieren: Konflikt („Er legt sich mit dem Falschen an“), Erwartungsbruch („Das \
wollte er NICHT sehen“), direkte Ansprache („Warte aufs Ende“ nur, wenn das Ende \
wirklich liefert), Zitat-Teaser (ein kurzes starkes Zitat aus dem Transkript). Schlecht: \
Beschreibungen („Zarbex spielt GTA 6“), Clickbait ohne Einlösung, Emojis. Ohne starken \
Hook keinen hype über 6. Der Hook muss SPANNEND sein (Nutzerwunsch): Neugier oder \
Gefahr aufbauen, als würde gleich etwas Unerwartetes passieren („Er ahnt nicht, was gleich \
passiert", „Das ging SO schief", „Niemand hat damit gerechnet"), statt den Inhalt nur \
zu beschreiben. Höchstens ~28 Zeichen, damit er in den roten Kasten passt. Immer etwas \
Krasses (Superlativ, Schock, Neugier). Auch starke Map-Einblicke sind gute Clips, wenn \
Streamer oder Chat ausrasten (Wow-Momente), nicht nur Lustiges.
- title, caption und hook in der Sprache des Streamers ({language}). caption: genau EIN kurzer Satz \
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


def system_prompt(min_hype: int, language: str, min_len: float = 20, max_len: float = 60) -> str:
    rules = learned_rules()
    base = SYSTEM.format(min_hype=min_hype, language=language, min_len=min_len, max_len=max_len)
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
        "Musik/Geräusche (aus dem Ton entfernt) in Sekunden: "
        + (", ".join(f"{s}s" for s in transcript.music_seconds) or "keine")
        + ". Achtung: Dort kann gesungener Liedtext im Transkript stehen – nicht als Sprache werten.",
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


def clamp(j: Judgment, duration: float, has_facecam: bool, min_len: float = 20, max_len: float = 60) -> Judgment:
    """KI-Schnittpunkte in gültige Grenzen bringen: im Rohschnitt, Länge min_len..max_len."""
    start = min(max(j.start_s, 0.0), max(duration - 1, 0.0))
    end = min(max(j.end_s, start + 1), duration)
    peak = min(max(j.peak_s, start), end)
    if end - start < min_len:  # zu kurz: erst nach hinten, dann nach vorne verlängern
        end = min(start + min_len, duration)
        start = max(end - min_len, 0.0)
    if end - start > max_len:  # zu lang: Höhepunkt behalten, vorne kürzen
        start = max(start, min(peak - 5, end - max_len))
        end = min(end, start + max_len)
    peak = min(max(peak, start), end)
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
        system=system_prompt(cfg.min_hype, streamer.language, cfg.min_len_s, cfg.max_len_s),
        messages=[{"role": "user", "content": content}],
        output_format=Judgment,
    )
    if response.stop_reason == "refusal":
        raise JudgeError("KI hat die Bewertung abgelehnt")
    if response.stop_reason == "max_tokens" or response.parsed_output is None:
        raise JudgeError(f"keine gültige Antwort (stop_reason={response.stop_reason})")
    usage = response.usage
    log.info("Bewertung: %s in / %s out Tokens", usage.input_tokens, usage.output_tokens)
    return clamp(response.parsed_output, duration, streamer.facecam is not None, cfg.min_len_s, cfg.max_len_s)
