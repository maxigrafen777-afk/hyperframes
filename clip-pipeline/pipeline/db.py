"""SQLite: ein Status pro Clip. Worker holen sich Arbeit per Lease.

Ein Worker "least" einen Clip (claim). Stürzt er ab, läuft die Lease aus
und der Clip wird beim nächsten claim wieder vergeben. So geht es nach
einem Absturz genau dort weiter, wo es aufgehört hat.
"""

from __future__ import annotations

import sqlite3
import time
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path
from typing import Any

from pydantic import BaseModel

from .models import TERMINAL, TRANSITIONS, Candidate, Judgment, Status

SCHEMA = """
CREATE TABLE IF NOT EXISTS clips (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    status       TEXT    NOT NULL,
    streamer     TEXT    NOT NULL,
    live         INTEGER NOT NULL DEFAULT 1,
    created_at   REAL    NOT NULL,
    updated_at   REAL    NOT NULL,
    trigger_ts   REAL    NOT NULL,
    start_ts     REAL    NOT NULL,
    end_ts       REAL    NOT NULL,
    pre_score    REAL    NOT NULL,
    hype         INTEGER,
    attempts     INTEGER NOT NULL DEFAULT 0,
    lease_owner  TEXT,
    lease_until  REAL,
    raw_path     TEXT,
    raw_start_ts REAL,
    transcript_path TEXT,
    render_path  TEXT,
    candidate    TEXT    NOT NULL,
    judgment     TEXT,
    error        TEXT
);
CREATE INDEX IF NOT EXISTS idx_clips_status ON clips(status);
CREATE INDEX IF NOT EXISTS idx_clips_streamer_time ON clips(streamer, start_ts, end_ts);
"""

# Spalten, die advance() direkt setzen darf.
_FIELDS = {"raw_path", "raw_start_ts", "transcript_path", "render_path", "error", "live"}


class Clip(BaseModel):
    id: int
    status: Status
    streamer: str
    live: bool
    created_at: float
    updated_at: float
    start_ts: float
    end_ts: float
    pre_score: float
    hype: int | None
    attempts: int
    raw_path: str | None
    raw_start_ts: float | None
    transcript_path: str | None
    render_path: str | None
    candidate: Candidate
    judgment: Judgment | None
    error: str | None


class InvalidTransition(RuntimeError):
    pass


