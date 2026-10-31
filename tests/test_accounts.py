import json
import re

import pytest
from fastapi.testclient import TestClient

from app.accounts import check_password, hash_password, username_from
from app.config import settings
from app.main import create_app
from app.store import store

from .fakes import fake_client, message, signed_in, text_block


@pytest.fixture
def make(tmp_path):
    def build(replies=(), path="acc.db"):
        claude = fake_client(replies)
        app = create_app(settings(db_path=tmp_path / path), client=claude)
        return app, claude
    return build


def sign_up(web, username, password="correct horse!", email=None):
    return web.post("/api/auth/signup", json={"username": username, "email": email or f"{username}@example.com", "password": password, "agreed": True})


def test_passwords_are_hashed_and_checked():
    stored = hash_password("correct horse!")
    assert stored.startswith("scrypt$") and "correct horse!" not in stored
    assert check_password("correct horse!", stored)
    assert not check_password("wrong horse", stored)
    assert not check_password("anything", None) and not check_password("anything", "plain")
    # the same password hashes differently each time
    assert hash_password("correct horse!") != stored
    assert username_from("Amina.Otieno@school.ac.ke") == "amina.otieno" and len(username_from("Al")) >= 3


def test_every_api_route_needs_a_signed_in_student(make):
    app, _ = make()
    web = TestClient(app)
    open_routes = {"/api/auth/config", "/api/auth/signup", "/api/auth/login", "/api/auth/logout", "/api/auth/google", "/api/auth/apple", "/api/auth/forgot", "/api/auth/reset", "/api/health"}
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
    assert me["username"] == "Amina_O" and me["is_admin"] and me["has_password"]
    # the session cookie can't be read by the page's script
    assert "httponly" in made.headers["set-cookie"].lower() and "samesite=lax" in made.headers["set-cookie"].lower()
    assert web.get("/api/me").json()["username"] == "Amina_O"

    assert web.post("/api/auth/logout").status_code == 200
    assert web.get("/api/me").status_code == 401

    # the username needs its exact capitals, the email can be any case
    assert web.post("/api/auth/login", json={"login": "amina_o", "password": "correct horse!", "agreed": True}).status_code == 401
    assert web.post("/api/auth/login", json={"login": "Amina_O", "password": "correct horse!", "agreed": True}).status_code == 200
    web.post("/api/auth/logout")
    assert web.post("/api/auth/login", json={"login": "AMINA_O@example.com", "password": "correct horse!", "agreed": True}).status_code == 200
    bad = web.post("/api/auth/login", json={"login": "Amina_O", "password": "nope nope"})
    assert bad.status_code == 401 and "isn't right" in bad.json()["detail"]


def test_sign_up_rules(make):
    app, _ = make()
    web = TestClient(app)
    assert "3 to 24" in sign_up(web, "a!").json()["detail"]
    assert "email" in sign_up(web, "amina", email="not an email").json()["detail"]
    assert "8 characters" in sign_up(web, "amina", password="short").json()["detail"]
    assert "special character" in sign_up(web, "amina", password="no symbols here 123").json()["detail"]
    assert sign_up(web, "amina").status_code == 200
    assert "taken" in TestClient(app).post("/api/auth/signup", json={"username": "AMINA", "email": "other@example.com", "password": "correct horse!", "agreed": True}).json()["detail"]
    assert "already uses" in TestClient(app).post("/api/auth/signup", json={"username": "brian", "email": "Amina@Example.com", "password": "correct horse!", "agreed": True}).json()["detail"]


def test_too_many_wrong_passwords_wait_a_while(make):
    app, _ = make()
    web = TestClient(app)
    sign_up(web, "amina")
    web.post("/api/auth/logout")
    for _ in range(5):
        assert web.post("/api/auth/login", json={"login": "amina", "password": "wrong guess"}).status_code == 401
    # even the right password waits now
    blocked = web.post("/api/auth/login", json={"login": "amina", "password": "correct horse!", "agreed": True})
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
    # only the admin sees money
    assert student.get("/api/usage").status_code == 403
    assert student.get("/api/feedback").status_code == 403
    assert admin.get("/api/usage").json()["all"]["requests"] == 2
    rows = {u["username"]: u for u in admin.get("/api/admin/users").json()["users"]}
    brian = rows["brian"]
    assert brian["today"] > 0 and brian["cap"] == 0.5 and brian["left"] == round(0.5 - brian["today"], 4)
    assert brian["percent"] == round(100 * brian["today"] / 0.5)
    assert rows["runie"]["cap"] is None and rows["runie"]["percent"] is None
    assert student.get("/api/me").json()["allowance"]["percent"] == brian["percent"]
    # the group numbers leave the admin out, so one student who spent something is one active student
    summary = admin.get("/api/admin/users").json()["summary"]
    assert summary["signups_today"] == 1 and summary["signups_week"] == 1 and summary["signups_before"] == 0
    assert summary["active_today"] == 1 and summary["avg_today"] == brian["today"]
    assert summary["at_limit"] == 0 and student.get("/api/admin/users").status_code == 403


