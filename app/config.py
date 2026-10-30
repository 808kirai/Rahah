"""settings for rahah, read from the environment and an optional .env file"""

import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

project_root = Path(__file__).resolve().parent.parent
effort_levels = ("low", "medium", "high", "xhigh", "max")


@dataclass
class settings:
    model: str = "claude-opus-5-5"
    effort: str = "medium"
    db_path: Path = project_root / "data" / "rahah.db"
    max_upload_mb: int = 30
    max_tokens: int = 64000
    # what each student can spend in a day, in dollars, unless the admin sets their own amount
    daily_cap: float = 0.50
    # sign in with google and apple stay hidden until these are set
    google_client_id: str = ""
    apple_client_id: str = ""


def load_settings() -> settings:
    load_dotenv(project_root / ".env")
    effort = os.getenv("RAHAH_EFFORT", "medium")
    if effort not in effort_levels:
        raise ValueError(f"RAHAH_EFFORT must be one of {', '.join(effort_levels)}")
    return settings(
        model=os.getenv("RAHAH_MODEL", "claude-opus-5-5"),
        effort=effort,
        db_path=Path(os.getenv("RAHAH_DB", str(project_root / "data" / "rahah.db"))),
        max_upload_mb=int(os.getenv("RAHAH_MAX_UPLOAD_MB", "30")),
        daily_cap=float(os.getenv("RAHAH_DAILY_CAP", "0.50")),
        google_client_id=os.getenv("GOOGLE_CLIENT_ID", ""),
        apple_client_id=os.getenv("APPLE_CLIENT_ID", ""),
    )
