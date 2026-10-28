"""reminders for exams, cats, midterms, assignments and other events, and calendar files for them

dates are kept as the student's own calendar dates, yyyy-mm-dd, with an optional hh:mm time,
so a reminder means the same day wherever the page is opened
"""

from datetime import date, datetime, timedelta, timezone

from pydantic import BaseModel, Field, field_validator

from .modes import modes

kinds = {
    "exam": "Exam",
    "cat": "CAT",
    "midterm": "Midterm",
    "assignment": "Assignment",
    "event": "Event",
}

# calendar alerts go off at this hour on each reminder day
alert_hour = 9


class reminder_in(BaseModel):
    kind: str
    title: str = Field(min_length=1, max_length=120)
    mode: str = ""
    due_date: str
    due_time: str = ""
    every_days: int = Field(default=2, ge=1, le=30)
    lead_days: int = Field(default=7, ge=1, le=180)
    notes: str = Field(default="", max_length=1000)

    @field_validator("kind")
    @classmethod
    def known_kind(cls, value: str) -> str:
        if value not in kinds:
            raise ValueError("Pick exam, CAT, midterm, assignment or event.")
        return value

    # trimmed before the length checks, so a title of only spaces counts as empty
    @field_validator("title", "notes", mode="before")
    @classmethod
    def trimmed(cls, value):
        return value.strip() if isinstance(value, str) else value

    @field_validator("mode")
    @classmethod
    def known_mode(cls, value: str) -> str:
        if value and value not in modes:
            raise ValueError("Unknown subject.")
        return value

    @field_validator("due_date")
    @classmethod
    def real_date(cls, value: str) -> str:
        try:
            return date.fromisoformat(value).isoformat()
        except ValueError:
            raise ValueError("Pick a real date.")

    @field_validator("due_time")
    @classmethod
    def real_time(cls, value: str) -> str:
        if not value:
            return ""
        try:
            return datetime.strptime(value, "%H:%M").strftime("%H:%M")
        except ValueError:
            raise ValueError("Pick a real time.")


def reminder_days(lead_days: int, every_days: int) -> list[int]:
    """how many days before the event each reminder comes, furthest first

    reminders start lead_days before and repeat every every_days, and the day before and the day
    itself are always included
    """
    days = set(range(lead_days, 1, -every_days))
    days.update({1, 0})
    return sorted(days, reverse=True)


def days_until(due_date: str, today: date | None = None) -> int:
    return (date.fromisoformat(due_date) - (today or date.today())).days


def is_upcoming(reminder: dict, today: date | None = None) -> bool:
    return not reminder["done"] and days_until(reminder["due_date"], today) >= 0


# calendar files, one event per reminder with an alert on every reminder day

def ics_text(value: str) -> str:
    return value.replace("\\", "\\\\").replace(";", "\\;").replace(",", "\\,").replace("\r\n", "\\n").replace("\n", "\\n")


def fold(line: str) -> list[str]:
    # calendar lines are kept to 75 bytes, longer ones carry on after a space
    out, current = [], ""
    for char in line:
        if len((current + char).encode("utf-8")) > 75:
            out.append(current)
            current = " " + char
        else:
            current += char
    out.append(current)
    return out


def alert_message(reminder: dict, days: int) -> str:
    name = f"{kinds[reminder['kind']]}: {reminder['title']}"
    if days == 0:
        return f"{name} is today"
    if days == 1:
        return f"{name} is tomorrow"
    return f"{name} is in {days} days"


def event_lines(reminder: dict, stamp: str) -> list[str]:
    due = date.fromisoformat(reminder["due_date"])
    lines = ["BEGIN:VEVENT", f"UID:{reminder['id']}@rahah", f"DTSTAMP:{stamp}"]
    if reminder["due_time"]:
        # a floating time, so calendars read it in the student's own time zone
        hour, minute = map(int, reminder["due_time"].split(":"))
        start = datetime(due.year, due.month, due.day, hour, minute)
        lines += [f"DTSTART:{start:%Y%m%dT%H%M%S}", f"DTEND:{start + timedelta(hours=1):%Y%m%dT%H%M%S}"]
    else:
        start = datetime(due.year, due.month, due.day)
        lines += [f"DTSTART;VALUE=DATE:{due:%Y%m%d}", f"DTEND;VALUE=DATE:{due + timedelta(days=1):%Y%m%d}"]
    lines.append(f"SUMMARY:{ics_text(kinds[reminder['kind']] + ': ' + reminder['title'])}")
    about = [modes[reminder["mode"]]["name"]] if reminder["mode"] in modes else []
    if reminder["notes"]:
        about.append(reminder["notes"])
    if about:
        lines.append(f"DESCRIPTION:{ics_text(chr(10).join(about))}")
    for days in reminder_days(reminder["lead_days"], reminder["every_days"]):
        alert = datetime(due.year, due.month, due.day, alert_hour) - timedelta(days=days)
        minutes = int((alert - start).total_seconds() // 60)
        trigger = f"-PT{-minutes}M" if minutes < 0 else f"PT{minutes}M"
        lines += [
            "BEGIN:VALARM", "ACTION:DISPLAY", f"DESCRIPTION:{ics_text(alert_message(reminder, days))}",
            f"TRIGGER:{trigger}", "END:VALARM",
        ]
    lines.append("END:VEVENT")
    return lines


def calendar_file(reminders: list[dict]) -> str:
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Rahah//Reminders//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH"]
    for reminder in reminders:
        lines += event_lines(reminder, stamp)
    lines.append("END:VCALENDAR")
    return "\r\n".join(part for line in lines for part in fold(line)) + "\r\n"
