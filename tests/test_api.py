import json

import pytest
from fastapi.testclient import TestClient

from app.config import settings
from app.main import create_app
from app.modes import modes

from .fakes import fake_client, message, page_citation, search_block, search_result, stopped_stream, text_block, thinking_block, web_citation

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


def test_the_page_and_its_files_are_checked_for_changes_on_every_load(setup):
    web, _ = setup()
    for path in ("/", "/static/style.css", "/static/app.js"):
        assert web.get(path).headers["cache-control"] == "no-cache"
    # an unchanged file comes back as a short not modified reply
    first = web.get("/static/style.css")
    again = web.get("/static/style.css", headers={"If-None-Match": first.headers["etag"]})
    assert again.status_code == 304
    # api replies are left alone
    assert "cache-control" not in web.get("/api/modes").headers


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


def test_haiku_is_not_sent_the_fallback_setting(tmp_path):
    claude = fake_client([message([text_block("hi")])])
    web = TestClient(create_app(settings(model="claude-haiku-5-5", db_path=tmp_path / "h.db"), client=claude))
    ask(web, new_chat(web), "hello")
    call = claude.beta.messages.calls[0]
    assert call["model"] == "claude-haiku-5-5"
    assert "fallbacks" not in call and "betas" not in call


def test_rahah_knows_who_created_her(setup):
    web, claude = setup([message([text_block("hi")])])
    ask(web, new_chat(web), "who made you?")
    assert "created by Runie" in claude.beta.messages.calls[0]["system"]


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


def test_only_the_ten_newest_chats_are_listed(setup):
    web, _ = setup([message([text_block("hi")]) for _ in range(12)])
    for n in range(12):
        ask(web, new_chat(web), f"question {n}")
    assert len(web.get("/api/conversations").json()["conversations"]) == 10


def test_deleting_a_conversation_removes_it(setup):
    web, _ = setup([message([text_block("hi")])])
    conversation_id = new_chat(web)
    ask(web, conversation_id, "hello")
    assert len(web.get("/api/conversations").json()["conversations"]) == 1
    web.delete(f"/api/conversations/{conversation_id}")
    assert web.get("/api/conversations").json()["conversations"] == []


# the weekly timetable

def a_class(**changes):
    return {"title": "Biology", "mode": "", "day": 2, "start_time": "08:00", "end_time": "10:00", "place": "Lab 2", **changes}


def test_classes_are_saved_edited_and_listed_through_the_week(setup):
    web, _ = setup()
    later = web.post("/api/timetable", json=a_class(title="Chemistry", day=4)).json()
    first = web.post("/api/timetable", json=a_class(title="  Maths  ", day=0, start_time="11:00", end_time="12:30")).json()
    assert first["title"] == "Maths"
    listed = web.get("/api/timetable").json()["classes"]
    assert [c["title"] for c in listed] == ["Maths", "Chemistry"]
    edited = web.put(f"/api/timetable/{later['id']}", json=a_class(title="Chemistry", day=1, place="")).json()
    assert edited["day"] == 1 and edited["place"] == ""
    assert web.delete(f"/api/timetable/{first['id']}").json() == {"ok": True}
    assert [c["title"] for c in web.get("/api/timetable").json()["classes"]] == ["Chemistry"]


def test_bad_classes_are_rejected(setup):
    web, _ = setup()
    for bad in (a_class(title="   "), a_class(day=7), a_class(start_time="25:00"), a_class(end_time="07:00"), a_class(mode="astrology")):
        assert web.post("/api/timetable", json=bad).status_code == 422
    assert web.delete("/api/timetable/nope").status_code == 404
    assert web.put("/api/timetable/nope", json=a_class()).status_code == 404


def test_the_timetable_calendar_repeats_weekly_with_an_alert(setup):
    web, _ = setup()
    assert web.get("/api/timetable/calendar.ics").status_code == 404
    saved = web.post("/api/timetable", json=a_class(mode="biology" if "biology" in modes else "")).json()
    for path in ("/api/timetable/calendar.ics", f"/api/timetable/{saved['id']}/calendar.ics"):
        response = web.get(path)
        assert response.status_code == 200
        assert response.headers["content-type"].startswith("text/calendar")
        text = response.text
        assert "RRULE:FREQ=WEEKLY;BYDAY=WE" in text
        assert "LOCATION:Lab 2" in text
        assert "TRIGGER:-PT15M" in text
        assert "T080000" in text and "T100000" in text


