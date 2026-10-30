from datetime import date, timedelta

import pytest
from fastapi.testclient import TestClient

from app.config import settings
from app.main import create_app
from app.recommend import describe_history
from app.reminders import calendar_file, reminder_days

from .fakes import signed_in, fake_client


@pytest.fixture
def web(tmp_path):
    return signed_in(TestClient(create_app(settings(db_path=tmp_path / "rem.db"), client=fake_client())))


def in_days(n: int) -> str:
    return (date.today() + timedelta(days=n)).isoformat()


def add(web, **fields):
    body = {"kind": "exam", "title": "Biology paper 2", "mode": "science", "due_date": in_days(10), **fields}
    return web.post("/api/reminders", json=body)


def test_reminders_repeat_until_the_day_before_and_on_the_day():
    assert reminder_days(14, 3) == [14, 11, 8, 5, 2, 1, 0]
    assert reminder_days(7, 7) == [7, 1, 0]
    assert reminder_days(1, 2) == [1, 0]


def test_a_reminder_is_saved_listed_and_changed(web):
    made = add(web, every_days=3, lead_days=14, due_time="09:30", notes="  bring a calculator  ").json()
    assert made["reminder_days"] == [14, 11, 8, 5, 2, 1, 0]
    assert made["notes"] == "bring a calculator" and made["done"] is False and made["seen"] == []

    add(web, kind="assignment", title="Essay draft", due_date=in_days(3))
    listed = web.get("/api/reminders").json()
    # soonest first
    assert [r["title"] for r in listed["reminders"]] == ["Essay draft", "Biology paper 2"]
    assert listed["kinds"]["cat"] == "CAT"

    changed = web.put(f"/api/reminders/{made['id']}", json={
        "kind": "midterm", "title": "Biology midterm", "mode": "science", "due_date": in_days(12),
        "every_days": 7, "lead_days": 7,
    }).json()
    assert changed["kind"] == "midterm" and changed["reminder_days"] == [7, 1, 0]

    assert web.post(f"/api/reminders/{made['id']}/seen", json={"day": in_days(0)}).json()["seen"] == [in_days(0)]
    # the same day twice is only kept once
    assert web.post(f"/api/reminders/{made['id']}/seen", json={"day": in_days(0)}).json()["seen"] == [in_days(0)]
    assert web.post(f"/api/reminders/{made['id']}/done", json={"done": True}).json()["done"] is True

    assert web.delete(f"/api/reminders/{made['id']}").status_code == 200
    assert web.delete(f"/api/reminders/{made['id']}").status_code == 404


def test_bad_reminders_are_turned_away(web):
    assert add(web, kind="party").status_code == 422
    assert add(web, title="   ").status_code == 422
    assert add(web, due_date="2026-02-30").status_code == 422
    assert add(web, due_time="25:00").status_code == 422
    assert add(web, mode="astrology").status_code == 422
    assert add(web, every_days=0).status_code == 422
    assert web.post("/api/reminders/nope/seen", json={"day": in_days(0)}).status_code == 404


def test_calendar_files_carry_an_alert_for_every_reminder_day():
    all_day = {
        "id": "r1", "kind": "exam", "title": "Physics, paper 1", "mode": "science", "due_date": "2026-11-20",
        "due_time": "", "every_days": 7, "lead_days": 7, "notes": "Room 4; bring ID",
    }
    timed = {**all_day, "id": "r2", "due_time": "14:00"}
    text = calendar_file([all_day, timed])
    assert text.count("BEGIN:VEVENT") == 2 and text.count("BEGIN:VALARM") == 6
    assert "DTSTART;VALUE=DATE:20261120" in text and "DTSTART:20261120T140000" in text
    assert "SUMMARY:Exam: Physics\\, paper 1" in text and "Room 4\\; bring ID" in text
    # all day events start at midnight, so the day before at nine is 15 hours earlier
    assert "TRIGGER:-PT900M" in text and "TRIGGER:PT540M" in text
    # the timed one starts at two, so nine on the day is 5 hours before
    assert "TRIGGER:-PT300M" in text
    assert all(len(line.encode()) <= 75 for line in text.split("\r\n"))


