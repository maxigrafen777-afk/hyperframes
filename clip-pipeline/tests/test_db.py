import pytest

from pipeline.db import DB, InvalidTransition
from pipeline.models import Candidate, Judgment, Signals, Status


class Clock:
    def __init__(self, t=1000.0):
        self.t = t

    def __call__(self):
        return self.t


SIG = Signals(burst=30, median=5, mad=2, z=6, unique_users=20, unique_ratio=0.8,
              hype_ratio=0.5, clip_calls=0, reason="z")


def cand(start, end, score=0.5, streamer="twitch:a", live=True):
    return Candidate(streamer=streamer, trigger_ts=end - 8, moment_ts=end - 12,
                     start_ts=start, end_ts=end, pre_score=score, signals=SIG, live=live)


def judgment(hype=8):
    return Judgment(keep=True, hype=hype, start_s=2, end_s=20, peak_s=10)


@pytest.fixture
def db():
    d = DB(":memory:", clock=Clock())
    yield d
    d.close()


def test_full_lifecycle(db):
    cid = db.add_candidate(cand(0, 30), raw_path="raw.mp4")
    for frm, to in [(Status.NEW, Status.TRANSCRIBED), (Status.TRANSCRIBED, Status.JUDGED),
                    (Status.JUDGED, Status.RENDERED), (Status.RENDERED, Status.DELIVERED),
                    (Status.DELIVERED, Status.POSTED)]:
        clip = db.claim(frm, "w")
        assert clip and clip.id == cid
        db.advance(cid, to, judgment=judgment() if to == Status.JUDGED else None)
    c = db.get(cid)
    assert c.status == Status.POSTED and c.hype == 8 and c.raw_path == "raw.mp4"


def test_invalid_transition(db):
    cid = db.add_candidate(cand(0, 30))
    with pytest.raises(InvalidTransition):
        db.advance(cid, Status.RENDERED)


def test_lease_blocks_then_expires(db):
    db.add_candidate(cand(0, 30))
    assert db.claim(Status.NEW, "w1", lease_s=60)
    assert db.claim(Status.NEW, "w2") is None   # noch geleast
    db.clock.t += 61                            # w1 ist abgestürzt
    assert db.claim(Status.NEW, "w2")


def test_fail_retries_then_fails(db):
    cid = db.add_candidate(cand(0, 30))
    for _ in range(2):
        db.claim(Status.NEW, "w")
        assert db.fail(cid, "boom") == Status.NEW
    db.claim(Status.NEW, "w")
    assert db.fail(cid, "boom") == Status.FAILED


def test_duplicate_keeps_stronger(db):
    a = db.add_candidate(cand(0, 30, score=0.5))
    assert db.add_candidate(cand(10, 40, score=0.4)) is None        # schwächer
    b = db.add_candidate(cand(10, 40, score=0.9))                   # stärker
    assert b and db.get(a).status == Status.REJECTED
    assert db.add_candidate(cand(10, 40, score=0.9, streamer="twitch:b"))  # anderer Streamer


def test_priority_live_then_hype(db):
    old = db.add_candidate(cand(0, 30, score=0.9, live=False))
    weak = db.add_candidate(cand(100, 130, score=0.4))
    strong = db.add_candidate(cand(200, 230, score=0.8))
    order = [db.claim(Status.NEW, "w").id for _ in range(3)]
    assert order == [strong, weak, old]
