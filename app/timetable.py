"""the weekly timetable, classes that happen on the same day and time every week, and calendar files for them

days run monday 0 to sunday 6 like python's weekday, and times are the student's own hh:mm,
so a class means the same time wherever the page is opened
"""

from datetime import date, datetime, timedelta, timezone

from pydantic import BaseModel, Field, field_validator, model_validator

from .modes import modes
from .reminders import fold, ics_text

day_names = ("Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday")
day_codes = ("MO", "TU", "WE", "TH", "FR", "SA", "SU")

# calendar alerts go off this many minutes before each class
alert_minutes = 15


class class_in(BaseModel):
    title: str = Field(min_length=1, max_length=80)
    mode: str = ""
    day: int = Field(ge=0, le=6)
    start_time: str
    end_time: str
    place: str = Field(default="", max_length=60)

    # trimmed before the length checks, so a name of only spaces counts as empty
    @field_validator("title", "place", mode="before")
    @classmethod
    def trimmed(cls, value):
        return value.strip() if isinstance(value, str) else value

    @field_validator("mode")
    @classmethod
    def known_mode(cls, value: str) -> str:
        if value and value not in modes:
            raise ValueError("Unknown subject.")
        return value

    @field_validator("start_time", "end_time")
    @classmethod
    def real_time(cls, value: str) -> str:
        try:
            return datetime.strptime(value, "%H:%M").strftime("%H:%M")
        except ValueError:
            raise ValueError("Pick a real time.")

    @model_validator(mode="after")
    def ends_after_start(self):
        if self.end_time <= self.start_time:
            raise ValueError("The class has to end after it starts.")
        return self


def first_day(day: int, today: date | None = None) -> date:
    """the next date that falls on this weekday, today included"""
    today = today or date.today()
    return today + timedelta(days=(day - today.weekday()) % 7)


def event_lines(item: dict, stamp: str, today: date | None = None) -> list[str]:
    on = first_day(item["day"], today)
    start = datetime.combine(on, datetime.strptime(item["start_time"], "%H:%M").time())
    end = datetime.combine(on, datetime.strptime(item["end_time"], "%H:%M").time())
    # floating times, so calendars read them in the student's own time zone
    lines = [
        "BEGIN:VEVENT", f"UID:{item['id']}@rahah-timetable", f"DTSTAMP:{stamp}",
        f"DTSTART:{start:%Y%m%dT%H%M%S}", f"DTEND:{end:%Y%m%dT%H%M%S}",
        f"RRULE:FREQ=WEEKLY;BYDAY={day_codes[item['day']]}",
        f"SUMMARY:{ics_text(item['title'])}",
    ]
    if item["place"]:
        lines.append(f"LOCATION:{ics_text(item['place'])}")
    if item["mode"] in modes:
        lines.append(f"DESCRIPTION:{ics_text(modes[item['mode']]['name'])}")
    lines += [
        "BEGIN:VALARM", "ACTION:DISPLAY",
        f"DESCRIPTION:{ics_text(item['title'] + ' starts in ' + str(alert_minutes) + ' minutes')}",
        f"TRIGGER:-PT{alert_minutes}M", "END:VALARM",
        "END:VEVENT",
    ]
    return lines


def calendar_file(classes: list[dict], today: date | None = None) -> str:
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Rahah//Timetable//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH"]
    for item in classes:
        lines += event_lines(item, stamp, today)
    lines.append("END:VCALENDAR")
    return "\r\n".join(part for line in lines for part in fold(line)) + "\r\n"
