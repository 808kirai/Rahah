import base64
import hashlib
import re
from pathlib import Path

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.config import settings
from app.main import create_app
from app.security import in_flight
from app.store import store

from .fakes import fake_client, message, signed_in, text_block


@pytest.fixture
def make(tmp_path):
    def build(replies=(), path="sec.db", **options):
        return create_app(settings(db_path=tmp_path / path, **options), client=fake_client(replies))
    return build


def sign_up(web, username, email=None):
    return web.post("/api/auth/signup", json={"username": username, "email": email or f"{username}@example.com", "password": "correct horse!", "agreed": True})


def test_every_response_tells_the_browser_what_is_allowed(make):
    web = TestClient(make())
    page = web.get("/")
    headers = page.headers
    assert headers["x-content-type-options"] == "nosniff"
    assert headers["x-frame-options"] == "DENY"
    policy = headers["content-security-policy"]
    assert "frame-ancestors 'none'" in policy and "object-src 'none'" in policy and "base-uri 'self'" in policy
    # the one script written into the page is allowed by its exact hash, and nothing else inline
    inline = re.search(r"<script>(.*?)</script>", Path("static/index.html").read_text(encoding="utf-8"), flags=re.S).group(1)
    digest = base64.b64encode(hashlib.sha256(inline.encode("utf-8")).digest()).decode()
    assert f"'sha256-{digest}'" in policy
    assert "unsafe-eval" not in policy and "script-src 'self' 'unsafe-inline'" not in policy
    # the automatic api pages are closed
    for path in ("/docs", "/redoc", "/openapi.json"):
        assert web.get(path).status_code == 404


def test_changes_from_another_site_are_refused(make):
    web = TestClient(make())
    sign_up(web, "amina")
    evil = web.post("/api/conversations", json={"mode": "general"}, headers={"origin": "https://evil.example"})
    assert evil.status_code == 403
    sneaky = web.post("/api/conversations", json={"mode": "general"}, headers={"sec-fetch-site": "cross-site"})
    assert sneaky.status_code == 403
    # rahah's own page is fine
    assert web.post("/api/conversations", json={"mode": "general"}, headers={"origin": "http://testserver"}).status_code == 200


def test_oversized_requests_are_turned_away(make):
    web = TestClient(make())
    sign_up(web, "amina")
    huge = web.post("/api/notes", content=b"x", headers={"content-length": str(500 * 1024 * 1024), "content-type": "application/octet-stream"})
    assert huge.status_code == 413


def test_one_connection_can_only_make_so_many_accounts(make):
    app = make(signups_per_ip=2)
    assert sign_up(TestClient(app), "one").status_code == 200
    assert sign_up(TestClient(app), "two").status_code == 200
    third = sign_up(TestClient(app), "three")
    assert third.status_code == 429 and "Too many accounts" in third.json()["detail"]


def test_with_an_admin_email_only_that_account_is_admin(tmp_path):
    db = store(tmp_path / "old.db")
    with db._connect() as raw:
        raw.execute("insert into conversations (id, title, mode, created, updated) values ('c1', 'old chat', 'general', 1, 1)")
    app = create_app(settings(db_path=tmp_path / "old.db", admin_email="boss@example.com"), client=fake_client())
    # a stranger signing up first gets nothing special, and none of the old chats
    stranger = TestClient(app)
    assert sign_up(stranger, "stranger").json()["is_admin"] is False
    assert stranger.get("/api/conversations").json()["conversations"] == []
    owner = TestClient(app)
    assert sign_up(owner, "boss", "Boss@Example.com").json()["is_admin"] is True
    assert [c["title"] for c in owner.get("/api/conversations").json()["conversations"]] == ["old chat"]


def test_a_daily_budget_covers_every_student_together(make):
    app = make([message([text_block("One.")]), message([text_block("Two.")]), message([text_block("Three.")])], daily_budget=0.000001)
    admin = signed_in(TestClient(app), "runie")
    student = signed_in(TestClient(app), "brian")
    chat = student.post("/api/conversations", json={"mode": "general"}).json()["id"]
    assert student.post(f"/api/conversations/{chat}/messages", json={"text": "first"}).status_code == 200
    stopped = student.post(f"/api/conversations/{chat}/messages", json={"text": "second"})
    assert stopped.status_code == 429 and "for everyone today" in stopped.json()["detail"]
    # the admin isn't counted or stopped, and sees the budget
    own = admin.post("/api/conversations", json={"mode": "general"}).json()["id"]
    assert admin.post(f"/api/conversations/{own}/messages", json={"text": "hi"}).status_code == 200
    listed = admin.get("/api/admin/users").json()
    assert listed["budget"] == 0.000001 and listed["budget_used"] > 0


