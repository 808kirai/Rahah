"""the weekly report, the last seven days of studying next to the seven before

days are counted on the student's own clock, the page sends how far its time is from utc
nothing here calls claude, so the report is free and instant
"""

from datetime import datetime, timedelta, timezone

from .modes import modes


def local_day(timestamp: float, offset_minutes: int) -> str:
    return (datetime.fromtimestamp(timestamp, timezone.utc) + timedelta(minutes=offset_minutes)).date().isoformat()


def week_numbers(attempts: list[dict], cards: list[dict], questions: list[float], start: float, end: float) -> dict:
    tests = [a for a in attempts if start <= a["created"] < end]
    marks = sum(a["total"] for a in tests)
    practised = [c for c in cards if start <= c["updated"] < end]
    return {
        "tests": len(tests),
        "average": round(100 * sum(a["score"] for a in tests) / marks) if marks else None,
        "cards": len(practised),
        "mastered": sum(1 for c in practised if c["box"] >= 5),
        "questions": sum(1 for q in questions if start <= q < end),
    }


def mode_label(mode: str) -> str:
    return modes[mode]["name"] if mode in modes else "General study"


def weekly_report(attempts: list[dict], cards: list[dict], questions: list[float], now: float, offset_minutes: int = 0) -> dict:
    """attempts have score, total, mode and created, cards have box, mode and updated, questions are times"""
    today = datetime.fromisoformat(local_day(now, offset_minutes))
    # the seven local days ending today, oldest first
    days = [(today - timedelta(days=6 - i)).date().isoformat() for i in range(7)]
    # midnight at the start of the week, on the student's clock, as a utc timestamp
    week_start = (today - timedelta(days=6)).replace(tzinfo=timezone.utc).timestamp() - offset_minutes * 60
    last_start = week_start - 7 * 86400

    this = week_numbers(attempts, cards, questions, week_start, now + 1)
    last = week_numbers(attempts, cards, questions, last_start, week_start)

    active = {local_day(t, offset_minutes) for t in
              [a["created"] for a in attempts] + [c["updated"] for c in cards] + questions}
    this["days"] = sum(1 for d in days if d in active)
    last["days"] = sum(1 for i in range(7, 14) if (today - timedelta(days=i)).date().isoformat() in active)

    # the streak counts back from today, or from yesterday when today hasn't started yet
    streak, day = 0, today
    if day.date().isoformat() not in active:
        day -= timedelta(days=1)
    while day.date().isoformat() in active:
        streak += 1
        day -= timedelta(days=1)

    # subjects this week by test average, the weakest gets the next step
    by_mode = {}
    for a in attempts:
        if week_start <= a["created"] <= now + 1:
            score, total = by_mode.get(a["mode"], (0, 0))
            by_mode[a["mode"]] = (score + a["score"], total + a["total"])
    ranked = sorted(
        ({"mode": m, "name": mode_label(m), "average": round(100 * s / t)} for m, (s, t) in by_mode.items() if t),
        key=lambda r: -r["average"],
    )
    best = ranked[0] if ranked else None
    weakest = ranked[-1] if len(ranked) > 1 and ranked[-1]["average"] < ranked[0]["average"] else None

    if weakest and weakest["average"] < 70:
        focus = {"text": "A short test there is a good next step.", "mode": weakest["mode"], "action": "quiz"}
    elif this["tests"] == 0 and this["cards"] == 0:
        focus = {"text": "No tests or flashcards yet this week. A quick test helps the week's work stick.", "mode": "", "action": "quiz"}
    elif this["cards"] == 0:
        focus = {"text": "No flashcards yet this week. A few minutes on a deck keeps things fresh.", "mode": best["mode"] if best else "", "action": "flashcards"}
    else:
        focus = {"text": "A steady week. Keep the streak going with a test or a deck tomorrow.", "mode": best["mode"] if best else "", "action": "quiz"}

    return {
        "this": this,
        "last": last,
        "streak": streak,
        "days": [{"date": d, "active": d in active} for d in days],
        "best": best,
        "weakest": weakest,
        "focus": focus,
    }
