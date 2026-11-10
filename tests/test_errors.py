"""every error reaches the page as one short sentence, never a stock phrase, a field list or a library's words"""


import anthropic
import httpx2 as httpx
import pytest
from fastapi.testclient import TestClient

from app.config import settings
from app.errors import plain_detail, validation_message
from app.main import create_app, friendly_error

from .fakes import fake_client, message, signed_in, text_block


@pytest.fixture
def make(tmp_path):
    def build(replies=()):
        claude = fake_client(replies)
        app = create_app(settings(db_path=tmp_path / "errors.db"), client=claude)
        return app, claude
    return build


def test_a_form_that_fails_its_checks_says_what_to_fix_in_one_sentence(make):
    app, _ = make()
    web = signed_in(TestClient(app))
    too_long = web.post("/api/reminders", json={"kind": "exam", "title": "x" * 121, "mode": "science", "due_date": "2030-01-01"})
    assert too_long.status_code == 422 and too_long.json()["detail"] == "Title is too long. Keep it under 120 characters."
    missing = web.post("/api/reminders", json={"kind": "exam", "mode": "science", "due_date": "2030-01-01"})
    assert missing.json()["detail"] == "Title is missing."
    choice = web.post("/api/reminders", json={"kind": "party", "title": "Paper", "mode": "science", "due_date": "2030-01-01"})
    # the app's own check words it better still, and that passes through
    assert choice.json()["detail"].startswith("Pick exam")
    garbled = web.post("/api/reminders", content=b"{not json", headers={"Content-Type": "application/json"})
    assert garbled.json()["detail"] == "That couldn't be read. Refresh and try again."


def test_messages_from_the_apps_own_checks_pass_through():
    errors = [{"type": "value_error", "loc": ("body", "due_date"), "msg": "Value error, Pick a real date."}]
    assert validation_message(errors) == "Pick a real date."
    assert validation_message([{"type": "int_parsing", "loc": ("query", "offset"), "msg": "x"}]) == "Week must be a number."
    assert validation_message([{"type": "string_too_short", "loc": ("body", "name"), "msg": "x", "ctx": {"min_length": 1}}]) == "Name can't be empty."


def test_stock_phrases_become_plain_messages_and_written_ones_stay(make):
    app, _ = make()
    web = signed_in(TestClient(app))
    assert web.get("/api/no-such-thing").json()["detail"] == "That isn't here any more."
    assert web.delete("/api/me/parent").json()["detail"] in ("That can't be done here.", "That isn't here any more.")
    assert plain_detail(404, "Not Found") == "That isn't here any more."
    assert plain_detail(400, "Write a question first.") == "Write a question first."
    assert plain_detail(418, "") == "That didn't work. Check it and try again."
    # signed out, the app's own words
    assert TestClient(app).get("/api/me").json()["detail"] == "Sign in to keep going."


def test_a_crash_says_only_that_something_broke(make, monkeypatch):
    app, _ = make()
    web = signed_in(TestClient(app, raise_server_exceptions=False))
    import app.store as store_module
    monkeypatch.setattr(store_module.store, "list_sets", lambda *a, **k: 1 / 0)
    broke = web.get("/api/sets")
    assert broke.status_code == 500 and broke.json() == {"detail": "Something broke on our side. Try again."}


def test_claude_errors_are_told_plainly_and_setup_problems_go_to_the_admin(caplog):
    request = httpx.Request("POST", "https://api.anthropic.com/v1/messages")

    def status(cls, code):
        return cls("raw api words", response=httpx.Response(code, request=request), body=None)

    with caplog.at_level("ERROR", logger="rahah"):
        assert friendly_error(status(anthropic.AuthenticationError, 401)) == "Rahah can't answer right now. Try again later."
    # the student sees nothing about keys, the admin's log does
    assert "api key" in caplog.text
    assert friendly_error(status(anthropic.RateLimitError, 429)) == "Rahah is busy. Try again in a moment."
    assert friendly_error(status(anthropic.InternalServerError, 529)) == "Rahah's AI is having trouble. Try again in a moment."
    assert "raw api words" not in friendly_error(status(anthropic.BadRequestError, 400))
    assert friendly_error(anthropic.APIConnectionError(request=request)) == "Couldn't reach Rahah's AI. Try again in a moment."


def test_a_crash_mid_answer_ends_with_a_message_not_a_dropped_line(make, monkeypatch):
    app, _ = make([message([text_block("Hello")])])
    web = signed_in(TestClient(app))
    chat = web.post("/api/conversations", json={"mode": "general"}).json()["id"]
    import app.main as main_module
    monkeypatch.setattr(main_module, "display_from_content", lambda *a, **k: 1 / 0)
    reply = web.post(f"/api/conversations/{chat}/messages", json={"text": "hi"})
    assert reply.status_code == 200
    assert '"t": "error", "v": "Something broke on our side. Try again."' in reply.text