def test_calendar_downloads(web):
    assert web.get("/api/reminders/calendar.ics").status_code == 404
    made = add(web).json()
    add(web, title="Already over", due_date=in_days(-2))
    one = web.get(f"/api/reminders/{made['id']}/calendar.ics")
    assert one.status_code == 200 and one.headers["content-type"].startswith("text/calendar")
    every = web.get("/api/reminders/calendar.ics").text
    # past events are left out of the full calendar
    assert every.count("BEGIN:VEVENT") == 1


def test_suggestions_know_about_deadlines_coming_up():
    deadline = {"id": "r1", "kind": "midterm", "title": "Cell biology", "mode": "science", "due_date": in_days(3), "updated": 1}
    text = describe_history([], [], {}, [deadline])
    assert "Midterm [Science] Cell biology" in text and "in 3 days" in text


def test_only_reminders_still_to_come_are_upcoming():
    from app.reminders import is_upcoming
    today = date(2026, 11, 1)
    base = {"done": False, "due_date": "2026-11-01"}
    assert is_upcoming(base, today)
    assert is_upcoming({**base, "due_date": "2026-11-05"}, today)
    assert not is_upcoming({**base, "due_date": "2026-10-31"}, today)
    assert not is_upcoming({**base, "done": True}, today)


def test_done_reminders_leave_the_full_calendar(web):
    first = add(web).json()
    add(web, title="Chemistry paper 1", due_date=in_days(5))
    web.post(f"/api/reminders/{first['id']}/done", json={"done": True})
    every = web.get("/api/reminders/calendar.ics").text
    assert every.count("BEGIN:VEVENT") == 1 and "Chemistry paper 1" in every
    # once everything is done there is nothing left to add
    second = [r for r in web.get("/api/reminders").json()["reminders"] if not r["done"]][0]
    web.post(f"/api/reminders/{second['id']}/done", json={"done": True})
    assert web.get("/api/reminders/calendar.ics").status_code == 404
    # marking it not done brings it back
    web.post(f"/api/reminders/{second['id']}/done", json={"done": False})
    assert web.get("/api/reminders/calendar.ics").status_code == 200


def test_missing_reminders_and_bad_bodies_are_refused(web):
    body = {"kind": "exam", "title": "x", "due_date": in_days(1)}
    assert web.put("/api/reminders/nope", json=body).status_code == 404
    assert web.post("/api/reminders/nope/done", json={"done": True}).status_code == 404
    assert web.get("/api/reminders/nope/calendar.ics").status_code == 404
    made = add(web).json()
    assert web.post(f"/api/reminders/{made['id']}/seen", json={"day": "tomorrow"}).status_code == 422
    assert add(web, title="x" * 121).status_code == 422
    assert add(web, notes="x" * 1001).status_code == 422
    assert add(web, lead_days=181).status_code == 422
    assert add(web, every_days=31).status_code == 422


def test_alerts_say_how_far_off_the_event_is():
    from app.reminders import alert_message
    r = {"kind": "cat", "title": "Maths CAT"}
    assert alert_message(r, 0) == "CAT: Maths CAT is today"
    assert alert_message(r, 1) == "CAT: Maths CAT is tomorrow"
    assert alert_message(r, 9) == "CAT: Maths CAT is in 9 days"
    text = calendar_file([{
        "id": "r1", "kind": "cat", "title": "Maths CAT", "mode": "", "due_date": "2026-11-20",
        "due_time": "", "every_days": 7, "lead_days": 7, "notes": "",
    }])
    assert "DESCRIPTION:CAT: Maths CAT is in 7 days" in text and "is tomorrow" in text and "is today" in text
    # with no subject and no notes the event itself has no description
    event = text.split("BEGIN:VALARM")[0]
    assert "DESCRIPTION" not in event


def test_the_days_a_reminder_was_shown_are_capped(web):
    made = add(web).json()
    for n in range(65):
        seen = web.post(f"/api/reminders/{made['id']}/seen", json={"day": f"2026-{1 + n // 28:02d}-{1 + n % 28:02d}"}).json()["seen"]
    # only the latest 60 days are kept, so the list never grows without end
    assert len(seen) == 60 and seen[-1] == "2026-03-09"


