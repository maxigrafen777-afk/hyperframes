"""SQLite-Datenbank: Medienbibliothek, Lizenzen, Entities, Shots, Projekte-Index."""

from __future__ import annotations

import sqlite3
import threading
from contextlib import contextmanager

from .config import ensure_dirs, paths

_lock = threading.RLock()

SCHEMA = """
CREATE TABLE IF NOT EXISTS license_profile (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    source TEXT NOT NULL,                 -- MAXPPP | PressBox | Eigene | sonstige
    reference TEXT DEFAULT '',            -- Vertrags-/Rechnungsnummer
    platforms TEXT DEFAULT '',            -- kommagetrennt: tiktok,instagram,youtube
    commercial INTEGER,                   -- 1 erlaubt, 0 nicht erlaubt, NULL unbekannt
    valid_until TEXT,                     -- ISO-Datum oder NULL = unbefristet (muss bestätigt sein)
    unlimited INTEGER DEFAULT 0,          -- 1 = ausdrücklich unbefristet
    credit_template TEXT DEFAULT '',      -- z. B. "Foto: {byline} / MAXPPP"
    restrictions TEXT DEFAULT '',
    confirmed INTEGER DEFAULT 0,          -- Nutzer hat die Angaben gegen den Vertrag geprüft
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS media (
    id INTEGER PRIMARY KEY,
    path TEXT UNIQUE NOT NULL,
    sha256 TEXT NOT NULL,
    kind TEXT NOT NULL,                   -- foto | video | grafik
    source TEXT NOT NULL,
    filename TEXT NOT NULL,
    title TEXT DEFAULT '',
    caption TEXT DEFAULT '',
    keywords TEXT DEFAULT '',
    byline TEXT DEFAULT '',
    credit TEXT DEFAULT '',
    copyright TEXT DEFAULT '',
    captured_at TEXT,
    competition TEXT DEFAULT '',
    location TEXT DEFAULT '',
    width INTEGER, height INTEGER, duration REAL,
    focus_x REAL DEFAULT 0.5, focus_y REAL DEFAULT 0.4,
    license_profile_id INTEGER REFERENCES license_profile(id),
    lic_platforms TEXT, lic_commercial INTEGER, lic_valid_until TEXT, lic_credit TEXT,
    blocked INTEGER DEFAULT 0,
    is_test INTEGER DEFAULT 0,
    notes TEXT DEFAULT '',
    raw_meta TEXT DEFAULT '{}',
    imported_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS entity (
    id INTEGER PRIMARY KEY,
    kind TEXT NOT NULL,                   -- spieler | verein | trainer | wettbewerb | funktionaer
    name TEXT NOT NULL,
    aliases TEXT DEFAULT '',              -- | getrennt
    qid TEXT UNIQUE,
    club TEXT DEFAULT '',                 -- aktueller Verein (Name)
    UNIQUE(kind, name)
);
CREATE TABLE IF NOT EXISTS media_entity (
    media_id INTEGER REFERENCES media(id) ON DELETE CASCADE,
    entity_id INTEGER REFERENCES entity(id) ON DELETE CASCADE,
    origin TEXT DEFAULT 'metadaten',      -- metadaten | dateiname | sidecar | manuell
    confidence REAL DEFAULT 1.0,
    PRIMARY KEY (media_id, entity_id)
);
CREATE TABLE IF NOT EXISTS shot (
    id INTEGER PRIMARY KEY,
    media_id INTEGER REFERENCES media(id) ON DELETE CASCADE,
    start REAL NOT NULL, end REAL NOT NULL,
    kind TEXT DEFAULT 'spielszene',       -- spielszene | jubel | interview | training | pressekonferenz | sonstiges
    thumb TEXT,
    enabled INTEGER DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_me_entity ON media_entity(entity_id);
CREATE INDEX IF NOT EXISTS idx_shot_media ON shot(media_id);
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);
"""


@contextmanager
def conn():
    ensure_dirs()
    with _lock:
        c = sqlite3.connect(paths()["db"])
        c.row_factory = sqlite3.Row
        c.execute("PRAGMA foreign_keys = ON")
        try:
            c.executescript(SCHEMA)
            yield c
            c.commit()
        finally:
            c.close()


def rows(sql: str, args: tuple = ()) -> list[dict]:
    with conn() as c:
        return [dict(r) for r in c.execute(sql, args).fetchall()]


def one(sql: str, args: tuple = ()) -> dict | None:
    r = rows(sql, args)
    return r[0] if r else None


def execute(sql: str, args: tuple = ()) -> int:
    with conn() as c:
        cur = c.execute(sql, args)
        return cur.lastrowid


def get_meta(key: str) -> str | None:
    r = one("SELECT value FROM meta WHERE key=?", (key,))
    return r["value"] if r else None


def set_meta(key: str, value: str) -> None:
    execute("INSERT OR REPLACE INTO meta(key,value) VALUES(?,?)", (key, value))
