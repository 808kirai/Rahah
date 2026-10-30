import json

from fastapi.testclient import TestClient

from app.config import settings
from app.main import create_app

from .fakes import fake_client, message, signed_in, text_block

quiz = {"title": "Capitals", "questions": [
    {"question": "Capital of France?", "options": ["Paris", "Rome", "Oslo", "Lima"], "answer": 0, "explanation": "Paris is."},
    {"question": "Capital of Kenya?", "options": ["Mombasa", "Nairobi", "Kisumu", "Nakuru"], "answer": 1, "explanation": "Nairobi is."},
]}


def made_app(tmp_path):
    return create_app(settings(db_path=tmp_path / "share.db"), client=fake_client([message([text_block(json.dumps(quiz))])]))


def test_a_shared_test_is_copied_into_a_friends_account(tmp_path):
    app = made_app(tmp_path)
    owner = signed_in(TestClient(app), "amina")
    made = owner.post("/api/sets", data={"kind": "quiz", "topic": "capitals", "mode": "exam"}).json()
    owner.post(f"/api/sets/{made['id']}/score", json={"score": 2})
    url = owner.post(f"/api/sets/{made['id']}/share").json()["url"]
    assert "/#/shared/" in url
    # sharing again gives the same link
    assert owner.post(f"/api/sets/{made['id']}/share").json()["url"] == url
    token = url.rsplit("/", 1)[1]

    friend = signed_in(TestClient(app), "brian")
    # a friend can't open the original
    assert friend.get(f"/api/sets/{made['id']}").status_code == 404
    seen = friend.get(f"/api/shared/{token}").json()
    assert seen == {"title": "Capitals", "kind": "quiz", "mode": "exam", "size": 2, "marks": 2, "from": "amina", "yours": False}
    copy = friend.post(f"/api/shared/{token}/copy").json()["id"]
    assert copy != made["id"]
    theirs = friend.get(f"/api/sets/{copy}").json()
    # the questions come across, the owner's best score doesn't
    assert [q["question"] for q in theirs["items"]] == [q["question"] for q in made["items"]]
    assert theirs["best_score"] is None
    # the owner opening their own link just gets their own test
    assert owner.post(f"/api/shared/{token}/copy").json()["id"] == made["id"]
    assert owner.get(f"/api/shared/{token}").json()["yours"] is True


def test_stopping_sharing_turns_the_link_off(tmp_path):
    app = made_app(tmp_path)
    owner = signed_in(TestClient(app), "amina")
    made = owner.post("/api/sets", data={"kind": "quiz", "topic": "capitals", "mode": "exam"}).json()
    token = owner.post(f"/api/sets/{made['id']}/share").json()["url"].rsplit("/", 1)[1]
    friend = signed_in(TestClient(app), "brian")
    # someone else can't share or stop sharing a set that isn't theirs
    assert friend.post(f"/api/sets/{made['id']}/share").status_code == 404
    assert friend.post(f"/api/sets/{made['id']}/share/stop").status_code == 404
    assert owner.post(f"/api/sets/{made['id']}/share/stop").json() == {"ok": True}
    gone = friend.get(f"/api/shared/{token}")
    assert gone.status_code == 404 and "Ask your friend" in gone.json()["detail"]
    assert friend.post(f"/api/shared/{token}/copy").status_code == 404
    # a new share makes a new link
    again = owner.post(f"/api/sets/{made['id']}/share").json()["url"].rsplit("/", 1)[1]
    assert again != token


def test_a_shared_link_needs_an_account(tmp_path):
    app = made_app(tmp_path)
    assert TestClient(app).get("/api/shared/abcdefghijklmnopqrstuvwxyz").status_code == 401