def test_a_class_starts_on_the_next_matching_weekday():
    from datetime import date

    from app.timetable import first_day
    wednesday = date(2026, 10, 28)
    assert first_day(2, wednesday) == wednesday
    assert first_day(0, wednesday) == date(2026, 11, 2)
    assert first_day(3, wednesday) == date(2026, 10, 29)


# subjects the student adds themselves

def test_a_custom_subject_is_added_once_and_listed(setup):
    web, _ = setup()
    added = web.post("/api/subjects", json={"name": "  Law   of torts "}).json()
    assert added["id"].startswith("my-")
    listed = {m["id"]: m for m in web.get("/api/modes").json()["modes"]}
    assert listed[added["id"]]["name"] == "Law of torts"
    assert listed[added["id"]]["custom"] and listed[added["id"]]["menu"] == "custom"
    # the same name again, in any case, picks the one already there
    assert web.post("/api/subjects", json={"name": "LAW OF TORTS"}).json()["id"] == added["id"]
    # a built in name picks the built in subject
    assert web.post("/api/subjects", json={"name": "maths"}).json()["id"] == "maths"
    assert web.post("/api/subjects", json={"name": "   "}).status_code == 422
    assert web.post("/api/subjects", json={"name": "x" * 41}).status_code == 422


def test_custom_subjects_work_everywhere_a_subject_does(setup):
    web, _ = setup([message([text_block("hi")])])
    law = web.post("/api/subjects", json={"name": "Law of torts"}).json()["id"]
    assert web.post("/api/conversations", json={"mode": law}).status_code == 200
    assert web.post("/api/timetable", json=a_class(mode=law)).status_code == 200
    reminder = {"kind": "exam", "title": "Torts paper", "mode": law, "due_date": "2030-01-10"}
    assert web.post("/api/reminders", json=reminder).status_code == 200
    events = ask(web, new_chat(web, law), "what is negligence", mode=law)
    assert events[-1]["t"] != "error"


def test_removing_a_custom_subject_moves_its_things_to_general(setup):
    web, _ = setup()
    law = web.post("/api/subjects", json={"name": "Law of torts"}).json()["id"]
    chat = web.post("/api/conversations", json={"mode": law}).json()["id"]
    web.post("/api/timetable", json=a_class(mode=law))
    assert web.delete(f"/api/subjects/{law}").json()["ok"]
    assert law not in {m["id"] for m in web.get("/api/modes").json()["modes"]}
    assert web.get(f"/api/conversations/{chat}").json()["mode"] == "general"
    assert web.get("/api/timetable").json()["classes"][0]["mode"] == ""
    assert web.post("/api/conversations", json={"mode": law}).status_code == 400
    assert web.delete(f"/api/subjects/{law}").status_code == 404
    assert web.delete("/api/subjects/maths").status_code == 404


# web search, try again and stop

def test_web_search_is_shown_cited_and_kept(setup):
    url = "https://www.example.org/news/rates"
    reply = message([
        search_block("bank rate october 2026"),
        search_result(url, "Rates news"),
        text_block("The rate is 3%.", citations=[web_citation("rate is 3%", url, "Rates news")]),
    ])
    web, claude = setup([reply])
    chat = new_chat(web)
    events = ask(web, chat, "what is the bank rate now")
    assert {"t": "search", "v": "bank rate october 2026"} in events
    done = events[-1]["v"]
    assert done["searches"] == ["bank rate october 2026"]
    assert done["sources"][0]["url"] == url and done["sources"][0]["where"] == "example.org"
    # the search results go back to claude next turn, so the answer stays grounded
    saved = web.get(f"/api/conversations/{chat}").json()["messages"]
    assert saved[-1]["searches"] == ["bank rate october 2026"]
    assert claude.beta.messages.calls[0]["tools"][0]["name"] == "web_search"


