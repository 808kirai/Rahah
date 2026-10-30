import json
import re

import pytest
from fastapi.testclient import TestClient

from app.accounts import check_password, hash_password, username_from
from app.config import settings
from app.main import create_app
from app.store import store

from .fakes import fake_client, message, text_block


@pytest.fixture
def make(tmp_path):
    def build(replies=(), path="acc.db"):
        claude = fake_client(replies)
        app = create_app(settings(db_path=tmp_path / path), client=claude)
        return app, claude
    return build


def sign_up(web, username, password="correct horse", email=None):
    return web.post("/api/auth/signup", json={"username": username, "email": email or f"{username}@example.com", "password": password})


def test_passwords_are_hashed_and_checked():
    stored = hash_password("correct horse")
    assert stored.startswith("scrypt$") and "correct horse" not in stored
    assert check_password("correct horse", stored)
    assert not check_password("wrong horse", stored)
    assert not check_password("anything", None) and not check_password("anything", "plain")
    # the same password hashes differently each time
    assert hash_password("correct horse") != stored
    assert username_from("Amina.Otieno@school.ac.ke") == "amina.otieno" and len(username_from("Al")) >= 3


def test_every_api_route_needs_a_signed_in_student(make):
    app, _ = make()
    web = TestClient(app)
    open_routes = {"/api/auth/config", "/api/auth/signup", "/api/auth/login", "/api/auth/logout"}
    checked = 0
    for route in app.routes:
        path = getattr(route, "path", "")
        if not path.startswith("/api/") or path in open_routes:
            continue
        url = re.sub(r"\{[^}]+\}", "x1", path)
        for method in route.methods - {"HEAD", "OPTIONS"}:
            response = web.request(method, url, params={"today": "2026-10-30", "weekday": 1, "q": "hi"})
            assert response.status_code == 401, (method, path, response.status_code)
            checked += 1
    assert checked >= 50


def test_signing_up_in_and_out(make):
    app, _ = make()
    web = TestClient(app)
    made = sign_up(web, "Amina_O")
    assert made.status_code == 200
    me = made.json()
    assert me["username"] == "amina_o" and me["is_admin"] and me["has_password"]
    # the session cookie can't be read by the page's script
    assert "httponly" in made.headers["set-cookie"].lower() and "samesite=lax" in made.headers["set-cookie"].lower()
    assert web.get("/api/me").json()["username"] == "amina_o"

    assert web.post("/api/auth/logout").status_code == 200
    assert web.get("/api/me").status_code == 401

    # by username or email, any case
    assert web.post("/api/auth/login", json={"login": "AMINA_O", "password": "correct horse"}).status_code == 200
    web.post("/api/auth/logout")
    assert web.post("/api/auth/login", json={"login": "amina_o@example.com", "password": "correct horse"}).status_code == 200
    bad = web.post("/api/auth/login", json={"login": "amina_o", "password": "nope nope"})
    assert bad.status_code == 401 and "isn't right" in bad.json()["detail"]


def test_sign_up_rules(make):
    app, _ = make()
    web = TestClient(app)
    assert "3 to 24" in sign_up(web, "a!").json()["detail"]
    assert "email" in sign_up(web, "amina", email="not an email").json()["detail"]
    assert "8 characters" in sign_up(web, "amina", password="short").json()["detail"]
    assert sign_up(web, "amina").status_code == 200
    assert "taken" in TestClient(app).post("/api/auth/signup", json={"username": "AMINA", "email": "other@example.com", "password": "correct horse"}).json()["detail"]
    assert "already uses" in TestClient(app).post("/api/auth/signup", json={"username": "brian", "email": "Amina@Example.com", "password": "correct horse"}).json()["detail"]


def test_too_many_wrong_passwords_wait_a_while(make):
    app, _ = make()
    web = TestClient(app)
    sign_up(web, "amina")
    web.post("/api/auth/logout")
    for _ in range(8):
        assert web.post("/api/auth/login", json={"login": "amina", "password": "wrong guess"}).status_code == 401
    # even the right password waits now
    blocked = web.post("/api/auth/login", json={"login": "amina", "password": "correct horse"})
    assert blocked.status_code == 429


def test_the_first_account_takes_what_was_made_before_accounts(tmp_path):
    # a database from before accounts, with a chat, a deck and a subject that have no owner
    db = store(tmp_path / "old.db")
    with db._connect() as raw:
        raw.execute("insert into conversations (id, title, mode, created, updated) values ('c1', 'old chat', 'general', 1, 1)")
        raw.execute("insert into study_sets (id, kind, title, mode, items, size, created, updated) values ('s1', 'flashcards', 'Old deck', 'science', '[]', 0, 1, 1)")
        raw.execute("insert into subjects (id, name, created) values ('my-abc', 'Law of torts', 1)")
        raw.execute("insert into recommendations (id, items, signature, created) values (1, '[]', 'sig', 1)")
    app = create_app(settings(db_path=tmp_path / "old.db"), client=fake_client())
    owner = TestClient(app)
    assert sign_up(owner, "runie").json()["is_admin"]
    assert [c["title"] for c in owner.get("/api/conversations").json()["conversations"]] == ["old chat"]
    assert [s["title"] for s in owner.get("/api/sets").json()["sets"]] == ["Old deck"]
    assert "Law of torts" in [m["name"] for m in owner.get("/api/modes").json()["modes"]]

    # the next account starts empty and isn't an admin
    other = TestClient(app)
    assert not sign_up(other, "brian").json()["is_admin"]
    assert other.get("/api/conversations").json()["conversations"] == []
    assert other.get("/api/sets").json()["sets"] == []
    assert "Law of torts" not in [m["name"] for m in other.get("/api/modes").json()["modes"]]