def test_a_reminder_under_the_students_own_subject(web):
    law = web.post("/api/subjects", json={"name": "Law of torts"}).json()["id"]
    made = add(web, mode=law, title="Torts exam").json()
    assert made["mode"] == law
    text = web.get(f"/api/reminders/{made['id']}/calendar.ics").text
    assert "DESCRIPTION:Law of torts" in text
    # removing the subject moves the reminder back to general study, stored as blank
    web.delete(f"/api/subjects/{law}")
    assert web.get("/api/reminders").json()["reminders"][0]["mode"] == ""


# revision plans

def test_a_plan_runs_from_today_to_the_day_before_and_at_most_three_weeks():
    from app.plans import max_days, plan_dates
    today = date(2026, 11, 1)
    assert plan_dates(today, date(2026, 11, 4)) == [date(2026, 11, 1), date(2026, 11, 2), date(2026, 11, 3)]
    assert plan_dates(today, date(2026, 11, 1)) == []
    far = plan_dates(today, date(2027, 1, 1))
    # only the last weeks before a far off exam are planned
    assert len(far) == max_days and far[-1] == date(2026, 12, 31)


def plan_web(tmp_path, replies):
    import json as _json
    from .fakes import message, text_block
    claude = fake_client([message([text_block(_json.dumps(r))]) for r in replies])
    return signed_in(TestClient(create_app(settings(db_path=tmp_path / "plan.db"), client=claude))), claude


def test_a_plan_is_made_checked_saved_and_ticked_off(tmp_path):
    days = [in_days(i) for i in range(3)]
    reply = {"days": [
        {"date": days[0], "focus": "Cells", "tasks": [{"kind": "flashcards", "topic": "Organelles", "minutes": 20},
                                                     {"kind": "dance", "topic": "dropped, not a task kind", "minutes": 10}]},
        {"date": days[1], "focus": "Genetics", "tasks": [{"kind": "test", "topic": "Inheritance", "minutes": 500}]},
        {"date": "1999-01-01", "focus": "dropped, not a planned day", "tasks": [{"kind": "read", "topic": "x", "minutes": 5}]},
        {"date": days[2], "focus": "Review", "tasks": [{"kind": "rest", "topic": "Early night", "minutes": 30}]},
    ]}
    web, claude = plan_web(tmp_path, [reply])
    made = add(web, due_date=in_days(3)).json()
    planned = web.post(f"/api/reminders/{made['id']}/plan", json={"today": in_days(0), "topics": "cells and genetics"}).json()
    plan = planned["plan"]
    assert [d["date"] for d in plan["days"]] == days and plan["topics"] == "cells and genetics"
    assert plan["days"][0]["tasks"] == [{"kind": "flashcards", "topic": "Organelles", "minutes": 20}]
    # minutes stay sensible
    assert plan["days"][1]["tasks"][0]["minutes"] == 180
    asked = claude.beta.messages.calls[0]["messages"][0]["content"]
    assert ", ".join(days) in asked and "cells and genetics" in asked

    ticked = web.post(f"/api/reminders/{made['id']}/plan/day", json={"date": days[1], "done": True}).json()
    assert [d["done"] for d in ticked["plan"]["days"]] == [False, True, False]
    assert web.post(f"/api/reminders/{made['id']}/plan/day", json={"date": "2000-01-01", "done": True}).status_code == 404

    calendar = web.get(f"/api/reminders/{made['id']}/plan.ics").text
    assert calendar.count("BEGIN:VEVENT") == 3 and "SUMMARY:Revise: Cells" in calendar
    # changing the reminder keeps its plan
    web.put(f"/api/reminders/{made['id']}", json={"kind": "exam", "title": "Biology paper 2", "due_date": in_days(3), "notes": "hall 2"})
    assert web.get("/api/reminders").json()["reminders"][0]["plan"]["days"][1]["done"] is True


def test_no_plan_when_the_exam_is_today(tmp_path):
    web, _ = plan_web(tmp_path, [])
    made = add(web, due_date=in_days(0)).json()
    refused = web.post(f"/api/reminders/{made['id']}/plan", json={"today": in_days(0)})
    assert refused.status_code == 422 and "too close" in refused.json()["detail"]
    assert web.get(f"/api/reminders/{made['id']}/plan.ics").status_code == 404