def test_changing_the_password_signs_out_other_devices(make):
    app, _ = make()
    phone, laptop = TestClient(app), TestClient(app)
    sign_up(phone, "amina")
    laptop.post("/api/auth/login", json={"login": "amina", "password": "correct horse!", "agreed": True})
    wrong = phone.post("/api/me/password", json={"current": "nope", "new": "new horse battery!"})
    assert wrong.status_code == 400
    assert phone.post("/api/me/password", json={"current": "correct horse!", "new": "new horse battery!"}).status_code == 200
    assert phone.get("/api/me").status_code == 200
    assert laptop.get("/api/me").status_code == 401
    assert laptop.post("/api/auth/login", json={"login": "amina", "password": "new horse battery!"}).status_code == 200


def test_name_email_and_settings_can_be_changed(make):
    app, _ = make()
    web = TestClient(app)
    sign_up(web, "amina")
    sign_up(TestClient(app), "brian")
    changed = web.patch("/api/me", json={"name": "  Amina   Otieno ", "settings": {"language": "Kiswahili", "low_data": True}}).json()
    assert changed["name"] == "Amina Otieno" and changed["settings"]["language"] == "Kiswahili"
    assert web.patch("/api/me", json={"email": "brian@example.com"}).status_code == 400
    assert web.patch("/api/me", json={"settings": {"x": "y" * 3000}}).status_code == 400


def test_each_student_has_a_daily_allowance_and_the_admin_has_none(make):
    app, claude = make([message([text_block("One.")]) for _ in range(4)])
    admin, student = TestClient(app), TestClient(app)
    sign_up(admin, "runie")
    me = sign_up(student, "brian").json()
    # a student sees only the share of today's limit used, the admin has no limit
    assert me["allowance"] == {"limited": True, "percent": 0, "resets_in": me["allowance"]["resets_in"]}
    assert admin.get("/api/me").json()["allowance"] == {"limited": False}

    # the admin sets brian's limit below what one answer costs, so the second question is turned away
    admin.patch(f"/api/admin/users/{me['id']}", json={"daily_cap": 0.000001})
    chat = student.post("/api/conversations", json={"mode": "general"}).json()["id"]
    assert student.post(f"/api/conversations/{chat}/messages", json={"text": "first"}).status_code == 200
    blocked = student.post(f"/api/conversations/{chat}/messages", json={"text": "second"})
    assert blocked.status_code == 429 and "study limit" in blocked.json()["detail"]
    assert student.post("/api/sets", data={"kind": "flashcards", "topic": "cells"}).status_code == 429
    assert student.post(f"/api/conversations/{chat}/retry", json={}).status_code == 429
    # saved things still open
    assert student.get(f"/api/conversations/{chat}").status_code == 200

    # back to the default limit, and the admin is never stopped
    admin.patch(f"/api/admin/users/{me['id']}", json={"use_default_cap": True})
    assert student.post(f"/api/conversations/{chat}/messages", json={"text": "third"}).status_code == 200
    own = admin.post("/api/conversations", json={"mode": "general"}).json()["id"]
    assert admin.post(f"/api/conversations/{own}/messages", json={"text": "hi"}).status_code == 200


