"""settings for rahah, read from the environment and an optional .env file"""

import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

project_root = Path(__file__).resolve().parent.parent
effort_levels = ("low", "medium", "high", "xhigh", "max")


@dataclass
class settings:
    # left blank, each kind of work goes to the model that suits it, see app/routing.py
    # set, every request uses this one model, handy for cheap testing
    model: str = ""
    light_model: str = "claude-haiku-5-5"
    deep_model: str = "claude-sonnet-5-5"
    top_model: str = "claude-opus-5-5"
    # seconds acolyte gets to start an answer before rahah asks mage instead, 0 turns this off
    stall_seconds: float = 20
    effort: str = "medium"
    db_path: Path = project_root / "data" / "rahah.db"
    max_upload_mb: int = 30
    max_tokens: int = 64000
    # what each student can spend in a day, in dollars, unless the admin sets their own amount
    daily_cap: float = 0.50
    # once rahah is served over https, cookies are only sent over it and browsers are told to stay on it
    https: bool = False
    # the account with this email is the admin, left blank the first account made is, fine on your own computer
    admin_email: str = ""
    # what every student together can spend in a day, in dollars, 0 turns it off, the admin isn't counted
    daily_budget: float = 10.0
    # new accounts one internet connection can make in a day, a school can share one connection
    signups_per_ip: int = 20
    # answers one student can have running at once
    max_running: int = 2
    # where students write for help, password resets and other requests
    support_email: str = "studywithrahah@gmail.com"
    # sign in with google and apple stay hidden until these are set
    google_client_id: str = ""
    apple_client_id: str = ""


def load_settings() -> settings:
    load_dotenv(project_root / ".env")
    effort = os.getenv("RAHAH_EFFORT", "medium")
    if effort not in effort_levels:
        raise ValueError(f"RAHAH_EFFORT must be one of {', '.join(effort_levels)}")
    return settings(
        model=os.getenv("RAHAH_MODEL", "").strip(),
        light_model=os.getenv("RAHAH_LIGHT_MODEL", "claude-haiku-5-5").strip() or "claude-haiku-5-5",
        deep_model=os.getenv("RAHAH_DEEP_MODEL", "claude-sonnet-5-5").strip() or "claude-sonnet-5-5",
        top_model=os.getenv("RAHAH_TOP_MODEL", "claude-opus-5-5").strip() or "claude-opus-5-5",
        stall_seconds=float(os.getenv("RAHAH_STALL_SECONDS", "20")),
        effort=effort,
        db_path=Path(os.getenv("RAHAH_DB", str(project_root / "data" / "rahah.db"))),
        max_upload_mb=int(os.getenv("RAHAH_MAX_UPLOAD_MB", "30")),
        daily_cap=float(os.getenv("RAHAH_DAILY_CAP", "0.50")),
        https=os.getenv("RAHAH_HTTPS", "").strip().lower() in ("1", "true", "yes"),
        support_email=os.getenv("RAHAH_SUPPORT_EMAIL", "studywithrahah@gmail.com").strip() or "studywithrahah@gmail.com",
        admin_email=os.getenv("RAHAH_ADMIN_EMAIL", "").strip().lower(),
        daily_budget=float(os.getenv("RAHAH_DAILY_BUDGET", "10")),
        signups_per_ip=int(os.getenv("RAHAH_SIGNUPS_PER_IP", "20")),
        max_running=int(os.getenv("RAHAH_MAX_RUNNING", "2")),
        google_client_id=os.getenv("GOOGLE_CLIENT_ID", ""),
        apple_client_id=os.getenv("APPLE_CLIENT_ID", ""),
    )
