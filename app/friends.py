"""friends and the weekly leaderboard: who's studied the most this week among a student and their friends

points for the week, which starts on monday in the leaderboard's time zone:
- one for every mark scored in a test, counting each test's best this week
- one for every flashcard practised
- one for every six minutes spent studying in rahah, so ten an hour
- five for each day something was studied
"""

from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

points_per_mark = 1
points_per_card = 1
minutes_per_point = 6
points_per_day = 5
# study time counted a day at most, so leaving rahah open doesn't keep earning
max_minutes_a_day = 600
max_friends = 200
requests_a_day = 30


def zone(name: str):
    try:
        return ZoneInfo(name)
    except Exception:
        return timezone.utc


def week_start(now: datetime, tz) -> datetime:
    """monday at midnight, where the leaderboard keeps its time"""
    local = now.astimezone(tz)
    monday = (local - timedelta(days=local.weekday())).replace(hour=0, minute=0, second=0, microsecond=0)
    return monday


def local_day(now: datetime, tz) -> str:
    return now.astimezone(tz).date().isoformat()


def points_for(marks: int, cards: int, minutes: int, days: int) -> int:
    return marks * points_per_mark + cards * points_per_card + minutes // minutes_per_point + days * points_per_day


def first_name(name: str, username: str) -> str:
    # only a first name is shown to other students, never a full name
    return (name or "").split(" ")[0] or username