class DB:
    def __init__(self, path: Path | str, *, max_attempts: int = 3, clock=time.time):
        if str(path) != ":memory:":
            Path(path).parent.mkdir(parents=True, exist_ok=True)
        self.conn = sqlite3.connect(str(path), isolation_level=None, check_same_thread=False)
        self.conn.row_factory = sqlite3.Row
        self.conn.execute("PRAGMA journal_mode=WAL")
        self.conn.execute("PRAGMA busy_timeout=5000")
        self.conn.executescript(SCHEMA)
        self.max_attempts = max_attempts
        self.clock = clock

    @contextmanager
    def tx(self) -> Iterator[sqlite3.Connection]:
        self.conn.execute("BEGIN IMMEDIATE")
        try:
            yield self.conn
        except BaseException:
            self.conn.execute("ROLLBACK")
            raise
        self.conn.execute("COMMIT")

    # ---------- anlegen ----------

    def add_candidate(
        self, cand: Candidate, raw_path: str | None = None, raw_start_ts: float | None = None
    ) -> int | None:
        """Legt einen Kandidaten an. Überlappt er mit einem bestehenden Clip
        desselben Streamers, bleibt nur der stärkere (Vorab-Score).
        Gibt die neue ID zurück, oder None, wenn der Kandidat verworfen wurde."""
        now = self.clock()
        with self.tx() as c:
            rivals = c.execute(
                """SELECT id, pre_score, status FROM clips
                   WHERE streamer = ? AND start_ts < ? AND end_ts > ?
                     AND status IN ('NEW', 'TRANSCRIBED')""",
                (cand.streamer, cand.end_ts, cand.start_ts),
            ).fetchall()
            if any(r["pre_score"] >= cand.pre_score for r in rivals):
                return None
            for r in rivals:  # alle schwächer -> verwerfen
                c.execute(
                    "UPDATE clips SET status='REJECTED', error='duplicate', updated_at=? WHERE id=?",
                    (now, r["id"]),
                )
            cur = c.execute(
                """INSERT INTO clips (status, streamer, live, created_at, updated_at,
                       trigger_ts, start_ts, end_ts, pre_score, raw_path, raw_start_ts, candidate)
                   VALUES ('NEW', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    cand.streamer, int(cand.live), now, now, cand.trigger_ts,
                    cand.start_ts, cand.end_ts, cand.pre_score, raw_path, raw_start_ts,
                    cand.model_dump_json(),
                ),
            )
            return cur.lastrowid

    # ---------- Arbeit holen ----------

    def claim(self, status: Status, owner: str, lease_s: float = 300) -> Clip | None:
        """Holt den wichtigsten Clip im Status `status` und least ihn.
        Reihenfolge: live vor alt, dann höhere Note, dann frischer."""
        now = self.clock()
        with self.tx() as c:
            row = c.execute(
                """SELECT id FROM clips
                   WHERE status = ? AND (lease_until IS NULL OR lease_until < ?)
                   ORDER BY live DESC, COALESCE(hype, pre_score * 10) DESC, created_at DESC
                   LIMIT 1""",
                (status.value, now),
            ).fetchone()
            if row is None:
                return None
            c.execute(
                "UPDATE clips SET lease_owner=?, lease_until=?, attempts=attempts+1 WHERE id=?",
                (owner, now + lease_s, row["id"]),
            )
        return self.get(row["id"])

    # ---------- weiterschalten ----------

    def advance(
        self,
        clip_id: int,
        to: Status,
        *,
        judgment: Judgment | None = None,
        **fields: Any,
    ) -> None:
        unknown = set(fields) - _FIELDS
        if unknown:
            raise ValueError(f"unbekannte Felder: {unknown}")
        with self.tx() as c:
            row = c.execute("SELECT status FROM clips WHERE id=?", (clip_id,)).fetchone()
            if row is None:
                raise KeyError(clip_id)
            frm = Status(row["status"])
            if to not in TRANSITIONS[frm]:
                raise InvalidTransition(f"{frm} -> {to} ist nicht erlaubt")
            sets = ["status=?", "updated_at=?", "lease_owner=NULL", "lease_until=NULL"]
            vals: list[Any] = [to.value, self.clock()]
            if to not in (Status.FAILED,):
                sets.append("attempts=0")
            if judgment is not None:
                sets += ["judgment=?", "hype=?"]
                vals += [judgment.model_dump_json(), judgment.hype]
            for k, v in fields.items():
                sets.append(f"{k}=?")
                vals.append(v)
            vals.append(clip_id)
            c.execute(f"UPDATE clips SET {', '.join(sets)} WHERE id=?", vals)

    def fail(self, clip_id: int, error: str) -> Status:
        """Fehler melden. Unter max_attempts bleibt der Status, die Lease
        wird freigegeben und der Clip später erneut versucht."""
        with self.tx() as c:
            row = c.execute("SELECT status, attempts FROM clips WHERE id=?", (clip_id,)).fetchone()
            if row is None:
                raise KeyError(clip_id)
            if row["attempts"] >= self.max_attempts:
                c.execute(
                    """UPDATE clips SET status='FAILED', error=?, updated_at=?,
                       lease_owner=NULL, lease_until=NULL WHERE id=?""",
                    (error[:2000], self.clock(), clip_id),
                )
                return Status.FAILED
            c.execute(
                "UPDATE clips SET error=?, lease_owner=NULL, lease_until=NULL WHERE id=?",
                (error[:2000], clip_id),
            )
            return Status(row["status"])

    # ---------- lesen ----------

    def get(self, clip_id: int) -> Clip:
        row = self.conn.execute("SELECT * FROM clips WHERE id=?", (clip_id,)).fetchone()
        if row is None:
            raise KeyError(clip_id)
        d = dict(row)
        d["candidate"] = Candidate.model_validate_json(d["candidate"])
        d["judgment"] = Judgment.model_validate_json(d["judgment"]) if d["judgment"] else None
        return Clip.model_validate(d)

    def counts(self) -> dict[str, int]:
        rows = self.conn.execute("SELECT status, COUNT(*) n FROM clips GROUP BY status")
        return {r["status"]: r["n"] for r in rows}

    def old_finished(self, older_than_s: float) -> list[Clip]:
        """Für das Aufräumen: abgeschlossene Clips älter als die Frist."""
        cutoff = self.clock() - older_than_s
        marks = ",".join("?" * len(TERMINAL))
        rows = self.conn.execute(
            f"SELECT id FROM clips WHERE status IN ({marks}) AND updated_at < ?",
            (*[s.value for s in TERMINAL], cutoff),
        )
        return [self.get(r["id"]) for r in rows]

    def close(self) -> None:
        self.conn.close()

