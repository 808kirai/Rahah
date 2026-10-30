"""phone notifications for reminders, sent even when rahah is closed, through the browser's own push service,
and the calendar feed a phone's calendar app can subscribe to"""

import json
from datetime import datetime, timezone
from urllib.parse import urlparse
from zoneinfo import ZoneInfo

from cryptography.hazmat.primitives import serialization
from py_vapid import Vapid02, b64urlencode
from pywebpush import WebPushException, webpush

from .reminders import alert_hour, alert_message, event_lines as reminder_lines, fold, is_upcoming, reminder_days
from .timetable import event_lines as class_lines

# the push services browsers use. rahah only ever sends to these, so a made up address can't point it anywhere else
push_hosts = ("fcm.googleapis.com", "updates.push.services.mozilla.com", "push.apple.com", "notify.windows.com", "push.services.mozilla.com")


def new_keys() -> tuple[str, str]:
    """a key pair that proves the notifications come from this rahah, the private one kept and the public one for browsers"""
    key = Vapid02()
    key.generate_keys()
    private = key.private_pem().decode()
    public = key.public_key.public_bytes(serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint)
    return private, b64urlencode(public)


def allowed_endpoint(url: str) -> bool:
    parts = urlparse(url)
    host = (parts.hostname or "").lower()
    return parts.scheme == "https" and any(host == h or host.endswith("." + h) for h in push_hosts)


def zone(name: str):
    try:
        return ZoneInfo(name) if name else timezone.utc
    except Exception:
        return timezone.utc


def due_today(reminders: list[dict], local_now: datetime) -> list[tuple[dict, int]]:
    """the reminders with a reminder day today, from the alert hour on, each with how many days are left"""
    if local_now.hour < alert_hour:
        return []
    today = local_now.date()
    due = []
    for reminder in reminders:
        if not is_upcoming(reminder, today):
            continue
        days = (datetime.fromisoformat(reminder["due_date"]).date() - today).days
        if days in reminder_days(reminder["lead_days"], reminder["every_days"]):
            due.append((reminder, days))
    return due


def message_for(reminder: dict, days: int) -> dict:
    nudge = {"assignment": "Open Rahah to get started.", "event": "Open Rahah to get ready."}.get(reminder["kind"], "Open Rahah to plan your revision.")
    return {"title": alert_message(reminder, days), "body": nudge, "url": "/#/reminders", "tag": f"{reminder['id']}-{days}"}


def send_push(private_key: str, subscription: dict, payload: dict, contact: str) -> str:
    """sends one notification. gives back sent, gone when the phone has turned notifications off, or failed"""
    try:
        webpush(
            {"endpoint": subscription["endpoint"], "keys": {"p256dh": subscription["p256dh"], "auth": subscription["auth"]}},
            json.dumps(payload),
            vapid_private_key=Vapid02.from_pem(private_key.encode()),
            vapid_claims={"sub": f"mailto:{contact}"},
            ttl=12 * 3600,
            timeout=10,
        )
        return "sent"
    except WebPushException as error:
        status = getattr(error.response, "status_code", None)
        return "gone" if status in (404, 410) else "failed"


def feed_file(reminders: list[dict], classes: list[dict]) -> str:
    """one calendar with every upcoming reminder and every class, that a calendar app checks for changes"""
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    lines = [
        "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Rahah//Calendar//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
        "X-WR-CALNAME:Rahah", "X-WR-CALDESC:Exams\\, deadlines and classes from Rahah",
        "REFRESH-INTERVAL;VALUE=DURATION:PT1H", "X-PUBLISHED-TTL:PT1H",
    ]
    for reminder in reminders:
        if is_upcoming(reminder):
            lines += reminder_lines(reminder, stamp)
    for item in classes:
        lines += class_lines(item, stamp)
    lines.append("END:VCALENDAR")
    return "\r\n".join(part for line in lines for part in fold(line)) + "\r\n"

