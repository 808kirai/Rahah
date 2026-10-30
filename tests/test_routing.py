import pytest
from fastapi.testclient import TestClient

from app.config import settings
from app.main import create_app
from app.routing import chat_route, chat_tier, choices_for, pick
from app.usage import summarise

from .fakes import fake_client, message, signed_in, stalled_stream, text_block


@pytest.fixture
def setup(tmp_path):
    def build(replies=(), **options):
        claude = fake_client(replies)
        return create_app(settings(db_path=tmp_path / "route.db", **options), client=claude), claude
    return build


def answer(web, mode="general", text="hi", **extra):
    chat = web.post("/api/conversations", json={"mode": mode}).json()["id"]
    return chat, web.post(f"/api/conversations/{chat}/messages", json={"text": text, "mode": mode, **extra})


def test_each_name_is_a_model():
    cfg = settings()
    assert chat_route(cfg, "acolyte", "general", False).model == "claude-haiku-5-5"
    assert chat_route(cfg, "mage", "general", False).model == "claude-sonnet-5-5"
    assert chat_route(cfg, "archmage", "general", False).model == "claude-opus-5-5"
    # study material is made by acolyte and answers are marked by mage, with a bit more thought
    assert pick(cfg, "tools").model == "claude-haiku-5-5" and pick(cfg, "tools").effort == "high"
    assert pick(cfg, "marking").model == "claude-sonnet-5-5" and pick(cfg, "marking").effort == "high"


def test_auto_picks_by_subject():
    assert chat_tier("auto", "general", False) == "acolyte"
    assert chat_tier("auto", "humanities", False) == "acolyte"
    assert chat_tier("auto", "my-abc123", False) == "acolyte"
    assert chat_tier("auto", "maths", False) == "mage"
    assert chat_tier("auto", "science", False) == "mage"
    assert chat_tier("auto", "coding", False) == "mage"
    # once code has run in a chat, it keeps the model that can run it well
    assert chat_tier("auto", "general", True) == "mage"
    # a student's own pick wins over auto
    assert chat_tier("acolyte", "maths", False) == "acolyte"


def test_the_picker_only_shows_the_names(setup):
    app, _ = setup(model="claude-haiku-5-5")
    web = signed_in(TestClient(app))
    choices = web.get("/api/me").json()["models"]
    assert [c["name"] for c in choices] == ["Auto", "Acolyte", "Mage", "Archmage"]
    # students never see which claude model sits behind a name
    assert "claude" not in str(choices).lower() and "haiku" not in str(choices).lower()


def test_one_model_for_everything_when_set():
    cfg = settings(model="claude-haiku-5-5")
    assert {chat_route(cfg, c, "maths", False).model for c in ("auto", "acolyte", "mage", "archmage")} == {"claude-haiku-5-5"}
    assert pick(cfg, "marking").model == "claude-haiku-5-5"


def test_archmage_is_only_listed_for_the_admin():
    assert [c["id"] for c in choices_for(False)] == ["auto", "acolyte", "mage"]
    assert [c["id"] for c in choices_for(True)] == ["auto", "acolyte", "mage", "archmage"]
    assert all("admin" not in c and c["name"] and c["hint"] for c in choices_for(True))


