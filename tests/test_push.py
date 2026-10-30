from datetime import date, datetime, timedelta, timezone

from fastapi.testclient import TestClient

from app.config import settings
from app.main import create_app

from .fakes import fake_client, signed_in

phone = {"endpoint": "https://fcm.googleapis.com/fcm/send/abc123", "p256dh": "key", "auth": "secret", "zone": "Africa/Nairobi"}


def push_app(tmp_path, sent, result="sent"):
    def pusher(subscription, payload):
        sent.append((subscription["endpoint"], payload))
        return result
    return create_app(settings(db_path=tmp_path / "push.db"), client=fake_client(), pusher=pusher)


def add_exam(web, days_away: int, title="Biology paper 2"):
    due = (date.today() + timedelta(days=days_away)).isoformat()
    made = web.post("/api/reminders", json={"kind": "exam", "title": title, "due_date": due, "every_days": 2, "lead_days": 7})
    assert made.status_code == 200, made.text
    return made.json()


def nairobi(hour: int) -> datetime:
    # the given hour today in Kenya, three hours ahead of UTC
    today = date.today()
    return datetime(today.year, today.month, today.day, hour, 0, tzinfo=timezone.utc) - timedelta(hours=3)


def test_notifications_only_go_to_real_push_services(tmp_path):
    web = signed_in(TestClient(push_app(tmp_path, [])), "amina")
    assert web.get("/api/push").json()["phones"] == 0
    assert web.post("/api/push", json={**phone, "endpoint": "https://evil.example/collect"}).status_code == 400
    assert web.post("/api/push", json={**phone, "endpoint": "http://fcm.googleapis.com/x"}).status_code == 400
    assert web.post("/api/push", json=phone).status_code == 200
    status = web.get("/api/push").json()
    assert status["phones"] == 1 and len(status["key"]) > 40
    web.post("/api/push/off", json=phone)
    assert web.get("/api/push").json()["phones"] == 0


def test_a_reminder_day_is_sent_once_from_nine_in_the_morning_where_the_student_is(tmp_path):
    sent = []
    app = push_app(tmp_path, sent)
    web = signed_in(TestClient(app), "amina")
    web.post("/api/push", json=phone)
    add_exam(web, 3)
    add_exam(web, 4, "Chemistry CAT")  # not a reminder day, 7 5 3 1 and 0 are
    assert app.state.send_due_pushes(nairobi(8)) == 0
    assert app.state.send_due_pushes(nairobi(10)) == 1
    endpoint, payload = sent[0]
    assert endpoint == phone["endpoint"] and payload["title"] == "Exam: Biology paper 2 is in 3 days" and payload["url"] == "/#/reminders"
    # later the same day nothing goes out again
    assert app.state.send_due_pushes(nairobi(15)) == 0


def test_a_phone_that_turned_notifications_off_is_forgotten(tmp_path):
    sent = []
    app = push_app(tmp_path, sent, result="gone")
    web = signed_in(TestClient(app), "amina")
    web.post("/api/push", json=phone)
    add_exam(web, 0)
    app.state.send_due_pushes(nairobi(10))
    assert len(sent) == 1 and web.get("/api/push").json()["phones"] == 0


def test_the_calendar_link_has_reminders_and_classes_and_can_be_replaced(tmp_path):
    app = push_app(tmp_path, [])
    web = signed_in(TestClient(app), "amina")
    add_exam(web, 5)
    assert web.post("/api/timetable", json={"title": "Chemistry", "day": 2, "start_time": "08:00", "end_time": "09:00"}).status_code == 200
    url = web.get("/api/calendar").json()["url"]
    assert web.get("/api/calendar").json()["url"] == url
    path = url.split("testserver")[1]
    feed = TestClient(app).get(path)
    assert feed.status_code == 200 and feed.headers["content-type"].startswith("text/calendar")
    assert "X-WR-CALNAME:Rahah" in feed.text and "Biology paper 2" in feed.text and "SUMMARY:Chemistry" in feed.text and "VALARM" in feed.text
    # a new link stops the old one
    new = web.post("/api/calendar/new").json()["url"]
    assert new != url
    assert TestClient(app).get(path).status_code == 404
    assert TestClient(app).get(new.split("testserver")[1]).status_code == 200
    assert TestClient(app).get("/cal/not-a-real-token-at-all.ics").status_code == 404