def test_students_never_see_each_others_things(make):
    cards = {"title": "Cells", "cards": [{"front": "a", "back": "b"}]}
    app, _ = make([message([text_block("Water moves.")]), message([text_block(json.dumps(cards))])])
    amina, brian = TestClient(app), TestClient(app)
    sign_up(amina, "amina")
    sign_up(brian, "brian")

    chat = amina.post("/api/conversations", json={"mode": "general"}).json()["id"]
    amina.post(f"/api/conversations/{chat}/messages", json={"text": "what is osmosis?"})
    answer = amina.get(f"/api/conversations/{chat}").json()["messages"][-1]["id"]
    deck = amina.post("/api/sets", data={"kind": "flashcards", "topic": "cells"}).json()["id"]
    note = amina.post("/api/notes", data={"mode": "science"}, files={"file": ("n.txt", b"notes", "text/plain")}).json()["id"]
    reminder = amina.post("/api/reminders", json={"kind": "exam", "title": "Biology", "due_date": "2030-01-10"}).json()["id"]
    lesson = amina.post("/api/timetable", json={"title": "Maths", "day": 1, "start_time": "09:00", "end_time": "10:00"}).json()["id"]
    subject = amina.post("/api/subjects", json={"name": "Law of torts"}).json()["id"]

    # brian's lists are empty, and amina's things are not found for him
    assert brian.get("/api/conversations").json()["conversations"] == []
    assert brian.get("/api/search", params={"q": "osmosis"}).json()["results"] == []
    assert brian.get("/api/sets").json()["sets"] == []
    assert brian.get("/api/notes").json()["notes"] == []
    assert brian.get("/api/reminders").json()["reminders"] == []
    assert brian.get("/api/timetable").json()["classes"] == []
    for path in (f"/api/conversations/{chat}", f"/api/sets/{deck}", f"/api/reminders/{reminder}/calendar.ics", f"/api/timetable/{lesson}/calendar.ics"):
        assert brian.get(path).status_code == 404, path
    assert brian.post(f"/api/conversations/{chat}/messages", json={"text": "hi"}).status_code == 404
    assert brian.delete(f"/api/sets/{deck}").status_code == 404
    assert brian.delete(f"/api/notes/{note}").status_code == 404
    assert brian.post(f"/api/messages/{answer}/rating", json={"rating": -1}).status_code == 404
    assert brian.delete(f"/api/subjects/{subject}").status_code == 404
    assert brian.post("/api/conversations", json={"mode": subject}).status_code == 400
    using_note = brian.post("/api/sets", data={"kind": "flashcards", "note_ids": [note]})
    assert using_note.status_code == 400

    # amina still has all of it
    assert amina.get(f"/api/sets/{deck}").status_code == 200
    assert len(amina.get("/api/notes").json()["notes"]) == 1


def test_usage_is_counted_per_student_and_the_admin_sees_it_all(make):
    app, _ = make([message([text_block("One.")]), message([text_block("Two.")])])
    admin, student = TestClient(app), TestClient(app)
    sign_up(admin, "runie")
    sign_up(student, "brian")
    for web in (admin, student):
        chat = web.post("/api/conversations", json={"mode": "general"}).json()["id"]
        web.post(f"/api/conversations/{chat}/messages", json={"text": "hi"})
    assert student.get("/api/usage").json()["all"]["requests"] == 1
    assert admin.get("/api/usage").json()["all"]["requests"] == 2


def test_changing_the_password_signs_out_other_devices(make):
    app, _ = make()
    phone, laptop = TestClient(app), TestClient(app)
    sign_up(phone, "amina")
    laptop.post("/api/auth/login", json={"login": "amina", "password": "correct horse"})
    wrong = phone.post("/api/me/password", json={"current": "nope", "new": "new horse battery"})
    assert wrong.status_code == 400
    assert phone.post("/api/me/password", json={"current": "correct horse", "new": "new horse battery"}).status_code == 200
    assert phone.get("/api/me").status_code == 200
    assert laptop.get("/api/me").status_code == 401
    assert laptop.post("/api/auth/login", json={"login": "amina", "password": "new horse battery"}).status_code == 200


def test_name_email_and_settings_can_be_changed(make):
    app, _ = make()
    web = TestClient(app)
    sign_up(web, "amina")
    sign_up(TestClient(app), "brian")
    changed = web.patch("/api/me", json={"name": "  Amina   Otieno ", "settings": {"language": "Kiswahili", "low_data": True}}).json()
    assert changed["name"] == "Amina Otieno" and changed["settings"]["language"] == "Kiswahili"
    assert web.patch("/api/me", json={"email": "brian@example.com"}).status_code == 400
    assert web.patch("/api/me", json={"settings": {"x": "y" * 3000}}).status_code == 400
