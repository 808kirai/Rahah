import json

import pytest
from fastapi.testclient import TestClient

from app.config import settings
from app.main import create_app
from app.usage import cost_of, summarise

from .fakes import signed_in, fake_client, message, text_block


def use(model="claude-opus-5-5", **counts):
    return {"model": model, "input_tokens": 0, "output_tokens": 0, "cache_read": 0, "cache_write": 0, "searches": 0, **counts}


def test_costs_follow_the_price_list():
    # a million input and output tokens on opus 5.5 is 4 and 20 dollars
    assert cost_of(use(input_tokens=1_000_000, output_tokens=1_000_000)) == 24.0
    # cache writes cost a quarter more than input, cache reads 20 cents a million, a search a cent
    assert cost_of(use(cache_write=1_000_000)) == 5.0
    assert cost_of(use(cache_read=1_000_000)) == 0.2
    assert cost_of(use(searches=3)) == 0.03
    assert cost_of(use("claude-haiku-5-5", input_tokens=1_000_000)) == 0.1
    assert cost_of(use("some-other-model", input_tokens=5)) is None


def test_totals_are_kept_per_window_with_the_cache_share():
    rows = [
        {**use(input_tokens=100, cache_read=300, output_tokens=50), "kind": "chat", "cost": 0.01, "created": 100},
        {**use(input_tokens=100, output_tokens=50), "kind": "marking", "cost": 0.02, "created": 200},
    ]
    report = summarise(rows, {"all": 0, "recent": 150})
    assert report["all"]["requests"] == 2 and report["all"]["cost"] == 0.03
    assert report["all"]["cache_share"] == 60
    assert report["all"]["kinds"][0] == {"kind": "marking", "requests": 1, "cost": 0.02}
    assert report["recent"]["requests"] == 1 and report["recent"]["cache_share"] == 0


@pytest.fixture
def setup(tmp_path):
    def build(replies=()):
        claude = fake_client(replies)
        return signed_in(TestClient(create_app(settings(db_path=tmp_path / "usage.db"), client=claude))), claude
    return build


def test_chats_tests_and_marking_are_logged(setup):
    written = {"title": "T", "questions": [{"type": "written", "question": "Why?", "options": [], "answer": -1,
               "explanation": "", "marks": 2, "mark_scheme": "a (1) b (1)", "model_answer": "a and b"}]}
    web, _ = setup([
        message([text_block("hi")]),
        message([text_block(json.dumps(written))]),
        message([text_block(json.dumps({"score": 1, "feedback": "ok"}))]),
    ])
    chat = web.post("/api/conversations", json={"mode": "general"}).json()["id"]
    web.post(f"/api/conversations/{chat}/messages", json={"text": "hello", "mode": "general", "file_ids": []})
    made = web.post("/api/sets", data={"kind": "quiz", "topic": "x", "count": "1", "style": "written"}).json()
    web.post(f"/api/sets/{made['id']}/mark", data={"index": "0", "answer": "a"})
    report = web.get("/api/usage").json()
    assert report["all"]["requests"] == 3 and report["today"]["requests"] == 3
    assert {k["kind"] for k in report["all"]["kinds"]} == {"chat", "quiz", "marking"}
    # the fake replies used 10 input and 20 output tokens each on opus 5.5
    assert report["all"]["cost"] == round(3 * (10 * 4 + 20 * 20) / 1_000_000, 4)
