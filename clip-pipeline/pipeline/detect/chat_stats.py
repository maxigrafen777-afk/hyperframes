"""Chat-Ausschlag erkennen: robuster z-Wert aus Burst gegen Baseline.

Alles ist zeitgesteuert über die Zeitstempel der Nachrichten, nicht über
die Systemuhr. Dadurch läuft derselbe Code live und auf aufgezeichneten
Chatlogs, und Tests sind reproduzierbar.
"""

from __future__ import annotations

import math
import re
from collections import Counter, deque
from dataclasses import dataclass
from statistics import median

from ..config import ClipCfg, DetectCfg, Streamer
from ..models import Candidate, ChatLine, Signals

CLIP_CALL = re.compile(r"\bclip(?:\s?it|\s?that|\s?das)?\b", re.IGNORECASE)
CONTEXT_LINES = 40


@dataclass
class Trigger:
    channel: str
    ts: float
    peak_ts: float  # Sekunde mit den meisten Nachrichten im Burst
    signals: Signals
    pre_score: float
    chat: list[ChatLine]


def robust_z(value: float, samples: list[float]) -> tuple[float, float, float]:
    """z = (x - Median) / (max(1.4826 * MAD, sqrt(Median)) + 1).

    Median und MAD halten Spam-Wellen aus der Baseline heraus. Die Wurzel
    aus dem Median ist die Zufallsstreuung von Nachrichtenzahlen (Poisson);
    ohne diese Untergrenze löst ruhiger Chat bei Zufall aus, weil der MAD
    dort fast 0 ist. Gibt (z, median, mad) zurück."""
    med = median(samples)
    mad = median(abs(s - med) for s in samples)
    spread = max(1.4826 * mad, math.sqrt(max(med, 0)))
    return (value - med) / (spread + 1), med, mad


class HypeMatcher:
    def __init__(self, words: list[str]):
        # Wörter: ganzer Token, Groß/klein egal. Emojis/Symbole: Teilstring.
        self.tokens = {w.casefold() for w in words if w.isalnum()}
        self.symbols = [w for w in words if not w.isalnum()]

    def __call__(self, text: str) -> bool:
        if any(sym in text for sym in self.symbols):
            return True
        return any(tok.casefold().strip("!?.,") in self.tokens for tok in text.split())


class ChatDetector:
    """Ein Detektor pro Kanal. `feed()` mit jeder Chatzeile aufrufen."""

    def __init__(self, channel: str, cfg: DetectCfg):
        self.channel = channel
        self.cfg = cfg
        self.is_hype = HypeMatcher(cfg.hype_words)
        self.per_second: Counter[int] = Counter()
        self.recent: deque[ChatLine] = deque()
        self.first_ts: float | None = None
        self.last_trigger_ts = -math.inf
        self.last_eval_sec: int | None = None

    def feed(self, line: ChatLine) -> Trigger | None:
        if self.first_ts is None:
            self.first_ts = line.ts
        self.per_second[int(line.ts)] += 1
        self.recent.append(line)
        self._prune(line.ts)

        sec = int(line.ts)
        if sec == self.last_eval_sec:  # höchstens einmal pro Sekunde auswerten
            return None
        self.last_eval_sec = sec
        return self.evaluate(line.ts)

    def _prune(self, now: float) -> None:
        keep_from = int(now) - self.cfg.baseline_s - self.cfg.burst_s - 2
        for sec in [s for s in self.per_second if s < keep_from]:
            del self.per_second[sec]
        horizon = now - max(self.cfg.burst_s, 60)
        while len(self.recent) > CONTEXT_LINES and self.recent[0].ts < horizon:
            self.recent.popleft()

    def _baseline(self, now_sec: int) -> list[float]:
        """Nachrichten je burst_s-Fenster über die Baseline-Zeit,
        ohne den aktuellen Burst. Stille Sekunden zählen als 0."""
        b = self.cfg.burst_s
        end = now_sec - b + 1  # exklusiv: aktueller Burst gehört nicht dazu
        start = max(end - self.cfg.baseline_s, int(self.first_ts or end))
        chunks = []
        for chunk_start in range(start, end - b + 1, b):
            chunks.append(float(sum(self.per_second[s] for s in range(chunk_start, chunk_start + b))))
        return chunks

    def evaluate(self, now: float) -> Trigger | None:
        cfg = self.cfg
        assert self.first_ts is not None
        if now - self.first_ts < cfg.min_baseline_s:
            return None
        if now - self.last_trigger_ts < cfg.cooldown_s:
            return None

        now_sec = int(now)
        baseline = self._baseline(now_sec)
        if len(baseline) < 3:
            return None

        burst_lines = [l for l in self.recent if l.ts > now - cfg.burst_s]
        burst = len(burst_lines)
        if burst == 0:
            return None
        users = {l.user.casefold() for l in burst_lines}
        unique_ratio = len(users) / burst
        hype_ratio = sum(self.is_hype(l.text) for l in burst_lines) / burst
        clip_calls = len({l.user.casefold() for l in burst_lines if CLIP_CALL.search(l.text)})
        z, med, mad = robust_z(burst, baseline)

        if z >= cfg.z_threshold and len(users) >= cfg.min_unique_users and unique_ratio >= cfg.min_unique_ratio:
            reason = "z"
        elif clip_calls >= cfg.clip_calls_trigger:
            reason = "clip_calls"
        else:
            return None

        signals = Signals(
            burst=burst, median=med, mad=mad, z=round(z, 3),
            unique_users=len(users), unique_ratio=round(unique_ratio, 3),
            hype_ratio=round(hype_ratio, 3), clip_calls=clip_calls, reason=reason,
        )
        score = pre_score(signals, cfg)
        if score < cfg.min_pre_score:
            return None  # schwach: verwerfen, keine Abklingzeit starten

        self.last_trigger_ts = now
        burst_secs = range(now_sec - cfg.burst_s + 1, now_sec + 1)
        peak_sec = max(burst_secs, key=lambda s: (self.per_second[s], s))
        chat = [l for l in self.recent if l.ts <= now][-CONTEXT_LINES:]
        return Trigger(self.channel, now, float(peak_sec), signals, score, chat)


def pre_score(s: Signals, cfg: DetectCfg) -> float:
    """Vorab-Score 0..1 aus den Chat-Signalen."""
    z_part = 1 - math.exp(-max(s.z, 0) / cfg.z_threshold)  # z = Schwelle -> 0.63
    clip_part = min(s.clip_calls / (2 * cfg.clip_calls_trigger), 1.0)
    score = 0.45 * z_part + 0.2 * s.unique_ratio + 0.2 * s.hype_ratio + 0.15 * clip_part
    return round(min(max(score, 0.0), 1.0), 3)


def to_candidate(trig: Trigger, streamer: Streamer, clip: ClipCfg) -> Candidate:
    """Zeitraum für den Ausschnitt berechnen.

    Der Chat hinkt hinter dem Bild her: Moment = stärkste Chat-Sekunde
    - chat_delay. Vorlauf vor dem Moment, Nachlauf nach dem Auslöser. Zu lange Clips
    werden vorne gekürzt, damit der Höhepunkt drin bleibt."""
    moment = trig.peak_ts - streamer.chat_delay_s
    start = moment - clip.pre_roll_s
    end = trig.ts + clip.post_roll_s
    if end - start > clip.max_len_s:
        start = end - clip.max_len_s
    return Candidate(
        streamer=streamer.key,
        trigger_ts=trig.ts,
        moment_ts=moment,
        start_ts=start,
        end_ts=end,
        pre_score=trig.pre_score,
        signals=trig.signals,
        chat=trig.chat,
    )