def test_the_admin_page_lists_students_and_can_turn_them_off(make):
    app, _ = make()
    admin, student = TestClient(app), TestClient(app)
    me = sign_up(admin, "runie").json()
    brian = sign_up(student, "brian").json()
    assert student.get("/api/admin/users").status_code == 403
    assert student.patch(f"/api/admin/users/{me['id']}", json={"disabled": True}).status_code == 403

    listed = admin.get("/api/admin/users").json()
    assert [u["username"] for u in listed["users"]] == ["runie", "brian"] and listed["default_cap"] == 0.5
    assert {"today", "week", "all"} <= set(listed["users"][1])

    # turning brian off signs him out and stops him signing in
    assert admin.patch(f"/api/admin/users/{brian['id']}", json={"disabled": True}).json()["disabled"]
    assert student.get("/api/me").status_code == 401
    turned_off = student.post("/api/auth/login", json={"login": "brian", "password": "correct horse!", "agreed": True})
    # a turned off student is told where to write for help
    assert turned_off.status_code == 403 and "studywithrahah@gmail.com" in turned_off.json()["detail"]
    admin.patch(f"/api/admin/users/{brian['id']}", json={"disabled": False})

    # a new password for a student who forgot theirs
    assert admin.post(f"/api/admin/users/{brian['id']}/password", json={"new": "fresh horse!"}).status_code == 200
    assert student.post("/api/auth/login", json={"login": "brian", "password": "fresh horse!"}).status_code == 200

    # the admin can't lock themselves out
    assert admin.patch(f"/api/admin/users/{me['id']}", json={"disabled": True}).status_code == 400
    assert admin.patch(f"/api/admin/users/{me['id']}", json={"is_admin": False}).status_code == 400



def provider_app(tmp_path, people):
    """an app with google and apple set up, where a token is the name of someone in people"""
    from app.providers import identity, provider_error

    def check(token, name=""):
        if token not in people:
            raise provider_error("That sign in couldn't be checked. Try again.")
        sub, email, full = people[token]
        return identity(sub=sub, email=email, name=name or full)

    cfg = settings(db_path=tmp_path / "providers.db", google_client_id="google-id", apple_client_id="apple-id")
    return create_app(cfg, client=fake_client(), verifiers={"google": check, "apple": check})


def test_signing_in_with_google_makes_an_account_then_signs_into_it(tmp_path):
    app = provider_app(tmp_path, {"amina": ("g-1", "Amina.O@gmail.com", "Amina Otieno"), "fake": ("x", None, "")})
    web = TestClient(app)
    assert web.get("/api/auth/config").json() == {"google_client_id": "google-id", "apple_client_id": "apple-id", "support_email": "studywithrahah@gmail.com", "reset_by_email": False}
    assert web.post("/api/auth/google", json={"credential": "fake-token"}).status_code == 401

    made = web.post("/api/auth/google", json={"credential": "amina", "agreed": True}).json()
    assert made["username"] == "amina.o" and made["email"] == "amina.o@gmail.com" and made["google"] and not made["has_password"]
    assert made["name"] == "Amina Otieno"
    web.post("/api/auth/logout")
    again = web.post("/api/auth/google", json={"credential": "amina", "agreed": True}).json()
    assert again["id"] == made["id"]

    # a google account can add a password later, without a current one
    assert web.post("/api/me/password", json={"new": "correct horse!"}).status_code == 200
    web.post("/api/auth/logout")
    assert web.post("/api/auth/login", json={"login": "amina.o", "password": "correct horse!", "agreed": True}).status_code == 200


def test_google_never_takes_over_an_account_with_the_same_email(tmp_path):
    app = provider_app(tmp_path, {"amina": ("g-1", "amina@example.com", "Amina")})
    owner = TestClient(app)
    sign_up(owner, "amina")
    owner.post("/api/auth/logout")
    refused = TestClient(app).post("/api/auth/google", json={"credential": "amina", "agreed": True})
    assert refused.status_code == 400 and "connect Google on the Account tab" in refused.json()["detail"]

    # signed in with the password, the same google account connects to it
    owner.post("/api/auth/login", json={"login": "amina", "password": "correct horse!", "agreed": True})
    linked = owner.post("/api/auth/google", json={"credential": "amina", "agreed": True}).json()
    assert linked["google"] and linked["username"] == "amina"
    owner.post("/api/auth/logout")
    assert TestClient(app).post("/api/auth/google", json={"credential": "amina", "agreed": True}).json()["username"] == "amina"


def test_one_google_account_belongs_to_one_rahah_account(tmp_path):
    app = provider_app(tmp_path, {"amina": ("g-1", None, "Amina")})
    first = TestClient(app)
    first.post("/api/auth/google", json={"credential": "amina", "agreed": True})
    second = TestClient(app)
    sign_up(second, "brian")
    clash = second.post("/api/auth/google", json={"credential": "amina", "agreed": True})
    assert clash.status_code == 400 and "another Rahah account" in clash.json()["detail"]


