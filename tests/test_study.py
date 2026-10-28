import json

import pytest
from fastapi.testclient import TestClient

from app.config import settings
from app.main import create_app
from app.study import clean_quiz, clean_text

from .fakes import fake_client, message, text_block

pdf_bytes = b"%PDF-1.4 fake pdf for tests"


@pytest.fixture
def setup(tmp_path):
    def build(replies=()):
        claude = fake_client(replies)
        app = create_app(settings(db_path=tmp_path / "study.db"), client=claude)
        return TestClient(app), claude
    return build


def reply(data, stop_reason="end_turn"):
    return message([text_block(json.dumps(data))], stop_reason=stop_reason)


cards = {"title": "Cell biology", "cards": [
    {"front": "What does osmosis move?", "back": "Water"},
    {"front": "  ", "back": "dropped, the front is blank"},
    {"front": "Powerhouse of the cell?", "back": "The mitochondrion"},
]}


def test_flashcards_are_made_checked_and_saved(setup):
    web, claude = setup([reply(cards)])
    made = web.post("/api/sets", data={"kind": "flashcards", "topic": "cells", "count": "10", "mode": "science"})
    assert made.status_code == 200
    body = made.json()
    assert body["title"] == "Cell biology" and body["kind"] == "flashcards"
    assert [c["front"] for c in body["items"]] == ["What does osmosis move?", "Powerhouse of the cell?"]
    assert body["size"] == 2

    call = claude.beta.messages.calls[0]
    assert call["output_config"]["format"]["type"] == "json_schema"
    assert call["output_config"]["effort"] == "medium"
    assert call["fallbacks"] == "default"
    sent = call["messages"][0]["content"]
    assert len(sent) == 1 and "Topic: cells" in sent[0]["text"] and "exactly 10 flashcards" in sent[0]["text"]

    listed = web.get("/api/sets").json()["sets"]
    assert [s["id"] for s in listed] == [body["id"]]
    assert web.get(f"/api/sets/{body['id']}").json()["items"] == body["items"]


def test_notes_are_sent_inline_without_citations(setup):
    web, claude = setup([reply(cards)])
    made = web.post(
        "/api/sets",
        data={"kind": "flashcards"},
        files=[("files", ("notes.pdf", pdf_bytes, "application/pdf")), ("files", ("extra.txt", b"plain notes", "text/plain"))],
    )
    assert made.status_code == 200
    blocks = claude.beta.messages.calls[0]["messages"][0]["content"]
    assert [b["type"] for b in blocks] == ["document", "document", "text"]
    assert blocks[0]["source"]["type"] == "base64" and blocks[0]["title"] == "notes.pdf"
    assert blocks[1]["source"] == {"type": "text", "media_type": "text/plain", "data": "plain notes"}
    assert all("citations" not in b for b in blocks)
    assert "Use the attached notes." in blocks[2]["text"]


def test_quiz_questions_are_checked_and_scores_keep_the_best(setup):
    quiz = {"title": "Capitals", "questions": [
        {"question": "Capital of France?", "options": ["Paris", "Rome", "Oslo", "Lima"], "answer": 0, "explanation": "Paris is."},
        {"question": "Answer out of range", "options": ["a", "b"], "answer": 5, "explanation": ""},
        {"question": "Duplicate options", "options": ["a", "a", "b"], "answer": 0, "explanation": ""},
    ]}
    web, _ = setup([reply(quiz)])
    body = web.post("/api/sets", data={"kind": "quiz", "topic": "capitals", "mode": "exam"}).json()
    assert body["size"] == 1
    q = body["items"][0]
    assert q["options"][q["answer"]] == "Paris"

    assert web.post(f"/api/sets/{body['id']}/score", json={"score": 1}).json() == {"best_score": 1}
    assert web.post(f"/api/sets/{body['id']}/score", json={"score": 0}).json() == {"best_score": 1}
    assert web.post(f"/api/sets/{body['id']}/score", json={"score": 2}).status_code == 400

    assert web.delete(f"/api/sets/{body['id']}").status_code == 200
    assert web.get(f"/api/sets/{body['id']}").status_code == 404


def test_shuffled_options_keep_the_right_answer():
    data = {"questions": [{"question": "q", "options": ["right", "w1", "w2", "w3"], "answer": 0, "explanation": ""}]}
    for _ in range(20):
        q = clean_quiz(data, 5)[0]
        assert q["options"][q["answer"]] == "right"


def test_latex_escaped_twice_is_put_right():
    assert clean_text("Solve \\\\( x^2 = 4 \\\\) with \\\\frac{1}{2}") == "Solve \\( x^2 = 4 \\) with \\frac{1}{2}"
    assert clean_text("\\( a \\\\ b \\)") == "\\( a \\\\ b \\)"


def test_bad_requests_and_bad_replies_give_clear_errors(setup):
    web, _ = setup([
        message([], stop_reason="refusal"),
        message([text_block("not json")]),
        reply({"title": "x", "cards": []}),
    ])
    assert web.post("/api/sets", data={"kind": "flashcards"}).status_code == 400
    assert web.post("/api/sets", data={"kind": "poster", "topic": "x"}).status_code == 400
    assert web.post("/api/sets", data={"kind": "quiz", "topic": "x", "mode": "nope"}).status_code == 400

    for _ in range(3):
        failed = web.post("/api/sets", data={"kind": "flashcards", "topic": "x"})
        assert failed.status_code == 422
        assert failed.json()["detail"]
    assert web.get("/api/sets").json()["sets"] == []


def test_modes_come_with_their_groups(setup):
    web, _ = setup()
    body = web.get("/api/modes").json()
    assert list(body["groups"]) == ["study", "exam", "code"]
    assert all(m["group"] in body["groups"] for m in body["modes"])
