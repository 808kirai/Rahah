import json

import pytest
from fastapi.testclient import TestClient

from app.config import settings
from app.main import create_app
from app.recommend import clean, describe_history

from .fakes import fake_client, message, text_block
from .test_api import ask, new_chat


def picks(*items):
    return message([text_block(json.dumps({"recommendations": list(items)}))])


def pick(**fields):
    base = {
        "kind": "next", "title": "Chain rule", "reason": "You just learned derivatives.", "mode": "maths",
        "action": "ask", "prompt": "Teach me the chain rule.", "set_id": "",
    }
    return {**base, **fields}


@pytest.fixture
def setup(tmp_path):
    def build(replies=()):
        claude = fake_client(replies)
        app = create_app(settings(db_path=tmp_path / "rec.db"), client=claude)
        return TestClient(app), claude
    return build


def test_nothing_studied_means_nothing_to_suggest(setup):
    web, claude = setup()
    body = web.get("/api/recommendations").json()
    assert body == {"items": [], "created": None, "fresh": False, "has_activity": False}
    assert web.post("/api/recommendations").status_code == 400
    assert claude.beta.messages.calls == []


def test_suggestions_are_made_from_history_and_kept_until_something_new_happens(setup):
    web, claude = setup([
        message([text_block("A derivative is a rate of change.")]),
        picks(pick(), pick(kind="review", title="Bad subject", mode="astrology")),
        message([text_block("Sure.")]),
    ])
    conversation_id = new_chat(web, mode="maths")
    ask(web, conversation_id, "what is a derivative?", mode="maths")

    before = web.get("/api/recommendations").json()
    assert before["has_activity"] and not before["fresh"]

    made = web.post("/api/recommendations").json()
    assert [i["title"] for i in made["items"]] == ["Chain rule"]
    assert made["fresh"]

    call = claude.beta.messages.calls[1]
    assert call["output_config"]["effort"] == "low"
    assert call["output_config"]["format"]["type"] == "json_schema"
    assert "what is a derivative?" in call["messages"][0]["content"]

    # studying something new makes the saved picks stale, but they're still shown
    ask(web, conversation_id, "and integrals?", mode="maths")
    after = web.get("/api/recommendations").json()
    assert not after["fresh"] and after["items"] == made["items"]


def test_reopening_a_set_needs_a_real_set():
    sets = {"set_a"}
    good = pick(action="open", prompt="ignored", set_id="set_a")
    missing = pick(action="open", set_id="set_gone")
    empty_prompt = pick(prompt="")
    picked = clean({"recommendations": [good, missing, empty_prompt]}, sets)
    assert len(picked) == 1
    assert picked[0]["set_id"] == "set_a" and picked[0]["prompt"] == ""


def test_history_mentions_weak_scores():
    results = {
        "overall": {"attempts": 1},
        "subjects": [{"mode": "science", "average": 40, "grade": "E", "attempts": 1}],
        "quizzes": [{"id": "q1", "title": "Cells", "mode": "science", "latest": 40, "best": 40}],
    }
    text = describe_history([], [], results)
    assert "Science: 40% average" in text and "Cells" in text