def test_apple_sign_in_and_usernames_that_are_taken(tmp_path):
    app = provider_app(tmp_path, {"one": ("a-1", None, ""), "two": ("a-2", None, "")})
    first = TestClient(app).post("/api/auth/apple", json={"id_token": "one", "name": "Amina Otieno", "agreed": True}).json()
    assert first["apple"] and first["name"] == "Amina Otieno" and first["username"] == "aminaotieno"
    second = TestClient(app).post("/api/auth/apple", json={"id_token": "two", "name": "Amina Otieno", "agreed": True}).json()
    assert second["username"] == "aminaotieno2"


def test_google_and_apple_stay_off_until_set_up(make):
    app, _ = make()
    web = TestClient(app)
    assert web.get("/api/auth/config").json() == {"google_client_id": "", "apple_client_id": "", "support_email": "studywithrahah@gmail.com", "reset_by_email": False}
    assert web.post("/api/auth/google", json={"credential": "x"}).status_code == 404
    assert web.post("/api/auth/apple", json={"id_token": "x"}).status_code == 404


def test_provider_tokens_are_checked_for_signature_app_issuer_and_expiry(monkeypatch):
    import time as _time
    from types import SimpleNamespace

    import jwt
    from cryptography.hazmat.primitives.asymmetric import rsa

    from app import providers

    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    other = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    monkeypatch.setitem(providers._key_clients, providers.google_keys_url,
                        SimpleNamespace(get_signing_key_from_jwt=lambda token: SimpleNamespace(key=key.public_key())))
    monkeypatch.setitem(providers._key_clients, providers.apple_keys_url,
                        SimpleNamespace(get_signing_key_from_jwt=lambda token: SimpleNamespace(key=key.public_key())))

    def token(signer=key, **change):
        claims = {"sub": "123", "aud": "my-app", "iss": "https://accounts.google.com", "exp": int(_time.time()) + 600,
                  "email": "amina@gmail.com", "email_verified": True, "name": "Amina"}
        claims.update(change)
        return jwt.encode(claims, signer, algorithm="RS256")

    found = providers.verify_google(token(), "my-app")
    assert (found.sub, found.email, found.name) == ("123", "amina@gmail.com", "Amina")
    assert providers.verify_google(token(email_verified=False), "my-app").email is None
    for bad in (token(aud="someone-else"), token(iss="https://evil.example"), token(exp=int(_time.time()) - 3600), token(signer=other)):
        with pytest.raises(providers.provider_error):
            providers.verify_google(bad, "my-app")

    apple = providers.verify_apple(token(iss="https://appleid.apple.com", email_verified="true"), "my-app", "Amina O")
    assert apple.email == "amina@gmail.com" and apple.name == "Amina O"
    with pytest.raises(providers.provider_error):
        providers.verify_apple(token(), "my-app")  # a google token isn't an apple one


def test_a_new_account_needs_the_terms_box_ticked(make, tmp_path):
    app, _ = make()
    refused = TestClient(app).post("/api/auth/signup", json={"username": "amina", "email": "amina@example.com", "password": "correct horse!"})
    assert refused.status_code == 400 and "Tick the box" in refused.json()["detail"]
    # a new google account needs it too, but signing back in to a linked one doesn't
    app = provider_app(tmp_path, {"amina": ("g-1", "amina@gmail.com", "Amina Otieno")})
    new = TestClient(app).post("/api/auth/google", json={"credential": "amina"})
    assert new.status_code == 400 and "Tick the box" in new.json()["detail"]
    assert TestClient(app).post("/api/auth/google", json={"credential": "amina", "agreed": True}).status_code == 200
    assert TestClient(app).post("/api/auth/google", json={"credential": "amina"}).status_code == 200


