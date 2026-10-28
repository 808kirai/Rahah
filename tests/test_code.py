from datetime import timedelta

import pytest
from fastapi.testclient import TestClient

from app.config import settings
from app.main import create_app
from app.tutor import code_tool, display_from_content

from .fakes import fake_client, message, run_block, run_result, text_block, thinking_block
from .test_api import ask, new_chat


@pytest.fixture
def setup(tmp_path):
    def build(replies=()):
        claude = fake_client(replies)
        app = create_app(settings(db_path=tmp_path / "code.db"), client=claude)
        return TestClient(app), claude
    return build


def test_runs_sit_in_the_text_where_they_happened():
    content = [
        text_block("Let me check."),
        run_block("python3 add.py"),
        run_result("5\n", files=["file_plot"]),
        text_block("It prints 5."),
    ]
    outputs = {"file_plot": {"id": "file_plot", "name": "plot.png", "type": "image/png"}}
    display = display_from_content(content, outputs)
    assert display["text"] == "Let me check.\n\n⟦run:0⟧\n\nIt prints 5."
    run = display["runs"][0]
    assert run["kind"] == "bash" and run["code"] == "python3 add.py"
    assert run["stdout"] == "5\n" and run["exit"] == 0 and run["done"]
    assert run["files"] == [outputs["file_plot"]]


def test_coding_mode_runs_code_streams_it_and_keeps_the_sandbox(setup):
    first = message(
        [thinking_block(), run_block("python3 -c 'print(2 + 3)'"), run_result("5\n"), text_block("It prints 5.")],
        container="container_a",
    )
    second = message([text_block("Still here.")], container="container_a")
    web, claude = setup([first, second])
    conversation_id = new_chat(web, mode="coding")

    events = ask(web, conversation_id, "what does 2 + 3 print?", mode="coding")
    kinds = [e["t"] for e in events]
    assert kinds.index("run") < kinds.index("run_done") < kinds.index("done")
    assert events[kinds.index("run")]["v"]["run"]["code"] == "python3 -c 'print(2 + 3)'"
    assert events[kinds.index("run_done")]["v"]["stdout"] == "5\n"

    calls = claude.beta.messages.calls
    assert calls[0]["tools"] == [code_tool]
    assert "container" not in calls[0]

    # the next turn goes back into the same sandbox, and the saved chat shows the run
    ask(web, conversation_id, "and again?", mode="coding")
    assert calls[1]["container"] == "container_a"
    saved = web.get(f"/api/conversations/{conversation_id}").json()
    assert saved["messages"][1]["runs"][0]["stdout"] == "5\n"


def test_other_modes_have_no_code_tool_until_a_chat_has_run_code(setup):
    web, claude = setup([
        message([text_block("hi")]),
        message([run_block("ls"), run_result(""), text_block("done")], container="container_b"),
        message([text_block("back to maths")]),
    ])
    conversation_id = new_chat(web)
    ask(web, conversation_id, "hello")
    ask(web, conversation_id, "list files", mode="coding")
    ask(web, conversation_id, "now maths", mode="maths")
    calls = claude.beta.messages.calls
    assert "tools" not in calls[0]
    # the history now holds a run, so the tool stays on after leaving coding mode
    assert calls[2]["tools"] == [code_tool]


def test_an_expired_sandbox_is_not_reused(setup):
    web, claude = setup([
        message([run_block("ls"), run_result(""), text_block("done")], container="old", expires_in=timedelta(minutes=1)),
        message([text_block("fresh")]),
    ])
    conversation_id = new_chat(web, mode="coding")
    ask(web, conversation_id, "one", mode="coding")
    ask(web, conversation_id, "two", mode="coding")
    assert "container" not in claude.beta.messages.calls[1]


def test_a_paused_turn_is_resumed_and_saved_as_one_answer(setup):
    paused = message([run_block("python3 slow.py"), run_result("step 1\n")], stop_reason="pause_turn", container="c1")
    rest = message([text_block("All steps ran.")], container="c1")
    web, claude = setup([paused, rest])
    conversation_id = new_chat(web, mode="coding")
    events = ask(web, conversation_id, "run the slow script", mode="coding")
    assert events[-1]["t"] == "done" and not events[-1]["v"]["truncated"]

    calls = claude.beta.messages.calls
    assert len(calls) == 2
    resumed = calls[1]["messages"]
    # no new user message, the answer so far goes back as the last assistant turn
    assert resumed[-1]["role"] == "assistant"
    assert [b["type"] for b in resumed[-1]["content"]] == ["server_tool_use", "bash_code_execution_tool_result"]
    assert calls[1]["container"] == "c1"

    saved = web.get(f"/api/conversations/{conversation_id}").json()["messages"][1]
    assert saved["runs"][0]["stdout"] == "step 1\n"
    assert saved["text"].endswith("All steps ran.")


def test_files_from_runs_are_named_and_served_safely(setup):
    reply = message(
        [run_block("python3 plot.py"), run_result("", files=["file_png", "file_html"]), text_block("Here it is.")],
        container="c2",
    )
    web, claude = setup([reply])
    claude.files.made = {"file_png": ("plot.png", "image/png"), "file_html": ("page.html", "text/html")}
    conversation_id = new_chat(web, mode="coding")

    events = ask(web, conversation_id, "plot it", mode="coding")
    done = next(e for e in events if e["t"] == "run_done")
    assert [f["name"] for f in done["v"]["files"]] == ["plot.png", "page.html"]

    image = web.get("/api/outputs/file_png")
    assert image.status_code == 200
    assert image.headers["content-type"] == "image/png"
    assert image.headers["content-disposition"].startswith("inline")

    # anything that isn't a plain image is a download, never a page on rahah's address
    page = web.get("/api/outputs/file_html")
    assert page.headers["content-type"] == "application/octet-stream"
    assert page.headers["content-disposition"].startswith("attachment")

    assert web.get("/api/outputs/file_never_made").status_code == 404


def test_code_files_can_be_uploaded(setup):
    web, claude = setup()
    conversation_id = new_chat(web, mode="coding")
    upload = web.post(
        "/api/files",
        data={"conversation_id": conversation_id},
        files={"file": ("main.py", b"print('hi')\n")},
    )
    assert upload.status_code == 200
    assert upload.json()["kind"] == "document"
    assert claude.files.uploads[0][2] == "text/plain"
