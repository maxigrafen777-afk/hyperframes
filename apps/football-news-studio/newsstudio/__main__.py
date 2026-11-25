"""Kommandozeile:
  python -m newsstudio serve [--port 8770]       Dashboard starten
  python -m newsstudio scan [ORDNER]             Medien importieren
  python -m newsstudio trending                  Aktuelle Themen
  python -m newsstudio video "THEMA"             Recherche → Skript → Medien → Stimme → Vorschau
  python -m newsstudio export PROJEKT-ID         Finales MP4
  python -m newsstudio testmedia                 Testbibliothek erzeugen (nur zum Ausprobieren)
"""

import argparse
import json
import sys
from pathlib import Path


def main(argv=None):
    ap = argparse.ArgumentParser(prog="newsstudio")
    sub = ap.add_subparsers(dest="cmd", required=True)
    s = sub.add_parser("serve")
    s.add_argument("--host", default="127.0.0.1")
    s.add_argument("--port", type=int, default=8770)
    sc = sub.add_parser("scan")
    sc.add_argument("folder", nargs="?")
    sub.add_parser("trending")
    v = sub.add_parser("video")
    v.add_argument("topic")
    e = sub.add_parser("export")
    e.add_argument("pid")
    sub.add_parser("testmedia")
    a = ap.parse_args(argv)
    from .config import MEDIA_DIR, ensure_dirs

    ensure_dirs()
    if a.cmd == "serve":
        import uvicorn

        uvicorn.run("newsstudio.server:app", host=a.host, port=a.port)
    elif a.cmd == "scan":
        from .library import importer

        print(json.dumps(importer.scan(Path(a.folder) if a.folder else None), ensure_ascii=False, indent=1))
    elif a.cmd == "trending":
        from .library import entities
        from .news import research

        entities.seed_static()
        for t in research.trending():
            print(f"{t['score']:>6}  {t['entity']:<28} {len(t['sources'])} Quellen – {t['suggested_topic'][:80]}")
    elif a.cmd == "video":
        from . import pipeline, projects

        p = projects.create(a.topic)
        pipeline.run_all(p["id"])
        p = projects.load(p["id"])
        print(p["id"], p["outputs"]["preview"], json.dumps(p["timeline"]["warnings"], ensure_ascii=False))
    elif a.cmd == "export":
        from . import pipeline, projects

        pipeline.run_render(a.pid, final=True)
        print(projects.load(a.pid)["outputs"]["final"])
    elif a.cmd == "testmedia":
        from . import testmedia

        testmedia.build_test_library(MEDIA_DIR / "_testmaterial")
        print("Testmaterial unter", MEDIA_DIR / "_testmaterial")
    return 0


if __name__ == "__main__":
    sys.exit(main())
