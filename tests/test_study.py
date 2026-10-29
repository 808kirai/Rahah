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


# written questions, marked by claude

png_bytes = b"\x89PNG\r\n\x1a\n" + b"fake png body"

mixed = {"title": "Forces", "questions": [
    {"type": "choice", "question": "Unit of force?", "options": ["newton", "joule", "watt", "pascal"], "answer": 0,
     "explanation": "Force is measured in newtons.", "marks": 1, "mark_scheme": "", "model_answer": ""},
    {"type": "written", "question": "State Newton's second law.", "options": [], "answer": -1, "explanation": "",
     "marks": 2, "mark_scheme": "Force equals mass times acceleration (1). Named or shown as F = ma (1).",
     "model_answer": "The resultant force equals mass times acceleration, F = ma."},
    {"type": "written", "question": "  ", "options": [], "answer": -1, "explanation": "",
     "marks": 3, "mark_scheme": "dropped, no question", "model_answer": "x"},
]}


def make_mixed(web):
    made = web.post("/api/sets", data={"kind": "quiz", "topic": "forces", "count": "3", "mode": "science", "style": "mixed"})
    assert made.status_code == 200
    return made.json()


def test_a_mixed_test_keeps_both_kinds_and_is_scored_in_marks(setup):
    web, claude = setup([reply(mixed)])
    body = make_mixed(web)
    assert [q["type"] for q in body["items"]] == ["choice", "written"]
    assert body["items"][1]["marks"] == 2
    assert "half multiple choice and half written" in claude.beta.messages.calls[0]["messages"][0]["content"][0]["text"]
    listed = web.get("/api/sets").json()["sets"][0]
    assert listed["marks"] == 3 and listed["written"]
    # a score is out of the marks, 1 for the choice question and 2 for the written one
    assert web.post(f"/api/sets/{body['id']}/score", json={"score": 3}).json()["best_score"] == 3
    assert web.post(f"/api/sets/{body['id']}/score", json={"score": 4}).status_code == 400
    assert web.post("/api/sets", data={"kind": "quiz", "topic": "x", "style": "essay"}).status_code == 400


def test_a_written_answer_is_marked_from_text_or_a_photo(setup):
    web, claude = setup([reply(mixed), reply({"score": 5, "feedback": "You gave F = ma."}), reply({"score": 1, "feedback": "Half right."})])
    body = make_mixed(web)
    marked = web.post(f"/api/sets/{body['id']}/mark", data={"index": "1", "answer": "force is mass times acceleration"}).json()
    # a score over the question's marks comes back down to them
    assert marked == {"score": 2, "marks": 2, "feedback": "You gave F = ma.", "model_answer": body["items"][1]["model_answer"]}
    call = claude.beta.messages.calls[1]
    text = call["messages"][0]["content"][-1]["text"]
    assert "worth 2 marks" in text and "Mark scheme" in text and "force is mass times acceleration" in text

    photo = web.post(f"/api/sets/{body['id']}/mark", data={"index": "1"}, files={"photo": ("working.png", png_bytes, "image/png")})
    assert photo.json()["score"] == 1
    sent = claude.beta.messages.calls[2]["messages"][0]["content"]
    assert sent[0]["type"] == "image" and "in the photo" in sent[-1]["text"]


def test_marking_is_refused_when_it_doesnt_fit(setup):
    web, _ = setup([reply(mixed)])
    body = make_mixed(web)
    # the multiple choice question is marked on the page, not by claude
    assert web.post(f"/api/sets/{body['id']}/mark", data={"index": "0", "answer": "newton"}).status_code == 400
    assert web.post(f"/api/sets/{body['id']}/mark", data={"index": "9", "answer": "x"}).status_code == 400
    assert web.post(f"/api/sets/{body['id']}/mark", data={"index": "1", "answer": "  "}).status_code == 400
    not_a_photo = web.post(f"/api/sets/{body['id']}/mark", data={"index": "1"}, files={"photo": ("notes.pdf", pdf_bytes, "application/pdf")})
    assert not_a_photo.status_code == 400


