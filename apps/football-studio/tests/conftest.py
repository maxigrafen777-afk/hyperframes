import json
import os
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
FIX = Path(__file__).parent / "fixtures"


@pytest.fixture(autouse=True)
def isolated_data(tmp_path, monkeypatch):
    """Jeder Test bekommt ein eigenes data/-Verzeichnis."""
    from football_studio import config, db

    monkeypatch.setattr(config, "DATA_DIR", tmp_path)
    monkeypatch.setattr(config, "PROJECTS_DIR", tmp_path / "projects")
    monkeypatch.setattr(config, "CACHE_DIR", Path(os.environ.get("FSS_TEST_CACHE", ROOT / "data" / "cache")))
    monkeypatch.setattr(config, "SETTINGS_FILE", tmp_path / "settings.json")
    monkeypatch.setattr(config, "DB_FILE", tmp_path / "studio.db")
    monkeypatch.setattr(db, "DB_FILE", tmp_path / "studio.db")
    from football_studio import projects

    monkeypatch.setattr(projects, "PROJECTS_DIR", tmp_path / "projects")
    yield tmp_path


@pytest.fixture
def research_fixture():
    return json.loads((FIX / "research_deisler.json").read_text("utf-8"))


def live() -> bool:
    return os.environ.get("FSS_LIVE") == "1"