def test_a_student_can_only_have_so_many_answers_running():
    limit = in_flight(2, expire=60)
    first, second = limit.start("amina"), limit.start("amina")
    with pytest.raises(HTTPException) as refused:
        limit.start("amina")
    assert refused.value.status_code == 429
    # someone else isn't affected, and finishing one frees a place
    limit.start("brian")
    limit.finish("amina", first)
    limit.start("amina")
    # a request that never reports back stops counting after a while
    stale = in_flight(1, expire=-1)
    stale.start("amina")
    stale.start("amina")


def test_over_https_cookies_stay_on_https(make):
    web = TestClient(make(https=True))
    made = sign_up(web, "amina")
    assert "secure" in made.headers["set-cookie"].lower()
    assert "max-age=31536000" in made.headers["strict-transport-security"]


def test_a_wrong_name_and_a_wrong_password_look_the_same(make):
    web = TestClient(make())
    sign_up(web, "amina")
    web.post("/api/auth/logout")
    wrong_name = web.post("/api/auth/login", json={"login": "nobody", "password": "correct horse!", "agreed": True})
    wrong_password = web.post("/api/auth/login", json={"login": "amina", "password": "wrong horse!"})
    assert wrong_name.status_code == wrong_password.status_code == 401
    assert wrong_name.json() == wrong_password.json()


def test_behind_a_proxy_the_address_comes_from_the_header_the_host_sets(make):
    app = make(signups_per_ip=1, client_ip_header="true-client-ip")
    # two visitors behind the same proxy are told apart by the host's header
    assert sign_up(TestClient(app), "one").status_code == 200
    assert sign_up(TestClient(app, headers={"true-client-ip": "203.0.113.9"}), "two").status_code == 200
    # writing a different x-forwarded-for doesn't get round the limit
    again = TestClient(app, headers={"true-client-ip": "203.0.113.9", "x-forwarded-for": "198.51.100.1"})
    assert sign_up(again, "three").status_code == 429


def test_the_health_check_and_the_admin_address_page(make):
    app = make(client_ip_header="true-client-ip")
    assert TestClient(app).get("/api/health").json() == {"ok": True}
    admin = TestClient(app, headers={"true-client-ip": "203.0.113.9"})
    sign_up(admin, "boss")
    seen = admin.get("/api/admin/address").json()
    assert seen["address"] == "203.0.113.9" and seen["from_header"] is True
    student = TestClient(app)
    sign_up(student, "amina")
    assert student.get("/api/admin/address").status_code == 403


def test_the_privacy_page_is_open_to_everyone(make):
    page = TestClient(make()).get("/privacy")
    assert page.status_code == 200 and "What Rahah keeps" in page.text
    assert "content-security-policy" in page.headers
    terms = TestClient(make(path="terms.db")).get("/terms")
    assert terms.status_code == 200 and "Using Rahah fairly" in terms.text


def test_fixing_a_mistyped_admin_email_makes_that_account_admin_on_the_next_start(tmp_path):
    wrong = create_app(settings(db_path=tmp_path / "fix.db", admin_email="boss@email.com"), client=fake_client())
    owner = TestClient(wrong)
    assert sign_up(owner, "boss", "boss@gmail.com").json()["is_admin"] is False
    sign_up(TestClient(wrong), "amina")
    # the setting is corrected and rahah restarts
    fixed = create_app(settings(db_path=tmp_path / "fix.db", admin_email="boss@gmail.com"), client=fake_client())
    again = TestClient(fixed)
    again.post("/api/auth/login", json={"login": "boss", "password": "correct horse!", "agreed": True})
    assert again.get("/api/me").json()["is_admin"] is True
    amina = TestClient(fixed)
    amina.post("/api/auth/login", json={"login": "amina", "password": "correct horse!", "agreed": True})
    assert amina.get("/api/me").json()["is_admin"] is False
