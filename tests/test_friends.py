import json

from fastapi.testclient import TestClient

from app.config import settings
from app.main import create_app

from .fakes import fake_client, message, signed_in, text_block

quiz = {"title": "Capitals", "questions": [
    {"question": "Capital of France?", "options": ["Paris", "Rome", "Oslo", "Lima"], "answer": 0, "explanation": "Paris is."},
    {"question": "Capital of Kenya?", "options": ["Mombasa", "Nairobi", "Kisumu", "Nakuru"], "answer": 1, "explanation": "Nairobi is."},
]}


def made_app(tmp_path, replies=()):
    return create_app(settings(db_path=tmp_path / "friends.db"), client=fake_client(list(replies)))


def named(web, name):
    web.patch("/api/me", json={"name": name})
    return web


def test_people_are_found_by_username_or_name_and_show_only_a_first_name(tmp_path):
    app = made_app(tmp_path)
    me = signed_in(TestClient(app), "runie")
    named(signed_in(TestClient(app), "amina_o"), "Amina Otieno")
    signed_in(TestClient(app), "brian")
    found = me.get("/api/people", params={"q": "ami"}).json()["people"]
    assert found == [{"username": "amina_o", "name": "Amina", "avatar": "", "status": "none"}]
    assert me.get("/api/people", params={"q": "otie"}).json()["people"][0]["username"] == "amina_o"
    # too short a search finds nothing, and nobody finds themselves
    assert me.get("/api/people", params={"q": "a"}).json()["people"] == []
    assert me.get("/api/people", params={"q": "runie"}).json()["people"] == []


def test_a_student_can_turn_off_being_found(tmp_path):
    app = made_app(tmp_path)
    me = signed_in(TestClient(app), "runie")
    amina = signed_in(TestClient(app), "amina")
    assert amina.patch("/api/me", json={"findable": False}).json()["findable"] is False
    assert me.get("/api/people", params={"q": "ami"}).json()["people"] == []
    # nor can they be sent a request by typing the name
    assert me.post("/api/friends", json={"username": "amina"}).status_code == 404
    # but they can still ask someone else
    assert amina.post("/api/friends", json={"username": "runie"}).json()["status"] == "sent"
    assert me.post("/api/friends/amina/accept").json()["status"] == "friends"


def test_a_friend_request_becomes_a_friendship_once_accepted(tmp_path):
    app = made_app(tmp_path)
    me = signed_in(TestClient(app), "runie")
    amina = signed_in(TestClient(app), "amina")
    assert me.post("/api/friends", json={"username": "amina"}).json()["status"] == "sent"
    assert me.get("/api/people", params={"q": "ami"}).json()["people"][0]["status"] == "sent"
    waiting = amina.get("/api/friends").json()
    assert waiting["asked"][0]["username"] == "runie" and waiting["friends"] == []
    # not friends yet, so not on each other's leaderboard
    assert [r["username"] for r in me.get("/api/leaderboard").json()["board"]] == ["runie"]
    assert amina.post("/api/friends/runie/accept").json()["status"] == "friends"
    assert [f["username"] for f in me.get("/api/friends").json()["friends"]] == ["amina"]
    assert {r["username"] for r in me.get("/api/leaderboard").json()["board"]} == {"runie", "amina"}
    # asking someone who already asked you just makes you friends
    brian = signed_in(TestClient(app), "brian")
    brian.post("/api/friends", json={"username": "runie"})
    assert me.post("/api/friends", json={"username": "brian"}).json()["status"] == "friends"
    # removing goes both ways
    assert amina.delete("/api/friends/runie").json()["status"] == "none"
    assert "amina" not in [f["username"] for f in me.get("/api/friends").json()["friends"]]
    assert me.post("/api/friends", json={"username": "nobody"}).status_code == 404


def test_the_leaderboard_ranks_friends_by_this_weeks_points(tmp_path):
    app = made_app(tmp_path, [message([text_block(json.dumps(quiz))])])
    me = signed_in(TestClient(app), "runie")
    amina = signed_in(TestClient(app), "amina")
    me.post("/api/friends", json={"username": "amina"})
    amina.post("/api/friends/runie/accept")
    # amina takes a test and scores 2 marks, twice, only her best counts
    made = amina.post("/api/sets", data={"kind": "quiz", "topic": "capitals", "mode": "exam"}).json()
    amina.post(f"/api/sets/{made['id']}/score", json={"score": 1})
    amina.post(f"/api/sets/{made['id']}/score", json={"score": 2})
    # runie studies for a minute, a second ping straight away doesn't count
    assert me.post("/api/study-time").json()["minutes_today"] == 1
    assert me.post("/api/study-time").json()["minutes_today"] == 1
    board = me.get("/api/leaderboard").json()
    first, second = board["board"]
    assert first["username"] == "amina" and first["marks"] == 2 and first["days"] == 1
    assert first["points"] == 2 + 5
    assert second["you"] and second["minutes"] == 1 and second["points"] == 0
    assert board["above"] == 1 and first["place"] == 1 and second["place"] == 2
    assert amina.get("/api/leaderboard").json()["above"] == 0
    # the race: runie is 7 behind amina, amina leads runie by 7, and amina got 75% across her two attempts
    standing = board["standing"]
    assert standing["ahead"] == {"name": "amina", "gap": 7} and standing["behind"] is None
    assert standing["accuracy"] is None and standing["tested"] == 1 and standing["last_week"] == 0
    theirs = amina.get("/api/leaderboard").json()
    assert theirs["standing"]["behind"] == {"name": "runie", "gap": 7} and theirs["standing"]["ahead"] is None
    assert theirs["standing"]["accuracy"] == 75 and theirs["standing"]["accuracy_place"] == 1


def test_a_picked_face_shows_to_friends_and_only_known_faces_are_allowed(tmp_path):
    app = made_app(tmp_path)
    me = signed_in(TestClient(app), "runie")
    amina = signed_in(TestClient(app), "amina")
    assert amina.patch("/api/me", json={"avatar": "puffs"}).json()["avatar"] == "puffs"
    assert amina.patch("/api/me", json={"avatar": "<script>"}).status_code == 400
    assert me.get("/api/people", params={"q": "ami"}).json()["people"][0]["avatar"] == "puffs"
    me.post("/api/friends", json={"username": "amina"})
    amina.post("/api/friends/runie/accept")
    rows = {r["username"]: r for r in me.get("/api/leaderboard").json()["board"]}
    assert rows["amina"]["avatar"] == "puffs" and rows["runie"]["avatar"] == ""
    # back to the letter
    assert amina.patch("/api/me", json={"avatar": ""}).json()["avatar"] == ""
