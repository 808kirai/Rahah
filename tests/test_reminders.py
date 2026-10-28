from datetime import date, timedelta

import pytest
from fastapi.testclient import TestClient

from app.config import settings
from app.main import create_app
from app.recommend import describe_history
from app.reminders import calendar_file, reminder_days

from .fakes import fake_client


@pytest.fixture
def web(tmp_path):
    return TestClient(create_app(settings(db_path=tmp_path / "rem.db"), client=fake_client()))


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
