"""revision plans for an exam, cat or midterm, a few tasks a day from today until the day before,
asked for from claude as structured json and checked before they are saved"""

import json
from datetime import date, datetime, timedelta, timezone

from .config import settings
from .modes import modes
from .reminders import ics_text, fold, kinds
from .study import clean_text, study_error
from .routing import pick
from .tutor import fallback_options
from .usage import usage_of

# a plan covers at most this many days, the last ones before the exam matter most
max_days = 21
task_kinds = ("read", "flashcards", "test", "practice", "rest")

plan_prompt = """You plan revision for students as part of Rahah, a study companion built on Claude by \
Anthropic. Make a realistic plan a student will actually follow: a clear focus each day, two or three short \
tasks, harder topics earlier so there is time to come back to them, active practice like tests and flashcards \
over rereading, a lighter day now and then, and the last day before the exam for a calm review. Keep every \
field short."""

plan_schema = {
    "type": "object",
    "properties": {
        "days": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "date": {"type": "string"},
                    "focus": {"type": "string"},
                    "tasks": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "kind": {"type": "string", "enum": list(task_kinds)},
                                "topic": {"type": "string"},
                                "minutes": {"type": "integer"},
                            },
                            "required": ["kind", "topic", "minutes"],
                            "additionalProperties": False,
                        },
                    },
                },
                "required": ["date", "focus", "tasks"],
                "additionalProperties": False,
            },
        },
    },
    "required": ["days"],
    "additionalProperties": False,
}


def plan_dates(today: date, due: date) -> list[date]:
    """the days to plan, today up to the day before the exam, the last max_days of them when there are more"""
    last = due - timedelta(days=1)
    start = max(today, last - timedelta(days=max_days - 1))
    return [start + timedelta(days=i) for i in range((last - start).days + 1)]


def clean_plan(data: dict, dates: list[date]) -> list[dict]:
    wanted = {d.isoformat() for d in dates}
    days = {}
    for day in data.get("days", []):
        when = clean_text(day.get("date"))
        if when not in wanted or when in days:
            continue
        tasks = []
        for t in day.get("tasks", [])[:4]:
            topic = clean_text(t.get("topic"))[:120]
            if t.get("kind") in task_kinds and topic:
                minutes = t.get("minutes") if isinstance(t.get("minutes"), int) else 30
                tasks.append({"kind": t["kind"], "topic": topic, "minutes": max(5, min(minutes, 180))})
        focus = clean_text(day.get("focus"))[:120]
        if focus and tasks:
            days[when] = {"date": when, "focus": focus, "tasks": tasks, "done": False}
    return [days[d] for d in sorted(days)]


async def make_plan(client, cfg: settings, reminder: dict, today: date, topics: str, on_usage=None) -> list[dict]:
    """asks claude for a day by day plan up to the reminder's date"""
    due = date.fromisoformat(reminder["due_date"])
    dates = plan_dates(today, due)
    if not dates:
        raise study_error("It's too close to the day to plan, so go through your notes and get some rest.")
    subject = modes[reminder["mode"]]["name"] if reminder["mode"] in modes else "General study"
    lines = [
        f"Plan revision for a {kinds[reminder['kind']].lower()}: {reminder['title']}, subject {subject}, on {due:%A %d %B %Y}.",
        f"Make one entry for each of these dates, in order: {', '.join(d.isoformat() for d in dates)}.",
        f"It covers: {topics}" if topics else "Choose the topics from the title and subject, the main ones first.",
    ]
    if reminder["notes"]:
        lines.append(f"The student's notes on it: {reminder['notes']}")
    async with client.beta.messages.stream(
        model=pick(cfg, "tools").model,
        max_tokens=16000,
        system=plan_prompt,
        messages=[{"role": "user", "content": "\n\n".join(lines)}],
        output_config={"effort": "low", "format": {"type": "json_schema", "schema": plan_schema}},
        **fallback_options(pick(cfg, "tools").model),
    ) as stream:
        final = await stream.get_final_message()
    if on_usage:
        on_usage(usage_of(final))
    if final.stop_reason == "refusal":
        raise study_error("Rahah couldn't plan that. Try describing what it covers.")
    try:
        data = json.loads("".join(b.text for b in final.content if b.type == "text"))
    except json.JSONDecodeError:
        raise study_error("Something went wrong making the plan. Try again.")
    days = clean_plan(data, dates)
    if not days:
        raise study_error("Rahah couldn't make a plan. Try again.")
    return days


def plan_calendar(reminder: dict, days: list[dict]) -> str:
    """one all day event per planned day, so the plan sits in the student's calendar"""
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Rahah//Revision plan//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH"]
    for day in days:
        on = date.fromisoformat(day["date"])
        tasks = "\n".join(f"{t['kind'].title()}: {t['topic']} ({t['minutes']} min)" for t in day["tasks"])
        lines += [
            "BEGIN:VEVENT", f"UID:{reminder['id']}-{day['date']}@rahah-plan", f"DTSTAMP:{stamp}",
            f"DTSTART;VALUE=DATE:{on:%Y%m%d}", f"DTEND;VALUE=DATE:{on + timedelta(days=1):%Y%m%d}",
            f"SUMMARY:{ics_text('Revise: ' + day['focus'])}", f"DESCRIPTION:{ics_text(tasks)}", "END:VEVENT",
        ]
    lines.append("END:VCALENDAR")
    return "\r\n".join(part for line in lines for part in fold(line)) + "\r\n"
