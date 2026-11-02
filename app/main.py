"""the rahah web server, run it with uvicorn app.main:create_app --factory"""

import asyncio
import gzip
from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo
import json
import logging
from contextlib import asynccontextmanager
import re
import secrets
import threading
import time
from pathlib import Path

import anthropic
from fastapi import BackgroundTasks, Depends, FastAPI, File, Form, HTTPException, Query, Request, UploadFile
from fastapi.responses import FileResponse, Response, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field, field_validator

from .config import load_settings, settings
from .accounts import (
    check_password, clean_email, clean_username, email_problem, hash_password, new_token, password_problem, session_cookie,
    session_days, sign_in_guard, username_from, username_problem,
)
from .alerts import alert_box, alert_handler
from .mailer import send_email
from .photos import square_photo
from . import billing
from .push import allowed_endpoint, due_today, feed_file, message_for, new_keys, send_push, zone
from . import friends as board
from . import receipt
from .providers import identity, provider_error, verify_apple, verify_google
from .modes import (
    allowed_mode, custom_prefix, default_mode, find_mode, groups, menu_groups, modes, public_modes, runs_code, sync_custom,
)
from .performance import summarise
from .report import weekly_report
from .security import counter, in_flight, install as install_security
from .routing import chat_route, choice_ids, choices_for, model_for, stall_backup
from .plans import make_plan, plan_calendar
from .recommend import has_activity, recommend, signature
from .reminders import calendar_file, is_upcoming, kinds as reminder_kinds, reminder_days, reminder_in
from .store import store
from .timetable import calendar_file as timetable_file, class_in
from .usage import cost_of, summarise as summarise_usage
from .study import kinds, make_set, mark_answer, max_items, study_error, styles, total_marks, upload
from .tutor import (
    answer_languages, display_from_content, fit_prompt, history_blocks, language_note, low_data_note, prompt_too_big, search_off_note, stream_reply,
    trimmed_history, turn_note,
    user_content, voice_note,
)

log = logging.getLogger("rahah")
static_dir = Path(__file__).resolve().parent.parent / "static"

# extension, then the media type claude gets and whether it is read as a document or an image
upload_types = {
    ".pdf": ("application/pdf", "document"),
    ".txt": ("text/plain", "document"),
    ".md": ("text/plain", "document"),
    ".png": ("image/png", "image"),
    ".jpg": ("image/jpeg", "image"),
    ".jpeg": ("image/jpeg", "image"),
    ".webp": ("image/webp", "image"),
    ".gif": ("image/gif", "image"),
}
# code and data files are read as plain text documents
code_types = (
    ".py", ".js", ".ts", ".java", ".c", ".cpp", ".h", ".cs", ".go", ".rs", ".rb", ".php",
    ".kt", ".swift", ".r", ".sql", ".sh", ".html", ".css", ".json", ".csv",
)
upload_types.update({suffix: ("text/plain", "document") for suffix in code_types})
magic_bytes = {
    "application/pdf": (b"%PDF",),
    "image/png": (b"\x89PNG",),
    "image/jpeg": (b"\xff\xd8\xff",),
    "image/gif": (b"GIF87a", b"GIF89a"),
}

# notes for a study set are sent inline, which counts against claude's request size
max_set_files = 5
max_notes = 200
max_set_mb = 20
max_photo_mb = 10


class signup_in(BaseModel):
    username: str = Field(min_length=1, max_length=40)
    email: str = Field(min_length=1, max_length=200)
    password: str = Field(min_length=1, max_length=200)
    name: str = Field(default="", max_length=60)
    # the box for the terms and privacy, with a parent or guardian's ok for anyone under 18
    agreed: bool = False
    # the username of a friend whose invite link brought them here
    ref: str = Field(default="", max_length=40)


class forgot_in(BaseModel):
    login: str = Field(min_length=1, max_length=200)


class reset_in(BaseModel):
    token: str = Field(min_length=20, max_length=200)
    password: str = Field(min_length=1, max_length=200)


class push_in(BaseModel):
    endpoint: str = Field(min_length=10, max_length=1000)
    p256dh: str = Field(default="", max_length=200)
    auth: str = Field(default="", max_length=100)
    zone: str = Field(default="", max_length=64)


class checkout_in(BaseModel):
    plan: str = Field(min_length=1, max_length=20)


class delete_me_in(BaseModel):
    # a password account confirms with its password, a google or apple one by typing its username
    password: str = Field(default="", max_length=200)
    confirm: str = Field(default="", max_length=40)


class login_in(BaseModel):
    login: str = Field(min_length=1, max_length=200)
    password: str = Field(min_length=1, max_length=200)


class profile_in(BaseModel):
    name: str | None = Field(default=None, max_length=60)
    email: str | None = Field(default=None, max_length=200)
    settings: dict | None = None
    # whether other students can find this account in friend search
    findable: bool | None = None
    # the admin's choice to show on the leaderboards
    on_board: bool | None = None
    # the device's time zone, like Africa/Nairobi, for when the daily limit starts again
    timezone: str | None = Field(default=None, max_length=64)


class parent_in(BaseModel):
    email: str = Field(default="", max_length=200)


class friend_in(BaseModel):
    username: str = Field(min_length=1, max_length=40)


class google_in(BaseModel):
    credential: str = Field(min_length=1, max_length=5000)
    agreed: bool = False
    ref: str = Field(default="", max_length=40)


class apple_in(BaseModel):
    id_token: str = Field(min_length=1, max_length=5000)
    name: str = Field(default="", max_length=60)
    agreed: bool = False
    ref: str = Field(default="", max_length=40)


class password_in(BaseModel):
    current: str = Field(default="", max_length=200)
    new: str = Field(min_length=1, max_length=200)


class admin_user_in(BaseModel):
    daily_cap: float | None = Field(default=None, ge=0, le=100)
    use_default_cap: bool = False
    disabled: bool | None = None
    is_admin: bool | None = None


class admin_password_in(BaseModel):
    new: str = Field(min_length=1, max_length=200)


class new_conversation_in(BaseModel):
    mode: str = default_mode


class score_in(BaseModel):
    score: int = Field(ge=0)


class plan_in(BaseModel):
    today: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}$")
    topics: str = Field(default="", max_length=1000)


class plan_day_in(BaseModel):
    date: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}$")
    done: bool


class rating_in(BaseModel):
    rating: int = Field(ge=-1, le=1)


class card_in(BaseModel):
    card: int = Field(ge=0)
    known: bool


class done_in(BaseModel):
    done: bool


class subject_in(BaseModel):
    name: str = Field(min_length=1, max_length=40)

    # one line, single spaces, so it reads cleanly in menus and in rahah's instructions
    @field_validator("name", mode="before")
    @classmethod
    def tidy(cls, value):
        return " ".join(value.split()) if isinstance(value, str) else value


class seen_in(BaseModel):
    day: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}$")


class message_in(BaseModel):
    text: str = Field(min_length=1, max_length=20000)
    mode: str = default_mode
    file_ids: list[str] = Field(default_factory=list, max_length=10)
    note_ids: list[str] = Field(default_factory=list, max_length=10)
    hints: bool = False
    language: str = ""
    low_data: bool = False
    voice: bool = False
    model: str = "auto"


class edit_in(message_in):
    # which question, counting from the chat's first
    index: int = Field(ge=0, le=100000)


class retry_in(BaseModel):
    mode: str = default_mode
    hints: bool = False
    language: str = ""
    low_data: bool = False
    model: str = "auto"


def settings_notes(body) -> tuple:
    # the student's answer language and low-data mode, checked and turned into notes for this turn
    if body.language and body.language not in answer_languages:
        raise HTTPException(400, "Pick an answer language from the list.")
    voice = getattr(body, "voice", False)
    return (language_note(body.language), low_data_note if body.low_data else "", voice_note if voice else "")


def friendly_error(error: Exception) -> str:
    # most specific first, since these classes inherit from each other
    if isinstance(error, anthropic.AuthenticationError):
        return "Rahah's API key isn't valid. Check ANTHROPIC_API_KEY in the .env file."
    if isinstance(error, anthropic.PermissionDeniedError):
        return "Rahah's API key doesn't have access to this model."
    if isinstance(error, anthropic.NotFoundError):
        return "Rahah couldn't find an attached file. Try attaching it again."
    if isinstance(error, anthropic.RateLimitError):
        return "Rahah is busy right now. Wait a moment and try again."
    if isinstance(error, prompt_too_big):
        return "That's too much to read in one question. Send a smaller part of the file, or start a new chat." + (f" {error}" if str(error) else "")
    if prompt_too_long(error):
        return "This chat, with its files, has grown too long for Rahah to read. Start a new chat to keep going."
    if isinstance(error, anthropic.BadRequestError):
        return f"Rahah couldn't handle that request: {error.message}"
    if isinstance(error, anthropic.APIStatusError):
        return f"Rahah is having trouble right now (error {error.status_code}). Try again in a moment."
    if isinstance(error, anthropic.APIConnectionError):
        return "Rahah couldn't connect right now. Try again in a moment."
    return "Rahah isn't set up yet. Add ANTHROPIC_API_KEY to the .env file and restart the server."


def prompt_too_long(error: Exception) -> bool:
    return isinstance(error, anthropic.BadRequestError) and "prompt is too long" in str(error).lower()


def is_claude_error(error: Exception) -> bool:
    # with no key at all the sdk raises a plain type error before any request is sent
    if isinstance(error, (anthropic.AnthropicError, prompt_too_big)):
        return True
    return isinstance(error, TypeError) and "authentication method" in str(error)


def sse(event: dict) -> str:
    return f"data: {json.dumps(event)}\n\n"


def sniff_upload(name: str, data: bytes) -> tuple[str, str]:
    # checks the extension and the first bytes agree, so a renamed file can't slip through
    suffix = Path(name).suffix.lower()
    if suffix not in upload_types:
        raise HTTPException(400, "Rahah can read PDF, TXT, MD, PNG, JPG, WEBP and GIF files, and code files like PY, JS and JAVA.")
    media_type, kind = upload_types[suffix]
    if media_type == "text/plain":
        try:
            data.decode("utf-8")
        except UnicodeDecodeError:
            raise HTTPException(400, "That text file couldn't be read. Save it as UTF-8 and try again.")
    elif media_type == "image/webp":
        if not (data[:4] == b"RIFF" and data[8:12] == b"WEBP"):
            raise HTTPException(400, "That file doesn't look like a WEBP image.")
    elif not data.startswith(magic_bytes[media_type]):
        raise HTTPException(400, f"That file doesn't look like a {suffix[1:].upper()} file.")
    return media_type, kind


# only plain images are shown in the page, anything else a run makes is downloaded,
# so a page or script written by code never runs on rahah's own address
inline_types = ("image/png", "image/jpeg", "image/gif", "image/webp")
container_margin = 300


def safe_filename(name: str) -> str:
    return re.sub(r"[^\w.\- ]", "_", Path(name).name)[:120] or "file"