def test_flashcards_move_up_when_known_and_back_when_not(setup):
    web, _ = setup([reply(cards)])
    deck = web.post("/api/sets", data={"kind": "flashcards", "topic": "cells"}).json()
    assert deck["progress"] == {}
    rate = lambda card, known: web.post(f"/api/sets/{deck['id']}/cards", json={"card": card, "known": known}).json()
    assert rate(0, True) == {"box": 2, "known": 1}
    assert rate(0, True)["box"] == 3
    assert rate(1, False) == {"box": 1, "known": 1}
    # still learning sends a card back to the first box
    assert rate(0, False) == {"box": 1, "known": 0}
    for _ in range(6):
        last = rate(1, True)
    assert last["box"] == 5
    assert web.get(f"/api/sets/{deck['id']}").json()["progress"] == {"0": 1, "1": 5}
    assert web.get("/api/sets").json()["sets"][0]["known"] == 1
    assert web.post(f"/api/sets/{deck['id']}/cards", json={"card": 9, "known": True}).status_code == 400
    # deleting the deck clears its progress
    web.delete(f"/api/sets/{deck['id']}")
    assert web.post(f"/api/sets/{deck['id']}/cards", json={"card": 0, "known": True}).status_code == 404


def test_a_past_paper_becomes_a_test_of_its_own_questions(setup):
    paper = {"title": "Physics 2024 Paper 1", "questions": [
        {"type": "written", "question": "Explain how a transformer works.", "options": [], "answer": -1, "explanation": "",
         "marks": 12, "mark_scheme": "points (12)", "model_answer": "An alternating current..."},
    ]}
    web, claude = setup([reply(paper)])
    # the paper itself has to be attached
    assert web.post("/api/sets", data={"kind": "quiz", "topic": "physics", "style": "paper"}).status_code == 400
    made = web.post(
        "/api/sets", data={"kind": "quiz", "style": "paper", "count": "20"},
        files=[("files", ("paper.pdf", pdf_bytes, "application/pdf"))],
    ).json()
    assert made["title"] == "Physics 2024 Paper 1"
    # a long exam question keeps its 12 marks
    assert made["items"][0]["marks"] == 12
    text = claude.beta.messages.calls[0]["messages"][0]["content"][-1]["text"]
    assert "past exam paper" in text and "at most 20" in text


def test_cards_come_due_after_their_gap_and_the_nudge_counts_them(setup):
    from datetime import date as _date, timedelta as _td
    web, _ = setup([reply(cards)])
    deck = web.post("/api/sets", data={"kind": "flashcards", "topic": "cells"}).json()
    web.post(f"/api/sets/{deck['id']}/cards", json={"card": 0, "known": False})  # box 1, due after a day
    web.post(f"/api/sets/{deck['id']}/cards", json={"card": 1, "known": True})   # box 2, due after two days
    today = _date.today()
    nudge = web.get("/api/today", params={"today": today.isoformat(), "weekday": today.weekday()}).json()
    # nothing is due straight after practising
    assert nudge["cards_due"] == 0 and nudge["deck"] is None and nudge["exam"] is None and nudge["classes"] == []
    web.post("/api/reminders", json={"kind": "exam", "title": "Biology paper 2", "due_date": (today + _td(days=5)).isoformat()})
    web.post("/api/timetable", json={"title": "Chemistry", "day": today.weekday(), "start_time": "13:00", "end_time": "14:00"})
    nudge = web.get("/api/today", params={"today": today.isoformat(), "weekday": today.weekday()}).json()
    assert nudge["exam"]["title"] == "Biology paper 2" and nudge["exam"]["days"] == 5
    assert nudge["classes"][0]["title"] == "Chemistry"
    assert web.get("/api/today", params={"today": "nope", "weekday": 1}).status_code == 422


def test_due_cards_follow_the_box_gaps(tmp_path):
    import time as _time
    from app.store import store
    db = store(tmp_path / "due.db")
    deck = db.add_set("flashcards", "Cells", "science", [{"front": "a", "back": "b"}] * 3)
    db.rate_card(deck, 0, False)  # box 1
    db.rate_card(deck, 1, True)   # box 2
    db.rate_card(deck, 2, True)
    db.rate_card(deck, 2, True)   # box 3
    now = _time.time()
    assert db.due_cards(now) == []
    # a day later only the box 1 card is due, two days later box 2 joins it, four days later all three
    assert db.due_cards(now + 86400)[0]["due"] == 1
    assert db.due_cards(now + 2 * 86400)[0]["due"] == 2
    assert db.due_cards(now + 4 * 86400)[0] == {"id": deck, "title": "Cells", "due": 3}
