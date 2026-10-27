import json

import pytest
from fastapi.testclient import TestClient

from app.config import settings
from app.main import create_app
from app.modes import modes

from .fakes import fake_client, message, page_citation, text_block, thinking_block

pdf_bytes = b"%PDF-1.4 fake pdf for tests"


@pytest.fixture
def setup(tmp_path):
    def build(replies=()):
        claude = fake_client(replies)
        app = create_app(settings(db_path=tmp_path / "test.db"), client=claude)
        return TestClient(app), claude
    return build


def read_events(response):
    return [json.loads(line[6:]) for line in response.text.split("\n") if line.startswith("data: ")]


def new_chat(web, mode="general"):
    return web.post("/api/conversations", json={"mode": mode}).json()["id"]


def ask(web, conversation_id, text, mode="general", file_ids=()):
    response = web.post(
        f"/api/conversations/{conversation_id}/messages",
        json={"text": text, "mode": mode, "file_ids": list(file_ids)},
    )
    assert response.status_code == 200
    return read_events(response)


def test_page_and_modes_load(setup):
    web, _ = setup()
    assert "Rahah" in web.get("/").text
    body = web.get("/api/modes").json()
    assert body["default"] == "general"
    assert {m["id"] for m in body["modes"]} == set(modes)


def test_a_full_turn_streams_saves_and_cites(setup):
    reply = message([
        thinking_block(),
        text_block("Osmosis moves water", [page_citation("water moves", 2, 3)]),
        text_block(" across membranes."),
    ])
    web, claude = setup([reply])
    conversation_id = new_chat(web)

    upload = web.post(
        "/api/files",
        data={"conversation_id": conversation_id},
        files={"file": ("notes.pdf", pdf_bytes, "application/pdf")},
    )
    assert upload.status_code == 200
    file_id = upload.json()["id"]

    events = ask(web, conversation_id, "what is osmosis?", file_ids=[file_id])
    kinds = [e["t"] for e in events]
    assert kinds[0] == "text" and "cite" in kinds and kinds[-1] == "done"
    streamed = "".join(e["v"] if e["t"] == "text" else e["v"]["marks"] for e in events[:-1])
    assert streamed == events[-1]["v"]["text"]

    call = claude.beta.messages.calls[0]
    assert call["model"] == "claude-opus-5-5"
    assert call["fallbacks"] == "default"
    assert call["output_config"] == {"effort": "medium"}
    sent = call["messages"]
    assert [m["role"] for m in sent] == ["user", "system"]
    assert sent[0]["content"][0]["source"]["file_id"] == file_id

    saved = web.get(f"/api/conversations/{conversation_id}").json()
    assert saved["title"] == "what is osmosis?"
    assert [m["role"] for m in saved["messages"]] == ["user", "assistant"]
    assert saved["messages"][1]["sources"][0]["where"] == "p. 2"

    # the file was used, so it can't be attached a second time
    again = web.post(
        f"/api/conversations/{conversation_id}/messages",
        json={"text": "again", "file_ids": [file_id]},
    )
    assert again.status_code == 400


def test_history_is_replayed_unchanged_and_mode_notes_only_on_change(setup):
    first = message([thinking_block(), text_block("first answer")])
    web, claude = setup([first, message([text_block("second")]), message([text_block("third")])])
    conversation_id = new_chat(web)

    ask(web, conversation_id, "one")
    ask(web, conversation_id, "two")
    ask(web, conversation_id, "three", mode="maths")

    calls = claude.beta.messages.calls
    second_call = calls[1]["messages"]
    assert [m["role"] for m in second_call] == ["user", "system", "assistant", "user"]
    assert second_call[2]["content"][0] == {"type": "thinking", "thinking": "", "signature": "sig123"}

    third_call = calls[2]["messages"]
    assert third_call[:4] == second_call
    assert [m["role"] for m in third_call[4:]] == ["assistant", "user", "system"]
    assert third_call[-1]["content"] == modes["maths"]["instruction"]


def test_refusals_are_not_saved(setup):
    web, _ = setup([message([], stop_reason="refusal")])
    conversation_id = new_chat(web)
    events = ask(web, conversation_id, "something declined")
    assert events[-1]["t"] == "refusal"
    assert web.get(f"/api/conversations/{conversation_id}").json()["messages"] == []


def test_missing_api_key_gives_a_clear_message(setup):
    error = TypeError("Could not resolve authentication method. Expected one of api_key")
    web, _ = setup([error])
    conversation_id = new_chat(web)
    events = ask(web, conversation_id, "hello")
    assert events == [{"t": "error", "v": events[0]["v"]}]
    assert "ANTHROPIC_API_KEY" in events[0]["v"]


def test_uploads_are_checked(setup):
    web, claude = setup()
    conversation_id = new_chat(web)

    def upload(name, data):
        return web.post("/api/files", data={"conversation_id": conversation_id}, files={"file": (name, data)})

    assert upload("virus.exe", b"MZ").status_code == 400
    assert upload("fake.pdf", b"MZ not a pdf").status_code == 400
    assert upload("empty.pdf", b"").status_code == 400
    assert upload("notes.md", "# heading\nété".encode()).json()["kind"] == "document"
    assert upload("photo.png", b"\x89PNG\r\n rest").json()["kind"] == "image"
    assert len(claude.files.uploads) == 2


def test_unknown_conversations_and_modes_are_rejected(setup):
    web, _ = setup()
    assert web.get("/api/conversations/nope").status_code == 404
    assert web.post("/api/conversations", json={"mode": "astrology"}).status_code == 400
    conversation_id = new_chat(web)
    bad = web.post(f"/api/conversations/{conversation_id}/messages", json={"text": "hi", "mode": "astrology"})
    assert bad.status_code == 400


def test_deleting_a_conversation_removes_it(setup):
    web, _ = setup([message([text_block("hi")])])
    conversation_id = new_chat(web)
    ask(web, conversation_id, "hello")
    assert len(web.get("/api/conversations").json()["conversations"]) == 1
    web.delete(f"/api/conversations/{conversation_id}")
    assert web.get("/api/conversations").json()["conversations"] == []