def test_try_again_replaces_the_last_answer(setup):
    web, claude = setup([message([text_block("first answer")]), message([text_block("second answer")])])
    chat = new_chat(web)
    ask(web, chat, "explain osmosis")
    response = web.post(f"/api/conversations/{chat}/retry", json={"mode": "general"})
    events = read_events(response)
    assert events[-1]["t"] == "done" and events[-1]["v"]["text"] == "second answer"
    shown = web.get(f"/api/conversations/{chat}").json()["messages"]
    assert [m["role"] for m in shown] == ["user", "assistant"]
    assert shown[1]["text"] == "second answer"
    # the second request was sent the question again, without the first answer
    resent = claude.beta.messages.calls[1]["messages"]
    assert resent[-1]["role"] != "assistant"
    empty = new_chat(web)
    assert web.post(f"/api/conversations/{empty}/retry", json={"mode": "general"}).status_code == 400


def test_a_stopped_answer_keeps_the_question_and_what_arrived(setup):
    web, _ = setup([stopped_stream("Osmosis is the movement of")])
    chat = new_chat(web)
    try:
        web.post(f"/api/conversations/{chat}/messages", json={"text": "what is osmosis", "mode": "general", "file_ids": []})
    except BaseException:
        pass
    shown = web.get(f"/api/conversations/{chat}").json()["messages"]
    assert [m["role"] for m in shown] == ["user", "assistant"]
    assert shown[1]["stopped"] and shown[1]["text"] == "Osmosis is the movement of"


def test_rahah_can_be_installed_as_an_app(setup):
    web, _ = setup()
    page = web.get("/").text
    assert 'rel="manifest"' in page
    manifest = web.get("/static/manifest.webmanifest").json()
    assert manifest["display"] == "standalone" and manifest["start_url"] == "/"
    assert {"192x192", "512x512"} <= {i["sizes"] for i in manifest["icons"]}
    for icon in manifest["icons"]:
        assert web.get(icon["src"]).status_code == 200
    # the service worker is served from the root, so it covers every page
    worker = web.get("/sw.js")
    assert worker.status_code == 200 and "javascript" in worker.headers["content-type"]
    assert web.get("/static/offline.html").status_code == 200


def test_the_database_is_backed_up_once_a_day_and_old_copies_go(tmp_path):
    from app.store import store
    db = store(tmp_path / "live.db")
    db.add_subject("Law of torts")
    folder = tmp_path / "backups"
    # a week of older copies already there
    folder.mkdir()
    for day in range(1, 9):
        (folder / f"rahah-2026-01-0{day}.db").write_bytes(b"old")
    made = db.backup(folder)
    assert made is not None and made.exists()
    # today's copy is a working database with the same data
    assert store(made).list_subjects()[0]["name"] == "Law of torts"
    # a second call the same day does nothing
    assert db.backup(folder) is None
    copies = sorted(p.name for p in folder.glob("rahah-*.db"))
    assert len(copies) == 7 and made.name in copies and "rahah-2026-01-01.db" not in copies


def test_the_server_backs_up_when_it_starts(tmp_path):
    with TestClient(create_app(settings(db_path=tmp_path / "start.db"), client=fake_client())) as web:
        assert web.get("/api/modes").status_code == 200
    assert len(list((tmp_path / "backups").glob("rahah-*.db"))) == 1


def test_hint_mode_adds_a_note_for_that_question_only(setup):
    web, claude = setup([message([text_block("Try this first...")]), message([text_block("Here is the answer")]), message([text_block("a hint again")])])
    chat = new_chat(web)
    web.post(f"/api/conversations/{chat}/messages", json={"text": "solve 2x = 6", "mode": "maths", "file_ids": [], "hints": True})
    sent = claude.beta.messages.calls[0]["messages"]
    # the subject note and the hint note go together as one note after the question
    assert sent[-1]["role"] == "system" and "Mode: maths" in sent[-1]["content"] and "Hint mode is on" in sent[-1]["content"]
    web.post(f"/api/conversations/{chat}/messages", json={"text": "just tell me", "mode": "maths", "file_ids": []})
    assert claude.beta.messages.calls[1]["messages"][-1]["role"] == "user"
    # try again keeps hint mode when asked to
    web.post(f"/api/conversations/{chat}/retry", json={"mode": "maths", "hints": True})
    assert "Hint mode is on" in claude.beta.messages.calls[2]["messages"][-1]["content"]