def test_chats_follow_the_pick_and_show_who_answered(setup):
    app, claude = setup([message([text_block("Answer.")]) for _ in range(5)])
    admin = signed_in(TestClient(app), "runie")
    student = signed_in(TestClient(app), "brian")
    assert [c["id"] for c in student.get("/api/me").json()["models"]] == ["auto", "acolyte", "mage"]
    assert "archmage" in [c["id"] for c in admin.get("/api/me").json()["models"]]

    _, sent = answer(student, "general", "what is osmosis?")
    assert claude.beta.messages.calls[0]["model"] == "claude-haiku-5-5" and "fallbacks" not in claude.beta.messages.calls[0]
    assert '"tier": "acolyte"' in sent.text

    chat, sent = answer(student, "maths", "solve 3x + 5 = 20")
    call = claude.beta.messages.calls[1]
    assert call["model"] == "claude-sonnet-5-5" and call["fallbacks"] == "default"
    # the model that answered is saved with the answer, so it shows when the chat is opened again
    assert student.get(f"/api/conversations/{chat}").json()["messages"][-1]["tier"] == "mage"

    _, sent = answer(student, "general", "explain the causes of world war one", model="mage")
    assert claude.beta.messages.calls[2]["model"] == "claude-sonnet-5-5"

    # archmage is for the admin, a student asking for it is turned away before anything is spent
    _, refused = answer(student, "general", "hard question", model="archmage")
    assert refused.status_code == 403 and len(claude.beta.messages.calls) == 3
    _, unknown = answer(student, "general", "hi", model="wizard")
    assert unknown.status_code == 400
    _, allowed = answer(admin, "general", "hard question", model="archmage")
    assert allowed.status_code == 200 and claude.beta.messages.calls[3]["model"] == "claude-opus-5-5"

    # trying again can use another pick
    assert student.post(f"/api/conversations/{chat}/retry", json={"mode": "maths", "model": "acolyte"}).status_code == 200
    assert claude.beta.messages.calls[4]["model"] == "claude-haiku-5-5"


def test_the_usage_box_shows_cost_per_model():
    rows = [
        {"model": "claude-haiku-5-5", "kind": "chat", "cost": 0.001, "created": 10, "input_tokens": 1, "output_tokens": 1, "cache_read": 0, "cache_write": 0, "searches": 0},
        {"model": "claude-haiku-5-5", "kind": "quiz", "cost": 0.002, "created": 10, "input_tokens": 1, "output_tokens": 1, "cache_read": 0, "cache_write": 0, "searches": 0},
        {"model": "claude-sonnet-5-5", "kind": "marking", "cost": 0.01, "created": 10, "input_tokens": 1, "output_tokens": 1, "cache_read": 0, "cache_write": 0, "searches": 0},
    ]
    assert summarise(rows, {"all": 0})["all"]["models"] == [
        {"model": "claude-sonnet-5-5", "requests": 1, "cost": 0.01},
        {"model": "claude-haiku-5-5", "requests": 2, "cost": 0.003},
    ]


def test_a_stuck_acolyte_answer_is_asked_of_mage(setup):
    app, claude = setup([stalled_stream(message([text_block("Too late.")]), 2), message([text_block("Mage here.")])], stall_seconds=0.3)
    web = signed_in(TestClient(app))
    _, sent = answer(web, "general", "what is osmosis?")
    assert sent.status_code == 200
    assert [c["model"] for c in claude.beta.messages.calls] == ["claude-haiku-5-5", "claude-sonnet-5-5"]
    # the student gets mage's answer, tagged as mage, and the stuck one never shows
    assert "Mage here." in sent.text and "Too late." not in sent.text and '"tier": "mage"' in sent.text
    # the switch is counted for the admin, at no cost
    stalls = [k for k in web.get("/api/usage").json()["all"]["kinds"] if k["kind"] == "stall"]
    assert stalls == [{"kind": "stall", "requests": 1, "cost": 0.0}]


def test_a_quick_acolyte_answer_and_mage_answers_are_left_alone(setup):
    app, claude = setup([stalled_stream(message([text_block("Quick enough.")]), 0.05), stalled_stream(message([text_block("Slow mage.")]), 0.5)], stall_seconds=0.3)
    web = signed_in(TestClient(app))
    _, sent = answer(web, "general")
    assert "Quick enough." in sent.text and len(claude.beta.messages.calls) == 1
    # mage is never switched, however long it takes to start
    _, sent = answer(web, "maths")
    assert "Slow mage." in sent.text and len(claude.beta.messages.calls) == 2
