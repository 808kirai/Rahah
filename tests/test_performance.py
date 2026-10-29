import json

import pytest
from fastapi.testclient import TestClient

from app.config import settings
from app.main import create_app
from app.performance import grade_for, percent, summarise

from .fakes import fake_client, message, text_block


def test_grades_follow_the_scale_at_each_boundary():
    assert [grade_for(p) for p in (100, 80, 79, 70, 69, 60, 59, 50, 49, 40, 39, 0)] == [
        "A", "A", "B", "B", "C", "C", "D", "D", "E", "E", "F", "F",
    ]
    assert percent(7, 9) == 78 and percent(0, 0) == 0


def attempt(set_id, mode, score, total, created, title="Quiz"):
    return {"set_id": set_id, "title": title, "mode": mode, "score": score, "total": total, "created": created}


def test_summary_weights_by_questions_and_ranks_subjects():
    result = summarise([
        attempt("q1", "maths", 4, 5, 1),
        attempt("q2", "science", 6, 20, 2),
        attempt("q1", "maths", 5, 5, 3),
    ])
    overall = result["overall"]
    assert overall["attempts"] == 3 and overall["quizzes"] == 2 and overall["questions"] == 30
    assert overall["average"] == 50 and overall["grade"] == "D"
    assert overall["latest"] == 100 and overall["change"] == 70
    assert overall["best_subject"] == "maths" and overall["weakest_subject"] == "science"
    assert [(s["mode"], s["average"], s["grade"]) for s in result["subjects"]] == [("maths", 90, "A"), ("science", 30, "F")]
    assert {g["grade"]: g["count"] for g in result["grades"]} == {"A": 2, "B": 0, "C": 0, "D": 0, "E": 0, "F": 1}
    q1 = next(q for q in result["quizzes"] if q["id"] == "q1")
    assert (q1["attempts"], q1["best"], q1["latest"], q1["grade"]) == (2, 100, 100, "A")
    assert [q["id"] for q in result["quizzes"]] == ["q1", "q2"]
    assert [t["percent"] for t in result["timeline"]] == [80, 30, 100]


def test_no_attempts_gives_an_empty_summary():
    result = summarise([])
    assert result["overall"] is None and result["timeline"] == [] and result["quizzes"] == []
    assert [g["grade"] for g in result["scale"]] == ["A", "B", "C", "D", "E", "F"]


@pytest.fixture
def web(tmp_path):
    quiz = {"title": "Capitals", "questions": [
        {"question": f"Q{i}", "options": ["a", "b", "c", "d"], "answer": 0, "explanation": ""} for i in range(4)
    ]}
    claude = fake_client([message([text_block(json.dumps(quiz))])])
    return TestClient(create_app(settings(db_path=tmp_path / "p.db"), client=claude))


def test_every_attempt_is_kept_and_deleting_the_quiz_clears_them(web):
    assert web.get("/api/performance").json()["overall"] is None
    quiz = web.post("/api/sets", data={"kind": "quiz", "topic": "capitals", "mode": "humanities"}).json()
    web.post(f"/api/sets/{quiz['id']}/score", json={"score": 2})
    web.post(f"/api/sets/{quiz['id']}/score", json={"score": 3})

    body = web.get("/api/performance").json()
    assert [t["percent"] for t in body["timeline"]] == [50, 75]
    assert body["overall"]["average"] == 63 and body["overall"]["grade"] == "C"
    assert body["quizzes"][0]["best"] == 75 and body["quizzes"][0]["attempts"] == 2
    assert web.get(f"/api/sets/{quiz['id']}").json()["best_score"] == 3

    web.delete(f"/api/sets/{quiz['id']}")
    assert web.get("/api/performance").json()["overall"] is None


def test_gpa_counts_each_test_once_at_its_best_attempt():
    result = summarise([
        attempt("q1", "maths", 2, 5, 1),     # 40, E
        attempt("q1", "maths", 4, 5, 2),     # 80, A, the best of q1
        attempt("q2", "maths", 3, 5, 3),     # 60, C
        attempt("q3", "science", 7, 10, 4),  # 70, B
    ])
    maths = next(s for s in result["subjects"] if s["mode"] == "maths")
    assert maths["tests"] == 2 and maths["gpa"] == 3.0
    assert next(s for s in result["subjects"] if s["mode"] == "science")["gpa"] == 3.0
    assert result["overall"]["gpa"] == 3.0 and result["overall"]["subjects"] == 2
    q1 = next(q for q in result["quizzes"] if q["id"] == "q1")
    # the newest attempt comes first in a test's history
    assert [h["percent"] for h in q1["history"]] == [80, 40]
    assert {s["grade"]: s["points"] for s in result["scale"]} == {"A": 4.0, "B": 3.0, "C": 2.0, "D": 1.0, "E": 0.0, "F": 0.0}