def test_answers_can_be_rated_and_unhelpful_ones_are_listed(setup):
    web, _ = setup([message([text_block("first answer")]), message([text_block("better answer")])])
    chat = new_chat(web)
    done = ask(web, chat, "what is osmosis")[-1]
    answer = done["v"]["id"]
    assert answer
    assert web.post(f"/api/messages/{answer}/rating", json={"rating": -1}).json() == {"rating": -1}
    shown = web.get(f"/api/conversations/{chat}").json()["messages"]
    assert shown[1]["rating"] == -1 and shown[0]["rating"] == 0
    report = web.get("/api/feedback").json()
    assert report["down"] == 1 and report["up"] == 0
    assert report["unhelpful"][0]["question"] == "what is osmosis" and report["unhelpful"][0]["answer"] == "first answer"
    # questions can't be rated, and nor can answers that don't exist
    assert web.post(f"/api/messages/{shown[0]['id']}/rating", json={"rating": 1}).status_code == 404
    assert web.post("/api/messages/999999/rating", json={"rating": 1}).status_code == 404
    assert web.post(f"/api/messages/{answer}/rating", json={"rating": 2}).status_code == 422
    # trying again replaces the answer, and its rating goes with it
    web.post(f"/api/conversations/{chat}/retry", json={"mode": "general"})
    assert web.get("/api/feedback").json()["down"] == 0
    new_answer = web.get(f"/api/conversations/{chat}").json()["messages"][1]
    web.post(f"/api/messages/{new_answer['id']}/rating", json={"rating": 1})
    web.post(f"/api/messages/{new_answer['id']}/rating", json={"rating": 0})
    assert web.get("/api/feedback").json() == {"up": 0, "down": 0, "unhelpful": []}


def test_search_looks_inside_every_chat(setup):
    replies = [message([text_block(t)]) for t in ("Mitochondria make ATP by respiration.", "Plants photosynthesise.", "100% of it")]
    web, _ = setup(replies)
    first = new_chat(web)
    ask(web, first, "what makes energy in cells")
    second = new_chat(web)
    ask(web, second, "how do plants feed")
    third = new_chat(web)
    ask(web, third, "what share is it")
    found = web.get("/api/search", params={"q": "ATP"}).json()["results"]
    assert [r["id"] for r in found] == [first]
    assert "make ATP" in found[0]["snippet"]
    # titles count too, and case doesn't matter
    assert [r["id"] for r in web.get("/api/search", params={"q": "PLANTS"}).json()["results"]] == [second]
    # a percent sign is searched for as itself, not as a wildcard
    assert [r["id"] for r in web.get("/api/search", params={"q": "100%"}).json()["results"]] == [third]
    assert web.get("/api/search", params={"q": "x"}).json()["results"] == []


def test_answer_language_and_low_data_go_in_as_a_note_for_that_turn(setup):
    web, claude = setup([message([text_block("Maji huhamia.")]), message([text_block("Short.")])])
    assert "Kiswahili" in web.get("/api/modes").json()["languages"]
    conversation_id = new_chat(web)
    sent = web.post(
        f"/api/conversations/{conversation_id}/messages",
        json={"text": "what is osmosis?", "mode": "general", "language": "Kiswahili", "low_data": True},
    )
    assert sent.status_code == 200
    notes = [m["content"] for m in claude.beta.messages.calls[0]["messages"] if m["role"] == "system"]
    assert any("in Kiswahili" in n and "low-data mode" in n for n in notes)

    # the next turn without them carries neither
    ask(web, conversation_id, "and diffusion?")
    later = claude.beta.messages.calls[1]["messages"]
    assert not any("low-data" in str(m["content"]) for m in later[2:])

    bad = web.post(f"/api/conversations/{conversation_id}/messages", json={"text": "hi", "language": "Klingon"})
    assert bad.status_code == 400


def test_a_voice_chat_turn_asks_for_a_spoken_answer(setup):
    web, claude = setup([message([text_block("Water moves in.")])])
    conversation_id = new_chat(web)
    web.post(f"/api/conversations/{conversation_id}/messages", json={"text": "what is osmosis?", "voice": True})
    notes = [m["content"] for m in claude.beta.messages.calls[0]["messages"] if m["role"] == "system"]
    assert any("talking to you by voice" in n for n in notes)