def test_a_student_can_delete_their_own_account_and_everything_in_it(make):
    app, claude = make([message([text_block("Hi.")])])
    admin = signed_in(TestClient(app), "runie")
    amina = TestClient(app)
    sign_up(amina, "amina")
    chat = amina.post("/api/conversations", json={"mode": "general"}).json()["id"]
    amina.post(f"/api/conversations/{chat}/messages", json={"text": "hello"})
    upload = amina.post("/api/files", data={"conversation_id": chat}, files={"file": ("a.txt", b"some notes", "text/plain")}).json()["id"]
    note = amina.post("/api/notes", data={"mode": "science"}, files={"file": ("n.txt", b"notes", "text/plain")}).json()["id"]
    # the wrong password changes nothing
    assert amina.post("/api/me/delete", json={"password": "wrong horse!"}).status_code == 400
    assert amina.get("/api/me").status_code == 200
    gone = amina.post("/api/me/delete", json={"password": "correct horse!"})
    assert gone.status_code == 200
    assert amina.get("/api/me").status_code == 401
    assert set(claude.files.deleted) >= {upload, note}
    # the account is gone for good, its name is free again, and the admin's list no longer has it
    assert TestClient(app).post("/api/auth/login", json={"login": "amina", "password": "correct horse!"}).status_code == 401
    assert "amina" not in [u["username"] for u in admin.get("/api/admin/users").json()["users"]]
    assert sign_up(TestClient(app), "amina").status_code == 200


def test_the_admin_cant_delete_their_own_account(make):
    app, _ = make()
    admin = signed_in(TestClient(app), "runie")
    assert admin.post("/api/me/delete", json={"password": "correct horse!"}).status_code == 400


def reset_app(tmp_path, sent):
    cfg = settings(db_path=tmp_path / "reset.db", smtp_user="studywithrahah@gmail.com", smtp_password="app-password", public_url="https://rahah.example")
    return create_app(cfg, client=fake_client(), mailer=lambda to, subject, text: sent.append((to, subject, text)))


def test_a_forgotten_password_is_reset_with_a_link_sent_by_email(tmp_path):
    sent = []
    app = reset_app(tmp_path, sent)
    assert TestClient(app).get("/api/auth/config").json()["reset_by_email"] is True
    amina = TestClient(app)
    sign_up(amina, "amina")
    # an unknown name gets the same answer and no email
    assert TestClient(app).post("/api/auth/forgot", json={"login": "nobody"}).json() == {"ok": True}
    assert sent == []
    assert TestClient(app).post("/api/auth/forgot", json={"login": "Amina@Example.com"}).json() == {"ok": True}
    to, subject, text = sent[-1]
    assert to == "amina@example.com" and "Reset" in subject and "@amina" in text
    token = re.search(r"https://rahah\.example/#/reset/(\S+)", text).group(1)
    # a weak password is turned down without using up the link
    web = TestClient(app)
    assert web.post("/api/auth/reset", json={"token": token, "password": "short"}).status_code == 400
    done = web.post("/api/auth/reset", json={"token": token, "password": "a new horse!"})
    assert done.status_code == 200 and done.json()["username"] == "amina"
    assert web.get("/api/me").status_code == 200
    # the old session is signed out, the old password stops working, the new one works
    assert amina.get("/api/me").status_code == 401
    assert TestClient(app).post("/api/auth/login", json={"login": "amina", "password": "correct horse!"}).status_code == 401
    assert TestClient(app).post("/api/auth/login", json={"login": "amina", "password": "a new horse!"}).status_code == 200
    # a link works once
    assert TestClient(app).post("/api/auth/reset", json={"token": token, "password": "another horse!"}).status_code == 400


def test_only_the_newest_reset_link_works_and_asking_is_limited(tmp_path):
    sent = []
    app = reset_app(tmp_path, sent)
    sign_up(TestClient(app), "amina")
    for _ in range(5):
        TestClient(app).post("/api/auth/forgot", json={"login": "amina"})
    # three emails an hour for one account
    assert len(sent) == 3
    first = re.search(r"/#/reset/(\S+)", sent[0][2]).group(1)
    last = re.search(r"/#/reset/(\S+)", sent[-1][2]).group(1)
    assert TestClient(app).post("/api/auth/reset", json={"token": first, "password": "a new horse!"}).status_code == 400
    assert TestClient(app).post("/api/auth/reset", json={"token": last, "password": "a new horse!"}).status_code == 200


def test_without_email_set_up_reset_points_to_the_help_address(make):
    app, _ = make()
    refused = TestClient(app).post("/api/auth/forgot", json={"login": "amina"})
    assert refused.status_code == 404 and "studywithrahah@gmail.com" in refused.json()["detail"]
