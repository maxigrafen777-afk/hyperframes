"""SQLite-Speicher für Themen-Historie (verhindert doppelte Themen) und Tagesvorschläge."""

from __future__ import annotations

import sqlite3
import threading
from contextlib import contextmanager

from .config import DB_FILE, ensure_dirs

_lock = threading.Lock()

SCHEMA = """
CREATE TABLE IF NOT EXISTS topics (
    qid TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    label TEXT NOT NULL,
    category TEXT NOT NULL,
    teaser TEXT,
    score REAL DEFAULT 0,
    status TEXT DEFAULT 'suggested',   -- suggested | used | dismissed
    project_id TEXT,
    first_suggested TEXT,
    last_suggested TEXT
);
CREATE TABLE IF NOT EXISTS daily (
    day TEXT NOT NULL,
    rank INTEGER NOT NULL,
    qid TEXT NOT NULL,
    PRIMARY KEY (day, qid)
);
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);
"""


@contextmanager
def conn():
    ensure_dirs()
    with _lock:
        c = sqlite3.connect(DB_FILE)
        c.row_factory = sqlite3.Row
        try:
            c.executescript(SCHEMA)
            yield c
            c.commit()
        finally:
            c.close()


def get_meta(key: str) -> str | None:
    with conn() as c:
        r = c.execute("SELECT value FROM meta WHERE key=?", (key,)).fetchone()
        return r["value"] if r else None


def set_meta(key: str, value: str) -> None:
    with conn() as c:
        c.execute("INSERT OR REPLACE INTO meta(key, value) VALUES(?, ?)", (key, value))
