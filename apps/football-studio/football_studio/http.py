"""Höflicher HTTP-Client: eigener User-Agent, Datei-Cache, Backoff bei 429/5xx."""

from __future__ import annotations

import hashlib
import json
import time
from pathlib import Path

import requests

from .config import CACHE_DIR, USER_AGENT

_session = requests.Session()
_session.headers.update({"User-Agent": USER_AGENT, "Accept-Encoding": "gzip"})
_last_request: dict[str, float] = {}
MIN_INTERVAL = 0.6  # Sekunden zwischen Anfragen an denselben Host


class FetchError(RuntimeError):
    pass


def _cache_path(key: str) -> Path:
    h = hashlib.sha256(key.encode()).hexdigest()
    return CACHE_DIR / "http" / h[:2] / f"{h}.json"


def _throttle(url: str) -> None:
    host = requests.utils.urlparse(url).netloc
    wait = MIN_INTERVAL - (time.time() - _last_request.get(host, 0))
    if wait > 0:
        time.sleep(wait)
    _last_request[host] = time.time()


def get(
    url: str,
    params: dict | None = None,
    *,
    ttl: float = 24 * 3600,
    headers: dict | None = None,
    retries: int = 6,
    timeout: float = 30,
    binary: bool = False,
) -> tuple[str | bytes, dict]:
    """GET mit Cache. Liefert (Inhalt, Meta) – Meta enthält url, status, fetched_at."""
    req = requests.Request("GET", url, params=params).prepare()
    full_url = req.url or url
    cp = _cache_path(full_url + ("#bin" if binary else ""))
    if ttl > 0 and cp.exists():
        meta = json.loads(cp.read_text("utf-8"))
        if time.time() - meta["fetched_at"] < ttl:
            body_file = cp.with_suffix(".bin")
            if body_file.exists():
                data = body_file.read_bytes()
                return (data if binary else data.decode("utf-8")), meta
    delay = 2.0
    last_err = ""
    for attempt in range(retries):
        _throttle(full_url)
        try:
            r = _session.get(full_url, headers=headers, timeout=timeout)
        except requests.RequestException as e:  # Netzwerkfehler -> erneut versuchen
            last_err = str(e)
            time.sleep(delay)
            delay = min(delay * 2, 30)
            continue
        if r.status_code == 200:
            meta = {"url": full_url, "status": 200, "fetched_at": time.time()}
            cp.parent.mkdir(parents=True, exist_ok=True)
            cp.with_suffix(".bin").write_bytes(r.content)
            cp.write_text(json.dumps(meta), "utf-8")
            return (r.content if binary else r.text), meta
        last_err = f"HTTP {r.status_code}"
        if r.status_code in (429, 500, 502, 503, 504):
            ra = r.headers.get("Retry-After")
            wait = float(ra) if ra and ra.isdigit() else delay
            time.sleep(min(wait, 60))
            delay = min(delay * 2, 30)
            continue
        break
    raise FetchError(f"{full_url}: {last_err}")


def get_json(url: str, params: dict | None = None, **kw) -> tuple[dict, dict]:
    text, meta = get(url, params, **kw)
    try:
        return json.loads(text, strict=False), meta
    except json.JSONDecodeError as e:
        # abgeschnittene Antwort nicht im Cache behalten
        req = requests.Request("GET", url, params=params).prepare()
        cp = _cache_path(req.url or url)
        cp.unlink(missing_ok=True)
        cp.with_suffix(".bin").unlink(missing_ok=True)
        raise FetchError(f"Ungültiges JSON von {url}: {e}") from e