def create_app(cfg: settings | None = None, client=None, verifiers: dict | None = None, mailer=None, pusher=None,
               payments=None) -> FastAPI:
    cfg = cfg or load_settings()
    # how google and apple tokens are checked, tests swap in their own
    verifiers = verifiers or {
        "google": lambda token, name="": verify_google(token, cfg.google_client_id),
        "apple": lambda token, name="": verify_apple(token, cfg.apple_client_id, name),
    }
    db = store(cfg.db_path)
    # how pro is paid for, tests swap in their own. off until paystack's secret key is set
    payments = payments or (billing.paystack(cfg.paystack_secret) if cfg.paystack_secret else None)
    # how emails go out, tests swap in their own
    mailer = mailer or (lambda to, subject, text, attachment=None: send_email(cfg, to, subject, text, attachment))
    reset_by_email = bool(cfg.smtp_user and cfg.smtp_password)

    def email_to(setting: str, fallback: str) -> str:
        # an email address for backups or alerts, nothing when email isn't set up or it's turned off
        if not reset_by_email or setting.lower() == "off":
            return ""
        return setting or fallback

    backup_to = email_to(cfg.backup_email, cfg.smtp_user)
    alert_to = email_to(cfg.alert_email, cfg.admin_email or cfg.smtp_user)
    alerts = alert_box(lambda subject, text: mailer(alert_to, subject, text))

    # phone notifications are signed with a key pair rahah makes once and keeps in its database
    push_private = db.get_key("push_private")
    push_public = db.get_key("push_public")
    if not push_private or not push_public:
        push_private, push_public = new_keys()
        db.set_key("push_private", push_private)
        db.set_key("push_public", push_public)
    push_contact = cfg.admin_email or cfg.smtp_user or cfg.support_email
    pusher = pusher or (lambda subscription, payload: send_push(push_private, subscription, payload, push_contact))

    def send_due_pushes(now: datetime | None = None) -> int:
        """sends each reminder day's notification once, from 9 in the morning where the student is"""
        now = now or datetime.now(timezone.utc)
        sent = 0
        for user_id, phones in db.pushes_by_user().items():
            local = now.astimezone(zone(phones[-1]["zone"]))
            for reminder, days in due_today(db.list_reminders(user_id), local):
                if not db.mark_pushed(reminder["id"], local.date().isoformat()):
                    continue
                payload = message_for(reminder, days)
                for phone in phones:
                    result = pusher(phone, payload)
                    if result == "gone":
                        db.remove_push(phone["endpoint"])
                    elif result == "failed":
                        log.warning("a reminder notification couldn't be sent")
                    else:
                        sent += 1
        return sent
    reset_minutes = 30
    # the account with the admin email is the admin whenever rahah starts, so fixing a mistyped
    # admin email after the account was made takes effect on the next start
    if cfg.admin_email:
        chosen = db.find_user_by("email", cfg.admin_email)
        if chosen and not chosen["is_admin"]:
            db.make_admin(chosen["id"])

    @asynccontextmanager
    async def lifespan(_):
        # a backup when the server starts, then a check every hour for a new day, kept for a week
        async def back_up():
            try:
                made = await asyncio.to_thread(db.backup, cfg.db_path.parent / "backups")
                if made:
                    log.info("backed up the database to %s", made)
                    # a copy leaves render too, so losing the disk doesn't lose everything
                    if backup_to:
                        await asyncio.to_thread(email_backup, made)
            except Exception as error:
                log.warning("database backup failed: %s", error)

        async def keep_backed_up():
            while True:
                await asyncio.sleep(3600)
                await back_up()

        async def keep_alerting():
            # problems are gathered and sent as one email at most every half hour
            while True:
                await asyncio.sleep(60)
                if alerts.due():
                    await asyncio.to_thread(alerts.flush)

        async def keep_notifying():
            # reminders due today go out as phone notifications, checked every few minutes,
            # and on sunday evenings parents get the week's report
            while True:
                try:
                    await asyncio.to_thread(send_due_pushes)
                    if reset_by_email:
                        await asyncio.to_thread(send_parent_reports)
                except Exception as error:
                    log.warning("sending notifications or parent reports failed: %s", error)
                await asyncio.sleep(300)

        handler = alert_handler(alerts) if alert_to else None
        if handler:
            log.addHandler(handler)
        await back_up()
        tasks = [asyncio.create_task(keep_backed_up()), asyncio.create_task(keep_notifying())]
        if handler:
            tasks.append(asyncio.create_task(keep_alerting()))
        yield
        for task in tasks:
            task.cancel()
        if handler:
            log.removeHandler(handler)

    def email_backup(path: Path) -> None:
        # squeezed with gzip, a study database shrinks a lot. gmail takes attachments up to 25 MB
        packed = gzip.compress(path.read_bytes())
        day = path.stem.removeprefix("rahah-")
        if len(packed) > 20 * 1024 * 1024:
            mailer(backup_to, f"Rahah backup {day} is too big to email",
                   f"Today's backup is {len(packed) // (1024 * 1024)} MB packed, too big for email. It's saved on Render's disk "
                   "for a week. Time to move backups to cloud storage.")
            return
        size = f"{max(1, len(packed) // 1024)} KB"
        mailer(backup_to, f"Rahah backup {day}",
               f"Today's copy of Rahah's database is attached ({size}).\n\n"
               "Keep these somewhere safe, they hold every account and chat. Passwords are stored scrambled, not as typed.\n\n"
               "To restore one: unzip it, then upload it to Render's disk as /var/data/rahah.db while Rahah is stopped.",
               attachment=(f"{path.name}.gz", packed, "application/gzip"))

    # the automatic api pages are left off, nobody outside needs a map of the routes
    app = FastAPI(title="Rahah", lifespan=lifespan, docs_url=None, redoc_url=None, openapi_url=None)
    # tests run the notification check and the parent reports themselves
    app.state.send_due_pushes = send_due_pushes
    app.state.send_parent_reports = lambda now=None: send_parent_reports(now)
    install_security(app, cfg, max(cfg.max_upload_mb * 2, max_set_mb) + 5)

    @app.middleware("http")
    async def note_crashes(request: Request, call_next):
        # an error nothing else caught is written to the log, which emails the admin
        try:
            return await call_next(request)
        except Exception:
            log.exception("something broke on %s %s", request.method, request.url.path)
            raise
    signups = counter(cfg.signups_per_ip, 86400)
    running = in_flight(cfg.max_running)
    # checked against when a name isn't found, so a wrong name takes as long as a wrong password
    # and the time taken doesn't give away which usernames exist
    stand_in_hash = hash_password("not anyone's password")
    state = {"client": client}

    def claude():
        # created on first use, so the page still loads before a key is set
        if state["client"] is None:
            state["client"] = anthropic.AsyncAnthropic()
        return state["client"]

    guard = sign_in_guard()

    def signed_in(request: Request) -> dict:
        # every api route but signing in needs a student, found from the session cookie
        token = request.cookies.get(session_cookie)
        user = db.session_user(token, idle=cfg.idle_minutes * 60) if token else None
        if not user or user["disabled"]:
            raise HTTPException(401, "Sign in to keep going.")
        return user

    def admin_only(user: dict = Depends(signed_in)) -> dict:
        if not user["is_admin"]:
            raise HTTPException(403, "Only the admin can do that.")
        return user

    def zone_of(user: dict):
        # the student's own time zone, or kenya's until their device has said
        return board.zone(user.get("timezone") or cfg.leaderboard_zone)

    def my_day_start(user: dict, now: float | None = None) -> float:
        """the student's last midnight, where they are"""
        tz = zone_of(user)
        local = datetime.fromtimestamp(now or time.time(), tz)
        return datetime.combine(local.date(), datetime.min.time(), tz).timestamp()

    def my_next_midnight(user: dict, now: float) -> float:
        tz = zone_of(user)
        local = datetime.fromtimestamp(now, tz)
        return datetime.combine(local.date() + timedelta(days=1), datetime.min.time(), tz).timestamp()

    def day_start(now: float) -> float:
        # the shared free budget resets at midnight utc, the same moment for everyone
        return now - now % 86400

    def allowance(user: dict) -> dict:
        now = time.time()
        used = db.user_cost_since(user["id"], my_day_start(user, now))
        cap = None if user["is_admin"] else (user["daily_cap"] if user["daily_cap"] is not None else cfg.daily_cap)
        # a pro pass gives ten times the daily limit, until the pass's own total is used up
        pro = None if user["is_admin"] else db.active_pass(user["id"], now)
        pass_used = None
        if pro:
            pass_used = db.user_cost_since(user["id"], pro["starts"])
            if pass_used < pro["budget"]:
                cap = cap * billing.plan_info(pro["plan"])["multiplier"]
        return {"cap": cap, "used": round(used, 4), "resets_in": int(my_next_midnight(user, now) - now), "pro": pro, "pass_used": pass_used}

    def pro_active(a: dict) -> bool:
        return bool(a["pro"]) and a["pass_used"] < a["pro"]["budget"]

    def tier_of(user: dict) -> str | None:
        """max, pro, or none on the free plan. the admin has everything max has"""
        if user["is_admin"]:
            return "max"
        a = allowance(user)
        return billing.plan_info(a["pro"]["plan"])["tier"] if pro_active(a) else None

    def is_pro(user: dict) -> bool:
        # pro or max
        return tier_of(user) is not None

    def is_max(user: dict) -> bool:
        return tier_of(user) == "max"

    def mage_used_today(user: dict) -> int:
        return sum(db.usage_count_since(user["id"], my_day_start(user), kind=k, model=model_for(cfg, "mage")) for k in ("chat", "retry"))

    def free_mage_left(user: dict) -> bool:
        return is_pro(user) or mage_used_today(user) < billing.free_mage_a_day

    def check_allowance(user: dict) -> None:
        # asked before anything that calls claude, the admin has no limit
        a = allowance(user)
        if a["cap"] is not None and a["used"] >= a["cap"]:
            hours, minutes = divmod(a["resets_in"] // 60, 60)
            wait = f"{hours} hours" if hours >= 2 else f"{hours * 60 + minutes} minutes"
            extra = ""
            if a["pro"] and not pro_active(a):
                extra = " This Pro pass's allowance is used up, so you're on the free limit until it ends."
            elif payments and not a["pro"]:
                extra = " Upgrade to Rahah Pro for 10 times more each day."
            raise HTTPException(429, f"You've used today's study limit. It resets in about {wait}. Saved flashcards and tests still work.{extra}")
        # a ceiling for everyone on the free plan together, so many accounts can't run up the bill. pro doesn't count
        if not user["is_admin"] and not pro_active(a) and cfg.daily_budget > 0 and db.free_student_cost_since(day_start(time.time())) >= cfg.daily_budget:
            hours = max(1, a["resets_in"] // 3600)
            raise HTTPException(429, f"Rahah has hit today's limit for everyone. It's back in about {hours} hours. Saved flashcards and tests still work.")

    def used_percent(used: float, cap: float) -> int:
        return 100 if cap <= 0 else min(100, round(100 * used / cap))

    def allowance_out(user: dict) -> dict:
        # a student sees only how much of today's limit is used, never what it costs
        a = allowance(user)
        if a["cap"] is None:
            return {"limited": False}
        out = {"limited": True, "percent": used_percent(a["used"], a["cap"]), "resets_in": a["resets_in"]}
        if a["pro"]:
            out["pro"] = {
                "plan": a["pro"]["plan"], "until": db.pro_until(user["id"]),
                # this pass's own start and end, for how the student's pace compares with its length
                "starts": a["pro"]["starts"], "ends": a["pro"]["ends"],
                "pass_percent": used_percent(a["pass_used"], a["pro"]["budget"]), "active": pro_active(a),
                "tier": billing.plan_info(a["pro"]["plan"])["tier"],
                # when max runs out, if pro days are waiting after it
                "max_until": max((p["ends"] for p in db.passes_ahead(user["id"]) if billing.plan_info(p["plan"])["tier"] == "max"), default=None),
            }
        return out

    def check_choice(user: dict, choice: str) -> None:
        if choice not in choice_ids:
            raise HTTPException(400, "Pick a model from the list.")
        if choice == "archmage" and not user["is_admin"]:
            raise HTTPException(403, "Archmage isn't available. Pick Mage for careful thinking.")
        if choice == "mage" and not free_mage_left(user):
            raise HTTPException(429, f"You've had today's {billing.free_mage_a_day} Mage answers. Acolyte is still here, or get Pro for unlimited Mage.")

    def own_subjects(user: dict) -> set[str]:
        return {s["id"] for s in db.list_subjects(user["id"])}

    def check_mode(user: dict, mode: str) -> None:
        if not allowed_mode(mode, own_subjects(user)):
            raise HTTPException(400, "Unknown subject.")

    # profile photos, kept on the disk beside the database, shown only to the student and their friends
    photos_dir = cfg.db_path.parent / "photos"
    max_photo_upload = 12 * 1024 * 1024

    def photo_path(photo_id: str) -> Path | None:
        return photos_dir / f"{photo_id}.jpg" if photo_id and re.fullmatch(r"p_[0-9a-f]{16}", photo_id) else None

    def photo_url(user: dict) -> str:
        photo_id = user.get("avatar") or ""
        return f"/api/photos/{user['username']}?v={photo_id}" if photo_path(photo_id) else ""

    def forget_photo(photo_id: str) -> None:
        path = photo_path(photo_id)
        if path and path.exists():
            path.unlink()

    def user_out(user: dict) -> dict:
        # what the page knows about the student signed in
        return {
            "id": user["id"], "username": user["username"], "email": user["email"], "name": user["name"],
            "is_admin": user["is_admin"], "settings": user["settings"], "has_password": bool(user["password"]),
            "idle_minutes": cfg.idle_minutes, "on_board": user["on_board"],
            "google": bool(user["google_sub"]), "apple": bool(user["apple_sub"]),
            "findable": user["findable"], "photo": photo_url(user), "timezone": user.get("timezone") or "",
            "pro": is_pro(user), "parent_email": user.get("parent_email") or "",
            "allowance": allowance_out(user),
            # archmage is the admin's alone
            "models": choices_for(user["is_admin"]), "tier": tier_of(user),
        }

    def start_session(request: Request, response: Response, user: dict) -> None:
        token = db.new_session(user["id"])
        response.set_cookie(
            session_cookie, token, max_age=session_days * 86400, httponly=True, samesite="lax",
            secure=cfg.https or request.url.scheme == "https", path="/",
        )

    agree_first = "Tick the box to agree to the terms first."

    def admin_for(email: str | None) -> bool | None:
        # with an admin email set, only that account is the admin, so nobody else can claim it first
        if not cfg.admin_email:
            return None
        return bool(email) and email == cfg.admin_email

    def client_address(request: Request) -> str:
        # online every request seems to come from the host's proxy, so the visitor's address is read
        # from the one header the host sets itself. x-forwarded-for isn't used, visitors can write into it
        if cfg.client_ip_header:
            given = request.headers.get(cfg.client_ip_header, "").split(",")[0].strip()
            if given:
                return given
        return request.client.host if request.client else ""

    @app.get("/api/health")
    def health():
        # the host checks this to know rahah is up and can reach its database
        with db._connect() as raw:
            raw.execute("select 1")
        return {"ok": True}

    @app.get("/api/admin/address")
    def admin_address(request: Request, user: dict = Depends(admin_only)):
        # after going online, shows the admin which address headers arrive, to check the limits see real visitors
        seen = {h: request.headers.get(h, "") for h in ("true-client-ip", "cf-connecting-ip", "x-real-ip", "x-forwarded-for")}
        return {
            "address": client_address(request), "header": cfg.client_ip_header,
            "from_header": bool(cfg.client_ip_header and request.headers.get(cfg.client_ip_header)),
            "connection": request.client.host if request.client else "", "headers": seen,
        }

    @app.get("/api/auth/config")
    def auth_config():
        # what the sign in page offers, before anyone is signed in
        return {"google_client_id": cfg.google_client_id, "apple_client_id": cfg.apple_client_id, "support_email": cfg.support_email,
                "reset_by_email": reset_by_email}

    @app.post("/api/auth/signup")
    def sign_up(body: signup_in, request: Request, response: Response):
        username = clean_username(body.username)
        email = clean_email(body.email)
        problem = username_problem(username) or email_problem(email) or password_problem(body.password)
        if problem:
            raise HTTPException(400, problem)
        if db.taken("username", username):
            raise HTTPException(400, "That username is taken. Try another.")
        if db.taken("email", email):
            raise HTTPException(400, "An account already uses that email. Sign in instead.")
        if not body.agreed:
            raise HTTPException(400, agree_first)
        address = client_address(request)
        if signups.full(address):
            raise HTTPException(429, "Too many accounts were made from this connection today. Try again tomorrow.")
        user = db.create_user(username, email, hash_password(body.password), " ".join(body.name.split()), admin=admin_for(email), agreed=True)
        remember_referrer(user, body.ref)
        signups.add(address)
        start_session(request, response, user)
        return user_out(user)

    @app.post("/api/auth/login")
    def log_in(body: login_in, request: Request, response: Response):
        login = body.login.strip()
        address = client_address(request)
        # wrong tries are counted for the name whatever its capitals, so changing case doesn't buy more guesses
        if guard.blocked(login.lower(), address):
            raise HTTPException(429, "Too many tries. Wait 15 minutes and try again.")
        # says which part is wrong, the name or the password, which is easier for students.
        # it does tell someone whether an account exists, the wait after 5 wrong tries still stops guessing
        user = db.find_user(login)
        if not user:
            check_password(body.password, stand_in_hash)
            if guard.failed(login.lower(), address):
                log.warning("sign in locked for 15 minutes after %s wrong tries, for %s from %s", guard.tries, login.lower(), address)
            raise HTTPException(401, f"There's no account with that {'email' if '@' in login else 'username'}.")
        if not user["password"]:
            provider = "Google" if user["google_sub"] else "Apple" if user["apple_sub"] else ""
            raise HTTPException(401, f"This account signs in with {provider}. Use the {provider} button above." if provider else "This account has no password yet.")
        if not check_password(body.password, user["password"]):
            if guard.failed(login.lower(), address):
                log.warning("sign in locked for 15 minutes after %s wrong tries, for %s from %s", guard.tries, login.lower(), address)
            raise HTTPException(401, "That password isn't right.")
        if user["disabled"]:
            raise HTTPException(403, f"This account has been turned off. Email {cfg.support_email} for help.")
        guard.cleared(login.lower())
        start_session(request, response, user)
        return user_out(user)

    @app.post("/api/auth/logout")
    def log_out(request: Request, response: Response):
        token = request.cookies.get(session_cookie)
        if token:
            db.end_session(token)
        response.delete_cookie(session_cookie, path="/")
        return {"ok": True}

    # password reset by email. the answer is the same whether or not the account exists,
    # so it can't be used to find out who has one, and the email goes out after the reply
    resets_per_address = counter(10, 3600)
    resets_per_account = counter(3, 3600)

    def send_reset(user: dict, link: str) -> None:
        hello = user["name"] or user["username"]
        text = (
            f"Hi {hello},\n\n"
            f"Someone asked to reset the password for your Rahah account, @{user['username']}. "
            f"To choose a new password, open this link within {reset_minutes} minutes:\n\n{link}\n\n"
            "If it wasn't you, ignore this email and your password stays the same.\n\n"
            f"Rahah\n{cfg.support_email}"
        )
        try:
            mailer(user["email"], "Reset your Rahah password", text)
        except Exception as error:
            log.warning("couldn't send a reset email: %s", error)

    @app.post("/api/auth/forgot")
    def forgot_password(body: forgot_in, request: Request, background: BackgroundTasks):
        if not reset_by_email:
            raise HTTPException(404, f"Password reset by email isn't set up yet. Email {cfg.support_email} for a new password.")
        address = client_address(request)
        if resets_per_address.full(address):
            raise HTTPException(429, "Too many reset emails from this connection. Try again in an hour.")
        resets_per_address.add(address)
        user = db.find_user(body.login.strip())
        if user and user["email"] and not user["disabled"] and not resets_per_account.full(user["id"]):
            resets_per_account.add(user["id"])
            token = new_token()
            db.add_reset(user["id"], token, time.time() + reset_minutes * 60)
            # the token sits after the #, so it never reaches server logs or other sites
            base = cfg.public_url or str(request.base_url).rstrip("/")
            background.add_task(send_reset, user, f"{base}/#/reset/{token}")
        return {"ok": True}

    @app.post("/api/auth/reset")
    def reset_password(body: reset_in, request: Request, response: Response):
        problem = password_problem(body.password)
        if problem:
            raise HTTPException(400, problem)
        user_id = db.take_reset(body.token)
        user = db.get_user(user_id) if user_id else None
        if not user or user["disabled"]:
            raise HTTPException(400, "That reset link has run out or was already used. Ask for a new one.")
        db.update_user(user["id"], password=hash_password(body.password))
        # every device is signed out, then this one signs in with the new password
        db.end_sessions(user["id"])
        user = db.get_user(user["id"])
        start_session(request, response, user)
        return user_out(user)

    provider_names = {"google": "Google", "apple": "Apple"}

    def remember_referrer(user: dict, ref: str) -> None:
        friend = db.find_user_by("username", clean_username(ref)) if ref else None
        if friend and friend["id"] != user["id"]:
            db.update_user(user["id"], referred_by=friend["id"])

    def provider_sign_in(request: Request, response: Response, provider: str, found_id: identity, agreed: bool = False, ref: str = "") -> dict:
        """signs in the account linked to this google or apple id, links it to the student signed in now,
        or makes a new account, but never joins an existing account just because the email matches"""
        field = f"{provider}_sub"
        label = provider_names[provider]
        token = request.cookies.get(session_cookie)
        current = db.session_user(token, idle=cfg.idle_minutes * 60) if token else None
        linked = db.find_user_by(field, found_id.sub)
        if current:
            # connecting from settings
            if linked and linked["id"] != current["id"]:
                raise HTTPException(400, f"That {label} account is already used by another Rahah account.")
            return user_out(db.update_user(current["id"], **{field: found_id.sub}))
        if linked:
            if linked["disabled"]:
                raise HTTPException(403, f"This account has been turned off. Email {cfg.support_email} for help.")
            start_session(request, response, linked)
            return user_out(linked)
        email = clean_email(found_id.email) if found_id.email else None
        if email and db.taken("email", email):
            raise HTTPException(400, f"An account already uses {email}. Sign in with your password, then connect {label} on the Account tab.")
        if not agreed:
            raise HTTPException(400, f"New to Rahah? Tick the box to agree to the terms, then choose Sign up with {label} again.")
        address = client_address(request)
        if signups.full(address):
            raise HTTPException(429, "Too many accounts were made from this connection today. Try again tomorrow.")
        base = username_from(email or found_id.name or "student")
        username, n = base, 2
        while db.taken("username", username):
            username, n = f"{base}{n}", n + 1
        user = db.create_user(username, email, None, " ".join(found_id.name.split())[:60], admin=admin_for(email), agreed=True, **{field: found_id.sub})
        remember_referrer(user, ref)
        signups.add(address)
        start_session(request, response, user)
        return user_out(user)

    @app.post("/api/auth/google")
    def google_sign_in(body: google_in, request: Request, response: Response):
        if not cfg.google_client_id:
            raise HTTPException(404, "Sign in with Google isn't set up yet.")
        try:
            found_id = verifiers["google"](body.credential)
        except provider_error as error:
            raise HTTPException(401, str(error))
        return provider_sign_in(request, response, "google", found_id, body.agreed, body.ref)

    @app.post("/api/auth/apple")
    def apple_sign_in(body: apple_in, request: Request, response: Response):
        if not cfg.apple_client_id:
            raise HTTPException(404, "Sign in with Apple isn't set up yet.")
        try:
            found_id = verifiers["apple"](body.id_token, body.name)
        except provider_error as error:
            raise HTTPException(401, str(error))
        return provider_sign_in(request, response, "apple", found_id, body.agreed, body.ref)

    @app.get("/api/me")
    def who_am_i(user: dict = Depends(signed_in)):
        return user_out(user)

    @app.patch("/api/me")
    def edit_me(body: profile_in, user: dict = Depends(signed_in)):
        change = {}
        if body.name is not None:
            change["name"] = " ".join(body.name.split())
        if body.email is not None:
            email = clean_email(body.email)
            problem = email_problem(email)
            if problem:
                raise HTTPException(400, problem)
            if db.taken("email", email, besides=user["id"]):
                raise HTTPException(400, "Another account already uses that email.")
            change["email"] = email
        if body.settings is not None:
            # only small plain settings are kept, like the answer language and low-data mode
            if len(json.dumps(body.settings)) > 2000:
                raise HTTPException(400, "Those settings are too big.")
            change["settings"] = body.settings
        if body.findable is not None:
            change["findable"] = body.findable
        if body.on_board is not None and user["is_admin"]:
            change["on_board"] = body.on_board
        if body.timezone and body.timezone != user.get("timezone"):
            try:
                ZoneInfo(body.timezone)
            except Exception:
                raise HTTPException(400, "That time zone isn't one we know.")
            if not user.get("timezone") or time.time() - (user.get("timezone_set") or 0) >= 7 * 86400:
                change["timezone"], change["timezone_set"] = body.timezone, time.time()
        return user_out(db.update_user(user["id"], **change))

    # rahah pro, passes bought with m-pesa or card through paystack

    def plan_out(key: str) -> dict:
        p = billing.passes[key]
        return {"id": key, "name": p["name"], "tier": p["tier"], "price": p["price"], "days": p["days"], "currency": billing.currency,
                "usd": p["usd"]}

    trials = counter(billing.trials_per_address, 86400)

    def invite_url(request: Request, user: dict) -> str:
        base = cfg.public_url or str(request.base_url).rstrip("/")
        return f"{base}/?ref={user['username']}"

    @app.get("/api/pro")
    def pro_status(request: Request, user: dict = Depends(signed_in)):
        return {
            "enabled": bool(payments), "plans": [plan_out(k) for k in billing.passes], "kes_per_usd": billing.kes_per_usd,
            "tiers": {k: t["multiplier"] for k, t in billing.tiers.items()},
            "pro": allowance_out(user).get("pro"),
            "trial": not user["is_admin"] and not db.ever_had_pass(user["id"]),
            "invite": invite_url(request, user), "invite_days": db.count_passes(user["id"], "gift") * billing.free_passes["gift"]["days"],
            "limits": {"chats": billing.free_recent_chats, "searches": billing.free_searches_a_day, "photos": billing.free_photo_marks_a_day,
                       "mage": billing.free_mage_a_day, "notes": billing.free_notes, "pro_notes": billing.pro_notes, "max_notes": billing.max_notes},
        }

    @app.post("/api/pro/trial")
    def start_trial(request: Request, user: dict = Depends(signed_in)):
        # three days of pro, once per account, and only a couple from one connection a day so it can't be farmed
        if user["is_admin"] or db.ever_had_pass(user["id"]):
            raise HTTPException(400, "The free trial is for accounts that haven't had Pro yet.")
        address = client_address(request)
        if trials.full(address):
            raise HTTPException(429, "Too many trials from this connection today. Try again tomorrow.")
        trials.add(address)
        trial = billing.free_passes["trial"]
        db.grant_free_pass(user["id"], "trial", trial["days"], trial["budget"])
        return {"pro": allowance_out(db.get_user(user["id"])).get("pro")}

    def parent_report(user: dict, now: datetime) -> tuple[str, str]:
        """the week's report for a parent, short and plain"""
        first = (user["name"] or user["username"]).split(" ")[0]
        offset = int(now.astimezone(board_zone).utcoffset().total_seconds() // 60)
        stamp = now.timestamp()
        week = weekly_report(db.quiz_attempts(user["id"]), db.card_activity(user["id"], stamp - 16 * 86400),
                             db.question_times(user["id"], stamp - 16 * 86400), stamp, offset)
        start = board.week_start(now, board_zone)
        minutes = db.week_numbers([user["id"]], start.timestamp(), start.date().isoformat(),
                                  lambda t: board.local_day(datetime.fromtimestamp(t, timezone.utc), board_zone))[user["id"]]["minutes"]
        t = week["this"]
        lines = [
            f"Study time: {minutes // 60}h {minutes % 60}m" if minutes >= 60 else f"Study time: {minutes} minutes",
            f"Days studied: {t['days']} of 7",
            f"Tests: {t['tests']}" + (f", averaging {t['average']}%" if t["average"] is not None else ""),
            f"Flashcards practised: {t['cards']}",
            f"Questions asked: {t['questions']}",
        ]
        if week["best"]:
            lines.append(f"Strongest subject: {week['best']['name']} ({week['best']['average']}%)")
        if week["weakest"]:
            lines.append(f"Worth more practice: {week['weakest']['name']} ({week['weakest']['average']}%)")
        text = (
            f"Hi,\n\nHere's how {first} did on Rahah this week:\n\n" + "\n".join(f"- {line}" for line in lines)
            + f"\n\n{first} added you as their parent or guardian on Rahah. To stop these emails, reply to this one, "
            f"or {first} can remove your email on their Account tab.\n\nRahah"
        )
        return f"{first} on Rahah this week", text

    def send_parent_reports(now: datetime | None = None) -> int:
        """on sunday from six in the evening, one report a week to each parent of a student on pro"""
        now = now or datetime.now(timezone.utc)
        local = now.astimezone(board_zone)
        if local.weekday() != 6 or local.hour < 18:
            return 0
        week = local.date().isoformat()
        sent = 0
        for user in db.users_with_parent_email():
            if user.get("parent_sent") == week or not is_pro(user):
                continue
            db.update_user(user["id"], parent_sent=week)
            subject, text = parent_report(user, now)
            try:
                mailer(user["parent_email"], subject, text)
                sent += 1
            except Exception as error:
                log.warning("couldn't send a parent report: %s", error)
        return sent

    @app.put("/api/me/parent")
    def set_parent(body: parent_in, user: dict = Depends(signed_in)):
        # a parent or guardian who gets a short report each week while the student is on pro
        email = clean_email(body.email) if body.email.strip() else ""
        if email:
            problem = email_problem(email)
            if problem:
                raise HTTPException(400, problem)
            if email == user["email"]:
                raise HTTPException(400, "That's your own email. Add a parent or guardian's.")
        return user_out(db.update_user(user["id"], parent_email=email, parent_sent=""))

    @app.post("/api/pro/checkout")
    async def pro_checkout(body: checkout_in, request: Request, user: dict = Depends(signed_in)):
        if not payments:
            raise HTTPException(404, "Rahah Pro isn't open yet.")
        plan = billing.passes.get(body.plan)
        if not plan:
            raise HTTPException(400, "Pick Pro or Max, for a week, a month or a term.")
        if not user["email"]:
            raise HTTPException(400, "Add your email on the Account tab first, Paystack sends the receipt there.")
        reference = billing.new_reference()
        db.add_payment(reference, user["id"], body.plan, plan["price"])
        base = cfg.public_url or str(request.base_url).rstrip("/")
        try:
            started = await asyncio.to_thread(payments.start, user["email"], plan["price"], reference, f"{base}/?paid=1", body.plan)
        except Exception as error:
            log.warning("paystack checkout failed: %s", error)
            db.mark_payment(reference, "failed")
            raise HTTPException(502, "Paystack didn't open the payment just now. Try again in a moment.")
        if isinstance(started, str):
            started = {"url": started}
        return {"url": started["url"], "access_code": started.get("access_code", ""), "reference": reference}

    def settle(reference: str, found: dict) -> dict | None:
        """checks what paystack says against what was asked for, then gives the pass, once"""
        pay = db.get_payment(reference)
        if not pay:
            return None
        plan = billing.passes.get(billing.old_passes.get(pay["plan"], pay["plan"]))
        if found.get("status") != "success":
            if found.get("status") in ("failed", "abandoned", "reversed"):
                db.mark_payment(reference, found["status"])
            return None
        if not plan or found.get("amount") != pay["amount"] * 100 or (found.get("currency") or "").upper() != billing.currency:
            log.warning("a paystack payment didn't match what was asked for: %s", reference)
            return None
        made = db.grant_pass(reference, plan["days"], plan["budget"], lower=billing.plans_below(plan["tier"]))
        if made:
            reward_referrer(made["user_id"])
            if made.get("new") and reset_by_email:
                # sent beside the request, so a slow mail server doesn't hold up the payment
                threading.Thread(target=send_receipt, args=(made, plan, pay), daemon=True).start()
        return made

    def send_receipt(made: dict, plan: dict, pay: dict) -> None:
        """a short email to the student with what they bought, when it runs, and the terms"""
        buyer = db.get_user(made["user_id"])
        if not buyer or not buyer["email"]:
            return
        tz = zone_of(buyer)
        day = lambda t: datetime.fromtimestamp(t, tz).strftime("%a %d %b %Y")
        first = (buyer["name"] or buyer["username"]).split(" ")[0]
        tier = billing.tiers[plan["tier"]]
        tier_name, multiplier = tier["name"], plan.get("multiplier", tier["multiplier"])
        runs = f"{day(made['starts'])} to {day(made['ends'])}" + ("" if made["starts"] <= time.time() + 60 else ", after your current pass")
        text = receipt.receipt_text(first, tier_name, plan["name"], multiplier, pay["amount"], plan["usd"], runs, made["reference"],
                                    cfg.public_url or "https://rahah.onrender.com", cfg.support_email)
        try:
            picture = receipt.receipt_image(first, plan["tier"], tier_name, plan["name"], multiplier, pay["amount"], plan["usd"], runs,
                                            day(time.time()), made["reference"], cfg.support_email)
            mailer(buyer["email"], f"Your Rahah {plan['name']} is ready", text, ("rahah-receipt.png", picture, "image/png"))
        except Exception as error:
            log.warning("couldn't send a receipt email: %s", error)

    def reward_referrer(buyer_id: str) -> None:
        buyer = db.get_user(buyer_id)
        if not buyer or not buyer.get("referred_by") or buyer.get("referral_rewarded"):
            return
        db.update_user(buyer_id, referral_rewarded=1)
        friend = db.get_user(buyer["referred_by"])
        if friend and not friend["disabled"]:
            gift = billing.free_passes["gift"]
            db.grant_free_pass(friend["id"], "gift", gift["days"], gift["budget"])

    @app.get("/api/pro/verify/{reference}")
    async def pro_verify(reference: str, user: dict = Depends(signed_in)):
        pay = db.get_payment(reference)
        if not pay or pay["user_id"] != user["id"]:
            raise HTTPException(404, "That payment isn't on your account.")
        if pay["status"] != "paid":
            if not payments:
                raise HTTPException(404, "Rahah Pro isn't open yet.")
            try:
                found = await asyncio.to_thread(payments.check, reference)
            except Exception as error:
                log.warning("paystack verify failed: %s", error)
                raise HTTPException(502, "Couldn't check the payment with Paystack just now. Refresh in a moment.")
            settle(reference, found)
        pay = db.get_payment(reference)
        return {"status": pay["status"], "pro": allowance_out(db.get_user(user["id"])).get("pro")}

    @app.post("/api/paystack/webhook")
    async def paystack_webhook(request: Request):
        # paystack tells rahah about payments here too, so a pass is given even if the student closed the page
        body = await request.body()
        if not billing.signature_ok(cfg.paystack_secret, body, request.headers.get("x-paystack-signature")):
            # someone pretending to be paystack, worth knowing about
            log.warning("a payment message with a wrong paystack signature was turned away, from %s", client_address(request))
            raise HTTPException(401, "Not from Paystack.")
        try:
            event = json.loads(body)
        except ValueError:
            raise HTTPException(400, "That wasn't readable.")
        data = event.get("data") or {}
        if event.get("event") == "charge.success" and data.get("reference"):
            settle(data["reference"], data)
        return {"ok": True}

    @app.post("/api/me/photo")
    async def set_photo(file: UploadFile = File(...), user: dict = Depends(signed_in)):
        data = await file.read(max_photo_upload + 1)
        if len(data) > max_photo_upload:
            raise HTTPException(413, "That photo is too big. Pick one under 12 MB.")
        try:
            square = await asyncio.to_thread(square_photo, data)
        except ValueError as error:
            raise HTTPException(400, str(error))
        photo_id = f"p_{secrets.token_hex(8)}"
        photos_dir.mkdir(parents=True, exist_ok=True)
        photo_path(photo_id).write_bytes(square)
        forget_photo(user.get("avatar") or "")
        return user_out(db.update_user(user["id"], avatar=photo_id))

    @app.delete("/api/me/photo")
    def remove_photo(user: dict = Depends(signed_in)):
        forget_photo(user.get("avatar") or "")
        return user_out(db.update_user(user["id"], avatar=""))

    @app.get("/api/photos/{username}")
    def show_photo(username: str, user: dict = Depends(signed_in)):
        # the student's own photo, a friend's, or anyone's on the everyone leaderboard. a student who turned off
        # being found shows only to friends
        owner = db.find_user_by("username", clean_username(username))
        path = photo_path(owner.get("avatar") or "") if owner and not owner["disabled"] else None
        allowed = owner and (owner["id"] == user["id"] or on_everyone_board(owner)
                             or link_status(db.link_between(user["id"], owner["id"]), user["id"]) == "friends")
        if not path or not allowed or not path.exists():
            raise HTTPException(404, "There's no photo here.")
        return Response(path.read_bytes(), media_type="image/jpeg", headers={"Cache-Control": "private, max-age=86400"})

    @app.post("/api/me/password")
    def change_password(body: password_in, request: Request, user: dict = Depends(signed_in)):
        # an account made with google or apple can add a password without a current one
        if user["password"] and not check_password(body.current, user["password"]):
            raise HTTPException(400, "Your current password isn't right.")
        problem = password_problem(body.new)
        if problem:
            raise HTTPException(400, problem)
        db.update_user(user["id"], password=hash_password(body.new))
        # other devices are signed out, this one stays in
        db.end_sessions(user["id"], keep=request.cookies.get(session_cookie))
        return {"ok": True}

    @app.post("/api/me/delete")
    async def delete_me(body: delete_me_in, response: Response, user: dict = Depends(signed_in)):
        """a student deletes their own account and everything in it, here and with claude"""
        if user["is_admin"]:
            raise HTTPException(400, "The admin account can't be deleted from here.")
        if user["password"]:
            if not check_password(body.password, user["password"]):
                raise HTTPException(400, "That password isn't right.")
        elif body.confirm != user["username"]:
            raise HTTPException(400, "Type your username exactly to confirm.")
        files = db.user_file_ids(user["id"])
        forget_photo(user.get("avatar") or "")
        db.delete_user(user["id"])
        sync_custom(db.list_subjects())
        response.delete_cookie(session_cookie, path="/")
        # their files with claude go too, a file that can't be removed now is only logged
        for file_id in files:
            try:
                await claude().files.delete(file_id)
            except Exception as error:
                if not is_claude_error(error):
                    raise
                log.warning("couldn't remove file %s from claude: %s", file_id, error)
        return {"ok": True}

    # the admin page, every student with what they've used, their limit and whether they can sign in

    def admin_row(user: dict, costs: dict) -> dict:
        today = db.user_cost_since(user["id"], my_day_start(user))
        cap = None if user["is_admin"] else (user["daily_cap"] if user["daily_cap"] is not None else cfg.daily_cap)
        return {
            "cap": cap,
            "left": None if cap is None else round(max(cap - today, 0), 4),
            "percent": None if cap is None else used_percent(today, cap),
            "id": user["id"], "username": user["username"], "email": user["email"], "name": user["name"],
            "is_admin": user["is_admin"], "disabled": user["disabled"], "created": user["created"],
            "last_seen": user["last_seen"], "daily_cap": user["daily_cap"],
            "google": bool(user["google_sub"]), "apple": bool(user["apple_sub"]),
            "pro_until": db.pro_until(user["id"]),
            "today": round(today, 4), "timezone": user.get("timezone") or cfg.leaderboard_zone,
            "week": round(costs["week"].get(user["id"], 0), 4),
            "all": round(costs["all"].get(user["id"], 0), 4),
        }

    def all_costs() -> dict:
        now = time.time()
        return {"today": db.cost_by_user(day_start(now)), "week": db.cost_by_user(now - 7 * 86400), "all": db.cost_by_user(0)}

    def admin_summary(rows: list[dict]) -> dict:
        """the numbers that say how students are doing as a group, the admin's own account left out"""
        now = time.time()
        students = [r for r in rows if not r["is_admin"]]
        spending = [r for r in students if r["today"] > 0]
        return {
            "signups_today": sum(1 for r in students if r["created"] >= day_start(now)),
            "signups_week": sum(1 for r in students if r["created"] >= now - 7 * 86400),
            "signups_before": sum(1 for r in students if now - 14 * 86400 <= r["created"] < now - 7 * 86400),
            "active_today": len(spending),
            "active_week": sum(1 for r in students if r["last_seen"] and r["last_seen"] >= now - 7 * 86400),
            "avg_today": round(sum(r["today"] for r in spending) / len(spending), 4) if spending else 0,
            "at_limit": sum(1 for r in students if r["percent"] is not None and r["percent"] >= 100),
            "near_limit": sum(1 for r in students if r["percent"] is not None and 80 <= r["percent"] < 100),
        }

    @app.get("/api/admin/users")
    def admin_users(user: dict = Depends(admin_only)):
        costs = all_costs()
        rows = [admin_row(u, costs) for u in db.list_users()]
        return {
            "users": rows, "default_cap": cfg.daily_cap, "total": {k: round(sum(v.values()), 4) for k, v in costs.items()},
            "budget": cfg.daily_budget, "budget_used": round(db.student_cost_since(day_start(time.time())), 4),
            "summary": admin_summary(rows),
        }

    def other_user_or_404(user_id: str) -> dict:
        found = db.get_user(user_id)
        if not found:
            raise HTTPException(404, "That student doesn't exist.")
        return found

    @app.patch("/api/admin/users/{user_id}")
    def admin_edit_user(user_id: str, body: admin_user_in, user: dict = Depends(admin_only)):
        target = other_user_or_404(user_id)
        change = {}
        if body.use_default_cap:
            change["daily_cap"] = None
        elif body.daily_cap is not None:
            change["daily_cap"] = body.daily_cap
        # the admin can't lock themselves out or give up being admin by mistake
        if body.disabled is not None:
            if user_id == user["id"]:
                raise HTTPException(400, "You can't turn off your own account.")
            change["disabled"] = body.disabled
            if body.disabled:
                db.end_sessions(user_id)
        if body.is_admin is not None:
            if user_id == user["id"] and not body.is_admin:
                raise HTTPException(400, "You can't stop being admin yourself.")
            change["is_admin"] = body.is_admin
        db.update_user(target["id"], **change)
        return admin_row(db.get_user(user_id), all_costs())

    @app.post("/api/admin/users/{user_id}/password")
    def admin_set_password(user_id: str, body: admin_password_in, user: dict = Depends(admin_only)):
        # for a student who forgot theirs, until password reset by email arrives
        target = other_user_or_404(user_id)
        problem = password_problem(body.new)
        if problem:
            raise HTTPException(400, problem)
        db.update_user(target["id"], password=hash_password(body.new))
        db.end_sessions(target["id"])
        return {"ok": True}

    def conversation_or_404(user: dict, conversation_id: str) -> dict:
        conversation = db.get_conversation(user["id"], conversation_id)
        if not conversation:
            raise HTTPException(404, "That conversation doesn't exist.")
        return conversation

    @app.middleware("http")
    async def always_check_for_changes(request, call_next):
        # the page, its styles and its script are checked again on every load, so a change shows up
        # without a hard refresh, and an unchanged file only costs a quick not modified reply
        response = await call_next(request)
        path = request.url.path
        if path == "/" or path.startswith("/static/"):
            response.headers["Cache-Control"] = "no-cache"
        return response

    @app.get("/")
    def index():
        return FileResponse(static_dir / "index.html")

    @app.get("/privacy")
    def privacy():
        # what rahah keeps and why, linked from sign in and the account tab, and given to google for sign in
        return FileResponse(static_dir / "privacy.html")

    @app.get("/terms")
    def terms():
        # the rules for using rahah, linked beside the privacy page
        return FileResponse(static_dir / "terms.html")

    @app.get("/sw.js")
    def service_worker():
        # served from the root so it covers the whole app, and checked on every load so updates land
        return FileResponse(static_dir / "sw.js", media_type="text/javascript", headers={"Cache-Control": "no-cache"})

    def log_usage(user: dict, kind: str):
        # each request to claude is logged with what it used and cost, against the student who asked
        return lambda use: db.add_usage(user["id"], kind, use, cost_of(use))

    @app.get("/api/today")
    def today_nudge(today: str, weekday: int, user: dict = Depends(signed_in)):
        # the page sends its own date and weekday, so the nudge fits the student's day
        try:
            day = date.fromisoformat(today)
        except ValueError:
            raise HTTPException(422, "Pick a real date.")
        decks = db.due_cards(user["id"])
        exams = [r for r in db.list_reminders(user["id"]) if r["kind"] in ("exam", "cat", "midterm") and not r["done"]]
        soon = sorted(
            ({"id": r["id"], "title": r["title"], "days": (date.fromisoformat(r["due_date"]) - day).days} for r in exams),
            key=lambda r: r["days"],
        )
        soon = [r for r in soon if 0 <= r["days"] <= 14]
        classes = [c for c in db.list_classes(user["id"]) if c["day"] == weekday]
        return {
            "cards_due": sum(d["due"] for d in decks),
            "deck": decks[0] if decks else None,
            "exam": soon[0] if soon else None,
            "classes": [{"title": c["title"], "start_time": c["start_time"], "end_time": c["end_time"]} for c in classes],
        }

    @app.post("/api/messages/{message_id}/rating")
    def rate_answer(message_id: int, body: rating_in, user: dict = Depends(signed_in)):
        # thumbs up or down on one of rahah's answers
        if not db.rate_message(user["id"], message_id, body.rating):
            raise HTTPException(404, "That answer doesn't exist.")
        return {"rating": body.rating}

    @app.get("/api/feedback")
    def feedback_report(user: dict = Depends(admin_only)):
        # every student's answer ratings, for the admin to see where rahah's instructions need work
        return db.feedback_summary(None)

    @app.get("/api/usage")
    def usage_report(user: dict = Depends(admin_only)):
        now = time.time()
        today = time.mktime(time.localtime(now)[:3] + (0, 0, 0, 0, 0, -1))
        since = {"today": today, "week": now - 7 * 86400, "all": 0}
        # what rahah costs in all, only the admin sees money
        return summarise_usage(db.usage_since(0), since)

    # this server's saved subjects join the list as it starts
    sync_custom(db.list_subjects())

    @app.post("/api/subjects")
    def add_subject(body: subject_in, user: dict = Depends(signed_in)):
        # a subject that already exists, built in or added before, is picked instead of added again
        found = find_mode(body.name, own_subjects(user))
        if not found:
            found = db.add_subject(user["id"], body.name)
            sync_custom(db.list_subjects())
        return {"id": found, "modes": public_modes(own_subjects(user))}

    @app.delete("/api/subjects/{subject_id}")
    def delete_subject(subject_id: str, user: dict = Depends(signed_in)):
        if not subject_id.startswith(custom_prefix) or subject_id not in own_subjects(user):
            raise HTTPException(404, "That subject doesn't exist.")
        db.delete_subject(user["id"], subject_id)
        sync_custom(db.list_subjects())
        return {"ok": True, "modes": public_modes(own_subjects(user))}

    @app.get("/api/modes")
    def list_modes(user: dict = Depends(signed_in)):
        return {
            "modes": public_modes(own_subjects(user)), "groups": groups, "menu_groups": menu_groups, "default": default_mode,
            "languages": answer_languages,
        }

    @app.get("/api/conversations")
    def list_conversations(user: dict = Depends(signed_in)):
        if is_pro(user):
            return {"conversations": db.list_conversations(user["id"], limit=200), "hidden": 0}
        shown = db.list_conversations(user["id"], limit=billing.free_recent_chats)
        return {"conversations": shown, "hidden": max(0, db.count_conversations(user["id"]) - len(shown))}

    @app.post("/api/conversations")
    def new_conversation(body: new_conversation_in, user: dict = Depends(signed_in)):
        check_mode(user, body.mode)
        return {"id": db.new_conversation(user["id"], body.mode)}

    @app.get("/api/search")
    def search_chats(q: str = "", user: dict = Depends(signed_in)):
        # every chat is searched, not only the newest ones the list shows
        words = " ".join(q.split())[:100]
        if len(words) < 2:
            return {"results": []}
        return {"results": db.search_chats(user["id"], words, newest=None if is_pro(user) else billing.free_recent_chats)}

    @app.get("/api/conversations/{conversation_id}")
    def get_conversation(conversation_id: str, user: dict = Depends(signed_in)):
        conversation = conversation_or_404(user, conversation_id)
        return {**conversation, "messages": db.display_messages(conversation_id)}

    @app.delete("/api/conversations/{conversation_id}")
    def delete_conversation(conversation_id: str, user: dict = Depends(signed_in)):
        conversation_or_404(user, conversation_id)
        db.delete_conversation(user["id"], conversation_id)
        return {"ok": True}

    @app.post("/api/files")
    async def upload_file(conversation_id: str = Form(...), file: UploadFile = File(...), user: dict = Depends(signed_in)):
        conversation_or_404(user, conversation_id)
        upload_mb = cfg.max_upload_mb * (2 if is_pro(user) else 1)
        limit = upload_mb * 1024 * 1024
        data = await file.read(limit + 1)
        if len(data) > limit:
            raise HTTPException(413, f"Files can be up to {upload_mb} MB." + ("" if is_pro(user) else " Pro doubles that."))
        if not data:
            raise HTTPException(400, "That file is empty.")
        name = Path(file.filename or "file").name[:120]
        media_type, kind = sniff_upload(name, data)
        try:
            uploaded = await claude().files.upload(file=(name, data, media_type))
        except Exception as error:
            if not is_claude_error(error):
                raise
            log.warning("file upload failed: %s", error)
            raise HTTPException(502, friendly_error(error))
        db.add_file(uploaded.id, conversation_id, name, kind, media_type, len(data))
        return {"id": uploaded.id, "name": name, "kind": kind, "size": len(data)}

    @app.get("/api/notes")
    def list_notes(user: dict = Depends(signed_in)):
        return {"notes": db.list_notes(user["id"])}

    @app.post("/api/notes")
    async def add_note(mode: str = Form(default_mode), file: UploadFile = File(...), user: dict = Depends(signed_in)):
        # a file kept in the notes library under a subject, uploaded to claude once
        check_mode(user, mode)
        room = billing.max_notes if is_max(user) else billing.pro_notes if is_pro(user) else billing.free_notes
        if db.count_notes(user["id"]) >= room:
            raise HTTPException(400, f"Your notes can hold up to {room} files. Remove some first." + ("" if is_max(user) else f" Max holds {billing.max_notes}." if is_pro(user) else f" Pro holds {billing.pro_notes}."))
        upload_mb = cfg.max_upload_mb * (2 if is_pro(user) else 1)
        limit = upload_mb * 1024 * 1024
        data = await file.read(limit + 1)
        if len(data) > limit:
            raise HTTPException(413, f"Files can be up to {upload_mb} MB." + ("" if is_pro(user) else " Pro doubles that."))
        if not data:
            raise HTTPException(400, "That file is empty.")
        name = Path(file.filename or "file").name[:120]
        media_type, kind = sniff_upload(name, data)
        try:
            uploaded = await claude().files.upload(file=(name, data, media_type))
        except Exception as error:
            if not is_claude_error(error):
                raise
            log.warning("note upload failed: %s", error)
            raise HTTPException(502, friendly_error(error))
        return db.add_note(user["id"], uploaded.id, mode, name, kind, media_type, len(data))

    @app.delete("/api/notes/{note_id}")
    async def delete_note(note_id: str, user: dict = Depends(signed_in)):
        if not db.delete_note(user["id"], note_id):
            raise HTTPException(404, "That note doesn't exist.")
        # chats that used the note still point at it, so the copy with claude goes only when nothing else does
        if not db.file_in_history(note_id):
            try:
                await claude().files.delete(note_id)
            except Exception as error:
                if not is_claude_error(error):
                    raise
                log.warning("couldn't remove note %s from claude: %s", note_id, error)
        return {"ok": True}

    @app.post("/api/conversations/{conversation_id}/messages")
    def send_message(conversation_id: str, body: message_in, user: dict = Depends(signed_in)):
        conversation = conversation_or_404(user, conversation_id)
        check_mode(user, body.mode)
        check_choice(user, body.model)
        check_allowance(user)
        text = body.text.strip()
        if not text:
            raise HTTPException(400, "Write a question first.")
        files = db.get_files(conversation_id, body.file_ids)
        if len(files) != len(set(body.file_ids)) or any(f.used for f in files):
            raise HTTPException(400, "One of the attached files is missing or already sent. Attach it again.")
        notes = db.note_files(user["id"], body.note_ids)
        if len(notes) != len(set(body.note_ids)):
            raise HTTPException(400, "One of those notes was removed from your notes.")
        files = files + notes

        history = db.api_messages(conversation_id)
        rows = [{
            "role": "user",
            "content": user_content(text, files),
            "display": {"text": text, "files": [{"name": f.name, "kind": f.kind} for f in files]},
            "file_ids": [f.id for f in files if f.conversation_id],
        }]
        changed = not history or conversation["mode"] != body.mode
        note = turn_note(body.mode if changed else None, hints=body.hints, extra=settings_notes(body))
        if note:
            rows.append(note)
        messages = history + [{"role": r["role"], "content": r["content"]} for r in rows]
        return answer_response(user, conversation_id, messages, rows, body.mode, text[:60], "chat", body.model, running.start(user["id"]))

    @app.post("/api/conversations/{conversation_id}/retry")
    def retry_answer(conversation_id: str, body: retry_in, user: dict = Depends(signed_in)):
        # the last answer is dropped and asked for again, the question stays as it was
        conversation = conversation_or_404(user, conversation_id)
        check_mode(user, body.mode)
        check_choice(user, body.model)
        check_allowance(user)
        if not db.drop_last_answer(conversation_id):
            raise HTTPException(400, "There's no answer to try again yet.")
        messages = db.api_messages(conversation_id)
        rows = []
        note = turn_note(body.mode if conversation["mode"] != body.mode else None, hints=body.hints, extra=settings_notes(body))
        if note:
            rows.append(note)
            messages.append(note)
        return answer_response(user, conversation_id, messages, rows, body.mode, "", "retry", body.model, running.start(user["id"]))

    @app.post("/api/conversations/{conversation_id}/edit")
    def edit_question(conversation_id: str, body: edit_in, user: dict = Depends(signed_in)):
        """a question asked again with new words: its old answer and everything after it go once the new answer is in.
        files sent with it stay"""
        conversation_or_404(user, conversation_id)
        check_mode(user, body.mode)
        check_choice(user, body.model)
        check_allowance(user)
        text = body.text.strip()
        if not text:
            raise HTTPException(400, "Write a question first.")
        old = db.question_at(conversation_id, body.index)
        if not old:
            raise HTTPException(404, "That question isn't in this chat any more. Refresh and try again.")
        content = [b for b in old["content"] if b.get("type") != "text"] + [{"type": "text", "text": text}]
        rows = [{"role": "user", "content": content, "display": {**old["display"], "text": text}}]
        note = turn_note(body.mode, hints=body.hints, extra=settings_notes(body))
        if note:
            rows.append(note)
        messages = db.api_messages_before(conversation_id, old["id"]) + [{"role": r["role"], "content": r["content"]} for r in rows]
        return answer_response(user, conversation_id, messages, rows, body.mode, text[:60] if body.index == 0 else "", "chat",
                               body.model, running.start(user["id"]), drop_from=old["id"])

    def answer_response(
        user: dict, conversation_id: str, messages: list[dict], rows: list[dict], mode: str, title: str, kind: str,
        choice: str = "auto", job: str = "", drop_from: int | None = None,
    ):
        # once code has run in a chat the tool stays on, since the history holds its runs
        sandbox = db.get_container(conversation_id)
        code = runs_code(mode) or sandbox is not None
        # the student's pick, or on auto, acolyte for everyday questions and mage for hard subjects
        use = chat_route(cfg, choice, mode, sandbox is not None)
        # on auto, a free student who's had today's mage answers gets acolyte
        if use.tier == "mage" and choice != "mage" and not free_mage_left(user):
            use = chat_route(cfg, "acolyte", mode, sandbox is not None)
        search = is_pro(user) or db.searches_since(user["id"], my_day_start(user)) < billing.free_searches_a_day
        # pro and max can send bigger files in one question, about 100 pages to free's 40
        paid = is_pro(user)
        prompt_cap = max(cfg.max_prompt_tokens, billing.paid_prompt_tokens) if paid and cfg.max_prompt_tokens > 0 else cfg.max_prompt_tokens
        messages = trimmed_history(messages)
        if not search:
            messages = messages + [{"role": "system", "content": search_off_note}]
        # the route actually used, which changes if acolyte is too slow to start and mage answers instead
        answered = {"route": use}

        async def routed():
            # a long chat or one with files is kept under the size cap first
            fitted = await fit_prompt(claude(), use.model, messages, prompt_cap, "" if paid else "Pro and Max read about 100 pages at once.")
            # a chat grown past what claude can read in one go is asked again with only its latest part
            started = False
            try:
                async for event in attempt(fitted):
                    started = True
                    yield event
            except anthropic.BadRequestError as error:
                if started or not prompt_too_long(error):
                    raise
                log.info("a chat was too long for claude, asking again with only its latest messages")
                async for event in attempt(trimmed_history(fitted, keep=6, step=2)):
                    yield event

        async def attempt(messages: list[dict]):
            stream = stream_reply(claude(), cfg, messages, code=code, container=container, model=use.model, effort=use.effort, search=search)
            backup = stall_backup(cfg, use)
            if backup:
                try:
                    first = await asyncio.wait_for(anext(stream), cfg.stall_seconds)
                except asyncio.TimeoutError:
                    # nothing yet, the stuck request is dropped and mage is asked, the switch is counted for the admin
                    await stream.aclose()
                    log.info("acolyte took over %ss to start, asking mage", cfg.stall_seconds)
                    db.add_usage(user["id"], "stall", {"model": use.model, "input_tokens": 0, "output_tokens": 0,
                                                        "cache_read": 0, "cache_write": 0, "searches": 0}, 0.0)
                    answered["route"] = backup
                    stream = stream_reply(claude(), cfg, messages, code=code, container=container, model=backup.model, effort=backup.effort, search=search)
                except StopAsyncIteration:
                    return
                else:
                    yield first
            async for event in stream:
                yield event
        container = sandbox["container_id"] if sandbox and sandbox["expires"] > time.time() + container_margin else None
        outputs = db.get_outputs(conversation_id)

        async def describe_output(file_id: str) -> dict:
            if file_id not in outputs:
                name, media_type = "file", "application/octet-stream"
                try:
                    meta = await claude().files.retrieve_metadata(file_id)
                    name, media_type = safe_filename(meta.filename), meta.mime_type
                except anthropic.AnthropicError as error:
                    log.warning("couldn't read details of output %s: %s", file_id, error)
                db.add_output(file_id, conversation_id, name, media_type)
                outputs[file_id] = {"id": file_id, "name": name, "type": media_type}
            return outputs[file_id]

        def save_stopped(partial: str, searches: list[str]) -> None:
            # the student stopped the answer, so the question and what arrived so far are kept, marked stopped
            text = partial.strip()
            content = [{"type": "text", "text": text or "(The student stopped this answer before it began.)"}]
            display = {"text": text, "sources": [], "runs": [], "searches": searches, "stopped": True}
            db.add_turn(conversation_id, rows + [{"role": "assistant", "content": content, "display": display}], mode, title, drop_from=drop_from)

        async def events():
            final, ended, partial, searches = None, False, "", []
            try:
                async for event in routed():
                    if event["t"] == "final":
                        final = event["v"]
                        continue
                    if event["t"] == "text":
                        partial += event["v"]
                    elif event["t"] == "search":
                        searches.append(event["v"])
                    elif event["t"] == "run_done":
                        event["v"]["files"] = [await describe_output(f) for f in event["v"].get("files", [])]
                    yield sse(event)
            except Exception as error:
                ended = True
                if not is_claude_error(error):
                    raise
                log.warning("claude request failed: %s", error)
                yield sse({"t": "error", "v": friendly_error(error)})
                return
            finally:
                running.finish(user["id"], job)
                # the page going away mid answer cancels this generator, that's the stop button
                if not ended and final is None:
                    save_stopped(partial, searches)
            ended = True
            if final.usage:
                log_usage(user, kind)(final.usage)

            # a refused turn is not saved, so the student can rephrase and carry on
            if final.stop_reason == "refusal":
                yield sse({"t": "refusal", "v": "Rahah can't help with that request. Try rephrasing it."})
                return
            display = {**display_from_content(final.content, outputs), "tier": answered["route"].tier}
            if not display["text"].strip():
                yield sse({"t": "error", "v": "Rahah returned an empty answer. Try asking again."})
                return
            rows.append({"role": "assistant", "content": history_blocks(final.content), "display": display})
            message_id = db.add_turn(conversation_id, rows, mode, title=title, drop_from=drop_from)
            if final.container:
                db.set_container(conversation_id, final.container, final.container_expires.timestamp())
            truncated = final.stop_reason in ("max_tokens", "pause_turn")
            yield sse({"t": "done", "v": {**display, "truncated": truncated, "id": message_id}})

        return StreamingResponse(
            events(),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
        )

    @app.get("/api/outputs/{file_id}")
    async def get_output(file_id: str, user: dict = Depends(signed_in)):
        # only files that came out of a run in one of the student's own chats can be fetched
        output = db.get_output(user["id"], file_id)
        if not output:
            raise HTTPException(404, "That file doesn't exist.")
        try:
            data = await (await claude().files.download(file_id)).read()
        except Exception as error:
            if not is_claude_error(error):
                raise
            log.warning("output download failed: %s", error)
            raise HTTPException(502, friendly_error(error))
        inline = output["media_type"] in inline_types
        return Response(
            data,
            media_type=output["media_type"] if inline else "application/octet-stream",
            headers={
                "Content-Disposition": f'{"inline" if inline else "attachment"}; filename="{safe_filename(output["name"])}"',
                "Cache-Control": "private, max-age=86400",
                "X-Content-Type-Options": "nosniff",
            },
        )

    def set_or_404(user: dict, set_id: str) -> dict:
        study_set = db.get_set(user["id"], set_id)
        if not study_set:
            raise HTTPException(404, "That set doesn't exist.")
        return study_set

    @app.get("/api/sets")
    def list_sets(user: dict = Depends(signed_in)):
        return {"sets": db.list_sets(user["id"])}

    @app.post("/api/sets")
    async def new_set(
        kind: str = Form(...),
        topic: str = Form(""),
        count: int = Form(10),
        mode: str = Form(default_mode),
        style: str = Form("choice"),
        files: list[UploadFile] | None = File(None),
        note_ids: list[str] | None = Form(None),
        language: str = Form(""),
        user: dict = Depends(signed_in),
    ):
        if kind not in kinds:
            raise HTTPException(400, "Unknown kind of study set.")
        if style not in styles:
            raise HTTPException(400, "Pick multiple choice, written, mixed or past paper.")
        check_mode(user, mode)
        check_allowance(user)
        if language and language not in answer_languages:
            raise HTTPException(400, "Pick an answer language from the list.")
        topic = topic.strip()
        if len(topic) > 2000:
            raise HTTPException(400, "Keep the topic under 2000 characters.")
        files = files or []
        notes = db.note_files(user["id"], note_ids or [])
        if len(notes) != len(set(note_ids or [])):
            raise HTTPException(400, "One of those notes was removed from your notes.")
        if len(files) + len(notes) > max_set_files:
            raise HTTPException(400, f"Add up to {max_set_files} files.")
        if not topic and not files and not notes:
            raise HTTPException(400, "Write a topic or add some notes first.")
        if style == "paper" and not files and not notes:
            raise HTTPException(400, "Attach the past paper under Notes first.")

        uploads, total = [], 0
        for f in files:
            data = await f.read(max_set_mb * 1024 * 1024 + 1)
            total += len(data)
            if total > max_set_mb * 1024 * 1024:
                raise HTTPException(413, f"Notes for one set can be up to {max_set_mb} MB in total.")
            if not data:
                raise HTTPException(400, "One of the files is empty.")
            name = Path(f.filename or "file").name[:120]
            media_type, file_kind = sniff_upload(name, data)
            uploads.append(upload(name, media_type, file_kind, data))
        uploads += [upload(n.name, n.media_type, n.kind, file_id=n.id) for n in notes]

        count = max(1, min(count, max_items))
        try:
            job = running.start(user["id"])
            try:
                made = await make_set(claude(), cfg, kind, topic, count, mode, uploads, style, on_usage=log_usage(user, kind), language=language)
            finally:
                running.finish(user["id"], job)
        except study_error as error:
            raise HTTPException(422, str(error))
        except Exception as error:
            if not is_claude_error(error):
                raise
            log.warning("study set failed: %s", error)
            raise HTTPException(502, friendly_error(error))
        set_id = db.add_set(user["id"], kind, made["title"], mode, made["items"])
        return db.get_set(user["id"], set_id)

    @app.get("/api/sets/{set_id}")
    def get_set(set_id: str, user: dict = Depends(signed_in)):
        return set_or_404(user, set_id)

    # sharing a test or deck with friends, who each get their own copy to take

    def share_address(request: Request, token: str) -> str:
        base = cfg.public_url or str(request.base_url).rstrip("/")
        return f"{base}/#/shared/{token}"

    @app.post("/api/sets/{set_id}/share")
    def share_set(set_id: str, request: Request, user: dict = Depends(signed_in)):
        token = db.share_set(user["id"], set_id)
        if not token:
            raise HTTPException(404, "That set doesn't exist.")
        return {"url": share_address(request, token)}

    @app.post("/api/sets/{set_id}/share/stop")
    def stop_sharing_set(set_id: str, user: dict = Depends(signed_in)):
        if not db.stop_sharing(user["id"], set_id):
            raise HTTPException(404, "That set doesn't exist.")
        return {"ok": True}

    def shared_or_404(token: str) -> dict:
        found = db.shared_set(token) if len(token) >= 20 else None
        if not found:
            raise HTTPException(404, "This link doesn't work any more. Ask your friend to share it again.")
        return found

    @app.get("/api/shared/{token}")
    def look_at_shared(token: str, user: dict = Depends(signed_in)):
        found = shared_or_404(token)
        items = found["items"]
        return {
            "title": found["title"], "kind": found["kind"], "mode": found["mode"], "size": found["size"],
            "marks": sum(i["marks"] if i.get("type") == "written" else 1 for i in items),
            "from": found["owner_name"] or found["owner_username"], "yours": found["user_id"] == user["id"],
        }

    @app.post("/api/shared/{token}/copy")
    def copy_shared(token: str, user: dict = Depends(signed_in)):
        found = shared_or_404(token)
        if found["user_id"] == user["id"]:
            return {"id": found["id"]}
        # a subject the friend made up themselves becomes general study for someone who doesn't have it
        mode = found["mode"] if allowed_mode(found["mode"], own_subjects(user)) else default_mode
        return {"id": db.add_set(user["id"], found["kind"], found["title"], mode, found["items"])}

    @app.post("/api/sets/{set_id}/mark")
    async def mark_written(
        set_id: str,
        index: int = Form(...),
        answer: str = Form(""),
        photo: UploadFile | None = File(None),
        user: dict = Depends(signed_in),
    ):
        # one written answer, typed, spoken or a photo of working, marked against its mark scheme
        study_set = set_or_404(user, set_id)
        items = study_set["items"]
        if study_set["kind"] != "quiz" or not 0 <= index < len(items) or items[index].get("type") != "written":
            raise HTTPException(400, "That question can't be marked.")
        answer = answer.strip()
        if len(answer) > 5000:
            raise HTTPException(400, "Keep the answer under 5000 characters.")
        shot = None
        if photo is not None:
            data = await photo.read(max_photo_mb * 1024 * 1024 + 1)
            if len(data) > max_photo_mb * 1024 * 1024:
                raise HTTPException(413, f"A photo can be up to {max_photo_mb} MB.")
            name = Path(photo.filename or "photo.jpg").name[:120]
            media_type, kind = sniff_upload(name, data) if data else ("", "")
            if kind != "image":
                raise HTTPException(400, "Send the working as a photo, a JPG, PNG, WEBP or GIF.")
            shot = upload(name, media_type, kind, data)
        if not answer and not shot:
            raise HTTPException(400, "Write, say or photograph an answer first.")
        check_allowance(user)
        if shot and not is_pro(user) and db.usage_count_since(user["id"], my_day_start(user), kind="marking_photo") >= billing.free_photo_marks_a_day:
            raise HTTPException(429, f"You've had {billing.free_photo_marks_a_day} photos marked today. Type your answer instead, or get Rahah Pro to mark as many photos as you like.")
        try:
            job = running.start(user["id"])
            try:
                return await mark_answer(claude(), cfg, items[index], study_set["mode"], answer, shot, on_usage=log_usage(user, "marking_photo" if shot else "marking"))
            finally:
                running.finish(user["id"], job)
        except study_error as error:
            raise HTTPException(422, str(error))
        except Exception as error:
            if not is_claude_error(error):
                raise
            # a photo claude can't open gets a plain message instead of the api's own
            if shot and isinstance(error, anthropic.BadRequestError) and "image" in str(error).lower():
                raise HTTPException(400, "Rahah couldn't read that photo. Try a clearer one, or type the answer.")
            log.warning("marking failed: %s", error)
            raise HTTPException(502, friendly_error(error))

    @app.post("/api/sets/{set_id}/cards")
    def rate_card(set_id: str, body: card_in, user: dict = Depends(signed_in)):
        # still learning or got it, for one flashcard
        study_set = set_or_404(user, set_id)
        if study_set["kind"] != "flashcards" or body.card >= len(study_set["items"]):
            raise HTTPException(400, "That card isn't in this deck.")
        box = db.rate_card(set_id, body.card, body.known)
        return {"box": box, "known": db.known_cards(set_id)}

    @app.post("/api/sets/{set_id}/score")
    def record_score(set_id: str, body: score_in, user: dict = Depends(signed_in)):
        # scores are in marks, a multiple choice question is one mark and a written one its own count
        study_set = set_or_404(user, set_id)
        marks = total_marks(study_set["items"])
        if study_set["kind"] != "quiz" or body.score > marks:
            raise HTTPException(400, "That score doesn't fit this set.")
        return {"best_score": db.record_score(set_id, body.score, marks)}

    @app.get("/api/performance")
    def performance(user: dict = Depends(signed_in)):
        return summarise(db.quiz_attempts(user["id"]))

    @app.get("/api/report")
    def report(offset: int = Query(0, ge=-14 * 60, le=14 * 60), user: dict = Depends(signed_in)):
        # the last seven days next to the seven before, on the student's clock
        now = time.time()
        since = now - 16 * 86400
        uid = user["id"]
        return weekly_report(db.quiz_attempts(uid), db.card_activity(uid, since), db.question_times(uid, since), now, offset)

    def study_history(user: dict) -> tuple[list[dict], list[dict], dict, list[dict]]:
        uid = user["id"]
        deadlines = [r for r in db.list_reminders(uid) if is_upcoming(r)][:10]
        return db.list_conversations(uid, limit=20), db.list_sets(uid, limit=20), summarise(db.quiz_attempts(uid)), deadlines

    def recommendations_body(user: dict, saved: dict | None, history: tuple) -> dict:
        # fresh means nothing new has been studied since these were picked
        # a deck or quiz deleted since then is left out
        items = [i for i in (saved["items"] if saved else []) if i["action"] != "open" or db.get_set(user["id"], i["set_id"])]
        return {
            "items": items,
            "created": saved["created"] if saved else None,
            "fresh": bool(saved) and saved["signature"] == signature(*history),
            "has_activity": has_activity(*history),
        }

    @app.get("/api/recommendations")
    def get_recommendations(user: dict = Depends(signed_in)):
        return recommendations_body(user, db.get_recommendations(user["id"]), study_history(user))

    @app.post("/api/recommendations")
    async def new_recommendations(user: dict = Depends(signed_in)):
        history = study_history(user)
        if not has_activity(*history):
            raise HTTPException(400, "Study something first, then Rahah can suggest what comes next.")
        check_allowance(user)
        try:
            job = running.start(user["id"])
            try:
                items = await recommend(claude(), cfg, *history, on_usage=log_usage(user, "suggestions"))
            finally:
                running.finish(user["id"], job)
        except study_error as error:
            raise HTTPException(422, str(error))
        except Exception as error:
            if not is_claude_error(error):
                raise
            log.warning("recommendations failed: %s", error)
            raise HTTPException(502, friendly_error(error))
        db.save_recommendations(user["id"], items, signature(*history))
        return recommendations_body(user, db.get_recommendations(user["id"]), history)

    # reminders, the page works out today's date itself, since that depends on where the student is

    def reminder_out(reminder: dict) -> dict:
        return {**reminder, "reminder_days": reminder_days(reminder["lead_days"], reminder["every_days"])}

    def reminder_or_404(user: dict, reminder_id: str) -> dict:
        reminder = db.get_reminder(user["id"], reminder_id)
        if not reminder:
            raise HTTPException(404, "That reminder doesn't exist.")
        return reminder

    def calendar_response(reminders: list[dict], name: str) -> Response:
        return Response(
            calendar_file(reminders),
            media_type="text/calendar; charset=utf-8",
            headers={"Content-Disposition": f'attachment; filename="{safe_filename(name)}.ics"'},
        )

    # friends and the weekly leaderboard

    board_zone = board.zone(cfg.leaderboard_zone)
    searches = counter(60, 60)

    def person_out(row: dict, status: str) -> dict:
        # what another student sees of someone, their username and first name only
        # the photo only for friends, everyone else sees the first letter
        photo = photo_url(row) if status == "friends" else ""
        return {"username": row["username"], "name": board.first_name(row["name"], row["username"]), "photo": photo, "status": status}

    def other_or_404(username: str, me: dict) -> dict:
        found = db.find_user_by("username", clean_username(username))
        if not found or found["disabled"] or found["id"] == me["id"]:
            raise HTTPException(404, "There's no student with that username.")
        return found

    def link_status(link: dict | None, uid: str) -> str:
        if not link:
            return "none"
        if link["accepted"]:
            return "friends"
        return "sent" if link["requester"] == uid else "asked"

    @app.get("/api/people")
    def find_people(q: str = Query("", max_length=40), user: dict = Depends(signed_in)):
        text = q.strip()
        if len(text) < 2:
            return {"people": []}
        if searches.full(user["id"]):
            raise HTTPException(429, "Slow down a little, then search again.")
        searches.add(user["id"])
        links = {link["other_id"]: link for link in db.friend_links(user["id"])}
        return {"people": [person_out(p, link_status(links.get(p["id"]), user["id"])) for p in db.search_people(user["id"], text)]}

    @app.get("/api/friends")
    def list_friends(user: dict = Depends(signed_in)):
        out = {"friends": [], "asked": [], "sent": []}
        for link in db.friend_links(user["id"]):
            status = link_status(link, user["id"])
            out[status].append(person_out(link, status))
        return out

    @app.post("/api/friends")
    def add_friend(body: friend_in, user: dict = Depends(signed_in)):
        other = other_or_404(body.username, user)
        link = db.link_between(user["id"], other["id"])
        if not link:
            # a request needs the other student to be findable, unless they asked first
            if not other["findable"]:
                raise HTTPException(404, "There's no student with that username.")
            if len(db.friend_ids(user["id"])) >= board.max_friends:
                raise HTTPException(400, f"You can have up to {board.max_friends} friends.")
            if db.requests_sent_since(user["id"], time.time() - 86400) >= board.requests_a_day:
                raise HTTPException(429, "That's a lot of friend requests for one day. Try again tomorrow.")
        return {"status": db.ask_friend(user["id"], other["id"])}

    @app.post("/api/friends/{username}/accept")
    def accept_friend(username: str, user: dict = Depends(signed_in)):
        other = other_or_404(username, user)
        if not db.accept_friend(user["id"], other["id"]):
            raise HTTPException(404, "That friend request isn't there any more.")
        return {"status": "friends"}

    @app.delete("/api/friends/{username}")
    def remove_friend(username: str, user: dict = Depends(signed_in)):
        other = other_or_404(username, user)
        db.drop_friend(user["id"], other["id"])
        return {"status": "none"}

    @app.post("/api/study-time")
    def study_minute(user: dict = Depends(signed_in)):
        # the page sends one of these each minute it's open and being used
        now = datetime.now(timezone.utc)
        minutes = db.add_study_minute(user["id"], board.local_day(now, board_zone), now.timestamp(), board.max_minutes_a_day)
        return {"minutes_today": minutes}

    board_top = 5

    def on_everyone_board(person: dict) -> bool:
        # every student who can be found, and the admin once they've chosen to show
        return not person["disabled"] and (person["on_board"] if person["is_admin"] else person["findable"])

    @app.get("/api/leaderboard")
    def leaderboard(scope: str = Query("friends", pattern="^(friends|everyone)$"), user: dict = Depends(signed_in)):
        """this week's points, among the student's friends, or among every student who can be found and the admin.
        anyone who turned off being found stays off the everyone board"""
        now = datetime.now(timezone.utc)
        start = board.week_start(now, board_zone)
        friend_ids = set(db.friend_ids(user["id"]))
        if scope == "everyone":
            people = {u["id"]: u for u in db.list_users() if on_everyone_board(u)}
            people[user["id"]] = user
        else:
            friends = {f: db.get_user(f) for f in friend_ids}
            # an admin who chose not to show is left off their friends' boards too
            people = {user["id"]: user, **{f: p for f, p in friends.items() if p and not (p["is_admin"] and not p["on_board"])}}
        day_of = lambda t: board.local_day(datetime.fromtimestamp(t, timezone.utc), board_zone)
        numbers = db.week_numbers(list(people), start.timestamp(), start.date().isoformat(), day_of)
        # last week, for how this week compares
        before = start - timedelta(days=7)
        last_week = db.week_numbers([user["id"]], before.timestamp(), before.date().isoformat(), day_of,
                                    end=start.timestamp(), end_day=start.date().isoformat())[user["id"]]
        rows = []
        for uid, person in people.items():
            n = numbers[uid]
            rows.append({
                "username": person["username"], "name": board.first_name(person["name"], person["username"]),
                "photo": photo_url(person),
                "points": board.points_for(n["marks"], n["cards"], n["minutes"], n["days"]),
                "minutes": n["minutes"], "marks": n["marks"], "cards": n["cards"], "days": n["days"],
                "accuracy": n["accuracy"], "you": uid == user["id"], "pro": None if person["is_admin"] else tier_of(person),
            })
        rows.sort(key=lambda r: (-r["points"], not r["you"], r["username"].lower()))
        for place, row in enumerate(rows, 1):
            row["place"] = place
        mine = next(r for r in rows if r["you"])
        # the race: the student just ahead and the one just behind, and test accuracy among those who took tests
        ahead = next((r for r in reversed(rows) if r["points"] > mine["points"]), None)
        behind = next((r for r in rows if r["points"] < mine["points"]), None)
        tested = sorted((r for r in rows if r["accuracy"] is not None), key=lambda r: -r["accuracy"])
        standing = {
            "ahead": {"name": ahead["name"], "gap": ahead["points"] - mine["points"]} if ahead else None,
            "behind": {"name": behind["name"], "gap": mine["points"] - behind["points"]} if behind else None,
            "last_week": board.points_for(last_week["marks"], last_week["cards"], last_week["minutes"], last_week["days"]),
            "accuracy": mine["accuracy"],
            "accuracy_place": next((i for i, r in enumerate(tested, 1) if r["you"]), None),
            "tested": len(tested),
            "top_points": rows[0]["points"],
            "place": mine["place"], "total": len(rows),
        }
        # each board shows only the top five, the student's own numbers come separately for their standing
        shown = rows[:board_top]
        return {
            "scope": scope, "top": board_top, "week_start": start.date().isoformat(), "board": shown, "me": mine, "standing": standing,
            "above": sum(1 for r in rows if r["points"] > mine["points"]),
            "rules": {"mark": board.points_per_mark, "card": board.points_per_card, "minutes": board.minutes_per_point, "day": board.points_per_day},
        }

    # phone notifications for reminders, and the calendar feed

    @app.get("/api/push")
    def push_status(user: dict = Depends(signed_in)):
        return {"key": push_public, "phones": db.count_pushes(user["id"])}

    @app.post("/api/push")
    def push_on(body: push_in, user: dict = Depends(signed_in)):
        if not allowed_endpoint(body.endpoint) or not body.p256dh or not body.auth:
            raise HTTPException(400, "This browser's notifications can't be used.")
        db.add_push(user["id"], body.endpoint, body.p256dh, body.auth, body.zone)
        return {"ok": True}

    @app.post("/api/push/off")
    def push_off(body: push_in, user: dict = Depends(signed_in)):
        db.remove_push(body.endpoint, user["id"])
        return {"ok": True}

    def feed_address(request: Request, token: str) -> str:
        base = cfg.public_url or str(request.base_url).rstrip("/")
        return f"{base}/cal/{token}.ics"

    @app.get("/api/calendar")
    def calendar_link(request: Request, user: dict = Depends(signed_in)):
        return {"url": feed_address(request, db.calendar_token(user["id"]))}

    @app.post("/api/calendar/new")
    def new_calendar_link(request: Request, user: dict = Depends(signed_in)):
        # a new address, the old one stops working, for when it was shared by mistake
        return {"url": feed_address(request, db.calendar_token(user["id"], fresh=True))}

    @app.get("/cal/{token}.ics")
    def calendar_feed(token: str):
        user = db.user_by_calendar(token) if len(token) >= 20 else None
        if not user or user["disabled"]:
            raise HTTPException(404, "That calendar link doesn't work any more.")
        return Response(
            feed_file(db.list_reminders(user["id"]), db.list_classes(user["id"])),
            media_type="text/calendar; charset=utf-8",
            headers={"Cache-Control": "no-cache", "Content-Disposition": 'inline; filename="rahah.ics"'},
        )

    @app.get("/api/reminders")
    def list_reminders(user: dict = Depends(signed_in)):
        return {"reminders": [reminder_out(r) for r in db.list_reminders(user["id"])], "kinds": reminder_kinds}

    @app.post("/api/reminders")
    def new_reminder(body: reminder_in, user: dict = Depends(signed_in)):
        return reminder_out(db.get_reminder(user["id"], db.save_reminder(user["id"], body.model_dump())))

    @app.put("/api/reminders/{reminder_id}")
    def edit_reminder(reminder_id: str, body: reminder_in, user: dict = Depends(signed_in)):
        reminder_or_404(user, reminder_id)
        return reminder_out(db.get_reminder(user["id"], db.save_reminder(user["id"], body.model_dump(), reminder_id)))

    @app.post("/api/reminders/{reminder_id}/done")
    def finish_reminder(reminder_id: str, body: done_in, user: dict = Depends(signed_in)):
        reminder_or_404(user, reminder_id)
        db.set_reminder_done(user["id"], reminder_id, body.done)
        return reminder_out(db.get_reminder(user["id"], reminder_id))

    @app.post("/api/reminders/{reminder_id}/seen")
    def saw_reminder(reminder_id: str, body: seen_in, user: dict = Depends(signed_in)):
        reminder_or_404(user, reminder_id)
        return {"seen": db.mark_reminder_seen(user["id"], reminder_id, body.day)}

    @app.delete("/api/reminders/{reminder_id}")
    def delete_reminder(reminder_id: str, user: dict = Depends(signed_in)):
        reminder_or_404(user, reminder_id)
        db.delete_reminder(user["id"], reminder_id)
        return {"ok": True}

    @app.post("/api/reminders/{reminder_id}/plan")
    async def plan_reminder(reminder_id: str, body: plan_in, user: dict = Depends(signed_in)):
        # today comes from the page, since the student's own date is what matters
        reminder = reminder_or_404(user, reminder_id)
        try:
            today = date.fromisoformat(body.today)
        except ValueError:
            raise HTTPException(422, "Pick a real date.")
        check_allowance(user)
        try:
            job = running.start(user["id"])
            try:
                days = await make_plan(claude(), cfg, reminder, today, body.topics.strip(), on_usage=log_usage(user, "plan"))
            finally:
                running.finish(user["id"], job)
        except study_error as error:
            raise HTTPException(422, str(error))
        except Exception as error:
            if not is_claude_error(error):
                raise
            log.warning("plan failed: %s", error)
            raise HTTPException(502, friendly_error(error))
        db.save_plan(user["id"], reminder_id, {"made": body.today, "topics": body.topics.strip(), "days": days})
        return reminder_out(db.get_reminder(user["id"], reminder_id))

    @app.post("/api/reminders/{reminder_id}/plan/day")
    def plan_day(reminder_id: str, body: plan_day_in, user: dict = Depends(signed_in)):
        reminder = reminder_or_404(user, reminder_id)
        plan = reminder["plan"]
        day = next((d for d in (plan or {}).get("days", []) if d["date"] == body.date), None)
        if not day:
            raise HTTPException(404, "That day isn't in the plan.")
        day["done"] = body.done
        db.save_plan(user["id"], reminder_id, plan)
        return reminder_out(db.get_reminder(user["id"], reminder_id))

    @app.get("/api/reminders/{reminder_id}/plan.ics")
    def plan_ics(reminder_id: str, user: dict = Depends(signed_in)):
        reminder = reminder_or_404(user, reminder_id)
        if not reminder["plan"]:
            raise HTTPException(404, "There's no plan for this yet.")
        return Response(
            plan_calendar(reminder, reminder["plan"]["days"]),
            media_type="text/calendar; charset=utf-8",
            headers={"Content-Disposition": f'attachment; filename="{safe_filename(reminder["title"])} plan.ics"'},
        )

    @app.get("/api/reminders/calendar.ics")
    def all_reminders_calendar(user: dict = Depends(signed_in)):
        upcoming = [r for r in db.list_reminders(user["id"]) if is_upcoming(r)]
        if not upcoming:
            raise HTTPException(404, "There are no upcoming reminders to add.")
        return calendar_response(upcoming, "rahah reminders")

    @app.get("/api/reminders/{reminder_id}/calendar.ics")
    def reminder_calendar(reminder_id: str, user: dict = Depends(signed_in)):
        reminder = reminder_or_404(user, reminder_id)
        return calendar_response([reminder], reminder["title"])

    # the weekly timetable

    def class_or_404(user: dict, class_id: str) -> dict:
        item = db.get_class(user["id"], class_id)
        if not item:
            raise HTTPException(404, "That class doesn't exist.")
        return item

    def timetable_response(classes: list[dict], name: str) -> Response:
        return Response(
            timetable_file(classes),
            media_type="text/calendar; charset=utf-8",
            headers={"Content-Disposition": f'attachment; filename="{safe_filename(name)}.ics"'},
        )

    @app.get("/api/timetable")
    def list_classes(user: dict = Depends(signed_in)):
        return {"classes": db.list_classes(user["id"])}

    @app.post("/api/timetable")
    def new_class(body: class_in, user: dict = Depends(signed_in)):
        return db.get_class(user["id"], db.save_class(user["id"], body.model_dump()))

    @app.put("/api/timetable/{class_id}")
    def edit_class(class_id: str, body: class_in, user: dict = Depends(signed_in)):
        class_or_404(user, class_id)
        return db.get_class(user["id"], db.save_class(user["id"], body.model_dump(), class_id))

    @app.delete("/api/timetable/{class_id}")
    def delete_class(class_id: str, user: dict = Depends(signed_in)):
        class_or_404(user, class_id)
        db.delete_class(user["id"], class_id)
        return {"ok": True}

    @app.get("/api/timetable/calendar.ics")
    def timetable_calendar(user: dict = Depends(signed_in)):
        classes = db.list_classes(user["id"])
        if not classes:
            raise HTTPException(404, "There are no classes to add yet.")
        return timetable_response(classes, "rahah timetable")

    @app.get("/api/timetable/{class_id}/calendar.ics")
    def class_calendar(class_id: str, user: dict = Depends(signed_in)):
        item = class_or_404(user, class_id)
        return timetable_response([item], item["title"])

    @app.delete("/api/sets/{set_id}")
    def delete_set(set_id: str, user: dict = Depends(signed_in)):
        set_or_404(user, set_id)
        db.delete_set(user["id"], set_id)
        return {"ok": True}

    app.mount("/static", StaticFiles(directory=static_dir), name="static")
    return app
