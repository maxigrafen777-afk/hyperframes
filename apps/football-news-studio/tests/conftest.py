import os
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
REAL_CACHE = ROOT / "data" / "cache"


@pytest.fixture(scope="session")
def testlib(tmp_path_factory):
    from newsstudio import testmedia

    root = tmp_path_factory.mktemp("media")
    testmedia.build_test_library(root)
    return root


@pytest.fixture
def env(tmp_path, monkeypatch):
    """Frische Datenbank je Test; HTTP-Cache wird geteilt (schnellere Wikidata-Abfragen)."""
    from newsstudio import config
    from newsstudio.library import entities

    monkeypatch.setattr(config, "DATA_DIR", tmp_path / "data")
    orig = config.paths

    def paths():
        p = orig()
        p["cache"] = REAL_CACHE
        return p

    monkeypatch.setattr(config, "paths", paths)
    for mod in ("newsstudio.db", "newsstudio.http", "newsstudio.library.importer"):
        if mod in sys.modules and hasattr(sys.modules[mod], "paths"):
            monkeypatch.setattr(sys.modules[mod], "paths", paths)
    entities.reset_cache()
    yield tmp_path
    entities.reset_cache()


def live() -> bool:
    return os.environ.get("NS_LIVE") == "1"
