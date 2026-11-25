"""Kommandozeile.

  python -m football_studio serve [--port 8765]     Dashboard starten (inkl. täglicher Automatisierung)
  python -m football_studio topics [--force]        Tagesideen anzeigen/erzeugen
  python -m football_studio daily                   Tageslauf: Ideen + Recherche + Skript (wartet auf Freigabe)
  python -m football_studio prepare <QID|Suchbegriff> [--category absturz]
  python -m football_studio produce <PROJEKT-ID>    Freigeben + Voice-over + Video + Vorschau
  python -m football_studio export <PROJEKT-ID>     Finales MP4 rendern
  python -m football_studio list                    Projekte auflisten
"""

from __future__ import annotations

import argparse
import json
import re
import sys


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="football_studio", description="Football Story Studio")
    sub = ap.add_subparsers(dest="cmd", required=True)
    s = sub.add_parser("serve")
    s.add_argument("--host", default="127.0.0.1")
    s.add_argument("--port", type=int, default=8765)
    t = sub.add_parser("topics")
    t.add_argument("--force", action="store_true")
    sub.add_parser("daily")
    pr = sub.add_parser("prepare")
    pr.add_argument("topic")
    pr.add_argument("--category", default=None)
    pd = sub.add_parser("produce")
    pd.add_argument("pid")
    pd.add_argument("--no-preview", action="store_true")
    ex = sub.add_parser("export")
    ex.add_argument("pid")
    sub.add_parser("list")
    a = ap.parse_args(argv)

    from . import pipeline, projects, topics
    from .config import ensure_dirs

    ensure_dirs()
    if a.cmd == "serve":
        import uvicorn

        uvicorn.run("football_studio.server:app", host=a.host, port=a.port, log_level="info")
    elif a.cmd == "topics":
        for x in topics.generate_daily(force=a.force):
            print(f"{x['rank'] + 1:>2}. [{x['category_label']}] {x['title']}  ({x['qid']}) – {x['teaser']}")
    elif a.cmd == "daily":
        print(json.dumps(pipeline.daily_run(), ensure_ascii=False, indent=1))
    elif a.cmd == "prepare":
        qid, label = a.topic, None
        if not re.fullmatch(r"Q\d+", qid):
            r = topics.resolve(a.topic)
            if not r:
                print("Kein passendes Thema gefunden.", file=sys.stderr)
                return 1
            qid, label = r["qid"], r["label"]
        pid = pipeline.prepare(qid, label, a.category)
        p = projects.load(pid)
        print(f"Projekt {pid}: {p['script']['title']} ({p['script']['words']} Wörter, ~{p['script']['est_seconds']:.0f} s)")
        print("Validierung:", "OK" if p["script"]["validation"]["ok"] else p["script"]["validation"]["issues"])
    elif a.cmd == "produce":
        projects.update(a.pid, lambda p: p.update(approved=True))
        pipeline.produce(a.pid, preview=not a.no_preview)
        print(json.dumps(projects.load(a.pid).get("outputs", {}), indent=1))
    elif a.cmd == "export":
        pipeline.run_export(a.pid)
        print(projects.load(a.pid)["outputs"]["export"])
    elif a.cmd == "list":
        for p in projects.list_all():
            print(f"{p['id']:<50} {p['status_label']:<22} {p['title']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
