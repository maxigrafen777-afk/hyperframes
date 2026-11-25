"""Schritt 2–4: Medienbibliothek, Import, Lizenz-Gate, Suche, Szenenzuordnung."""

import datetime as dt

import pytest

from newsstudio import db
from newsstudio.config import Settings
from newsstudio.library import entities, importer, license, search
from newsstudio.scenes import matcher

TODAY = dt.date(2026, 11, 25)


def _seed_people():
    entities.seed_static()
    entities.upsert("spieler", "Harry Kane", [], "Q186720", "FC Bayern München")
    entities.upsert("spieler", "Jamal Musiala", [], "Q55615486", "FC Bayern München")
    entities.upsert("trainer", "Vincent Kompany", [], "Q193058", "FC Bayern München")


def _confirm(source: str, **over):
    pid = importer.default_profile_id(source)
    data = {"platforms": "tiktok,instagram,youtube", "commercial": 1, "valid_until": "2027-12-31", "confirmed": 1}
    data.update(over)
    license.save_profile(data, pid)
    return pid


@pytest.fixture
def lib(env, testlib):
    _seed_people()
    stats = importer.scan(testlib, log=lambda m: None, is_test=True)
    assert stats["fehler"] == 0, stats
    return stats


def test_import_reads_metadata_and_entities(lib):
    assert lib["neu"] == 9
    kane = search.search("Harry Kane")
    names = {m["filename"] for m in kane}
    assert {"MAXPPP_Kane_FCB_2026.jpg", "MAXPPP_Kane_Tottenham_2022.jpg",
            "2026-11-08_FCB-BVB_Kane_goal_highlights.mp4"} <= names
    vid = next(m for m in kane if m["kind"] == "video")
    assert vid["source"] == "PressBox" and vid["competition"] == "Bundesliga" and vid["captured_at"] == "2026-11-08"
    assert len(vid["shots"]) == 3  # drei harte Schnitte erkannt
    foto = next(m for m in kane if m["filename"] == "MAXPPP_Kane_FCB_2026.jpg")
    assert foto["source"] == "MAXPPP" and foto["byline"] == "Test Fotograf" and foto["captured_at"] == "2026-11-08"
    eberl = search.search("Max Eberl")
    assert any(m["kind"] == "video" and m["shots"][0]["kind"] == "interview" for m in eberl)


def test_reimport_is_idempotent(lib, testlib):
    again = importer.scan(testlib, log=lambda m: None)
    assert again["unverändert"] == 9 and again["neu"] == 0


def test_license_gate_blocks_everything_until_confirmed(lib):
    assert all(not m["usable"] for m in search.search())
    assert all(m["license_status"] == "unklar" for m in search.search())
    _confirm("MAXPPP")
    fotos = search.search(source="MAXPPP")
    assert all(m["usable"] and m["credit_line"].startswith("Foto: Test Fotograf / MAXPPP") for m in fotos)
    assert all(not m["usable"] for m in search.search(source="PressBox"))


@pytest.mark.parametrize("over,status", [
    ({"valid_until": "2026-01-01"}, "abgelaufen"),
    ({"platforms": "youtube"}, "nicht_erlaubt"),
    ({"commercial": 0}, "nicht_erlaubt"),
    ({"commercial": None}, "unklar"),
    ({"valid_until": None, "unlimited": 0}, "unklar"),
    ({"valid_until": "2026-12-10"}, "läuft_bald_ab"),
    ({"confirmed": 0}, "unklar"),
])
def test_license_rules(lib, over, status):
    pid = _confirm("MAXPPP", **over)
    m = db.one("SELECT * FROM media WHERE source='MAXPPP' LIMIT 1")
    assert license.check(m, license.profile(pid), Settings(), today=TODAY)["status"] == status


def test_file_override_and_block(lib):
    _confirm("MAXPPP")
    m = db.one("SELECT * FROM media WHERE filename='MAXPPP_Musiala_01.jpg'")
    db.execute("UPDATE media SET lic_valid_until='2026-02-01' WHERE id=?", (m["id"],))
    assert license.check_media(m["id"])["status"] == "abgelaufen"
    db.execute("UPDATE media SET lic_valid_until=NULL, blocked=1 WHERE id=?", (m["id"],))
    assert license.check_media(m["id"])["status"] == "gesperrt"


def test_matching_prefers_current_club_and_video(lib):
    _confirm("MAXPPP")
    _confirm("PressBox")
    r = matcher.candidates("Harry Kane könnte den FC Bayern im Sommer verlassen.", Settings(), today=TODAY)
    files = [o["filename"] for o in r["options"]]
    assert files[0] == "2026-11-08_FCB-BVB_Kane_goal_highlights.mp4"
    assert files.index("MAXPPP_Kane_FCB_2026.jpg") < files.index("MAXPPP_Kane_Tottenham_2022.jpg")
    assert all("Kane" in f for f in files)
    assert not r["warnings"]


def test_matching_picks_interview_for_quotes(lib):
    _confirm("MAXPPP")
    _confirm("PressBox")
    r = matcher.candidates("Max Eberl erklärte die Debatte am Freitag für beendet.", Settings(), today=TODAY)
    top = r["options"][0]
    assert top["kind"] == "video" and top["shot"]["kind"] == "interview"


def test_matching_warns_without_licensed_material(lib):
    _confirm("MAXPPP")  # PressBox bleibt unbestätigt
    entities.upsert("spieler", "Florian Wirtz", [], "Q60744441", "FC Liverpool")
    r = matcher.candidates("Florian Wirtz glänzt in Liverpool.", Settings(), today=TODAY)
    assert r["options"] == [] and r["warnings"]
    r = matcher.candidates("Harry Kane trifft erneut.", Settings(), today=TODAY)
    assert r["options"] and all(o["kind"] == "foto" for o in r["options"])
    assert any("Keine lizenzierten Videos" in w for w in r["warnings"])
