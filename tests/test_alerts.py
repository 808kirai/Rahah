import gzip
import logging

from fastapi.testclient import TestClient

from app.alerts import alert_box, alert_handler
from app.config import settings
from app.main import create_app

from .fakes import fake_client


def mail_app(tmp_path, sent, **options):
    cfg = settings(db_path=tmp_path / "mail.db", smtp_user="studywithrahah@gmail.com", smtp_password="app-password",
                   admin_email="boss@example.com", **options)
    return create_app(cfg, client=fake_client(), mailer=lambda to, subject, text, attachment=None: sent.append((to, subject, text, attachment)))


def test_the_daily_backup_is_emailed_once_a_day(tmp_path):
    sent = []
    with TestClient(mail_app(tmp_path, sent)):
        pass
    backups = [m for m in sent if m[1].startswith("Rahah backup")]
    assert len(backups) == 1
    to, subject, text, attachment = backups[0]
    assert to == "studywithrahah@gmail.com" and "restore" in text
    name, data, kind = attachment
    assert name.endswith(".db.gz") and kind == "application/gzip"
    assert gzip.decompress(data).startswith(b"SQLite format 3")
    # starting again the same day doesn't send another
    with TestClient(mail_app(tmp_path, sent)):
        pass
    assert len([m for m in sent if m[1].startswith("Rahah backup")]) == 1


def test_backups_and_alerts_stay_off_without_email_or_when_turned_off(tmp_path):
    sent = []
    app = create_app(settings(db_path=tmp_path / "plain.db"), client=fake_client(), mailer=lambda *a, **k: sent.append(a))
    with TestClient(app):
        pass
    with TestClient(mail_app(tmp_path, sent, backup_email="off")):
        pass
    assert sent == []


def test_problems_are_gathered_into_one_email_every_half_hour():
    sent = []
    box = alert_box(lambda subject, text: sent.append((subject, text)), every=1800, keep=3)
    log = logging.getLogger("rahah-test-alerts")
    handler = alert_handler(box)
    log.addHandler(handler)
    try:
        log.info("all fine")
        log.warning("claude said it was overloaded")
        try:
            raise ValueError("bad thing")
        except ValueError:
            log.exception("something broke on GET /api/x")
        for n in range(5):
            log.warning("again %s", n)
    finally:
        log.removeHandler(handler)
    assert box.flush() is True
    subject, text = sent[0]
    assert subject == "Rahah: 7 problems on the server"
    assert "overloaded" in text and "ValueError: bad thing" in text and "and 4 more" in text and "all fine" not in text
    # nothing new, or too soon after the last email, sends nothing
    assert box.flush() is False
    box.add("later problem")
    assert box.flush() is False and len(sent) == 1
