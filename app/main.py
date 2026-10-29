"""the rahah web server, run it with uvicorn app.main:create_app --factory"""

import asyncio
from datetime import date
import json
import logging
from contextlib import asynccontextmanager
import re
import time
from pathlib import Path

import anthropic
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse, Response, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field, field_validator

from .config import load_settings, settings
from .modes import custom_prefix, default_mode, find_mode, groups, menu_groups, modes, public_modes, runs_code, sync_custom
from .performance import summarise
from .plans import make_plan, plan_calendar
from .recommend import has_activity, recommend, signature
from .reminders import calendar_file, is_upcoming, kinds as reminder_kinds, reminder_days, reminder_in
from .store import store
from .timetable import calendar_file as timetable_file, class_in
from .usage import cost_of, summarise as summarise_usage
from .study import kinds, make_set, mark_answer, max_items, study_error, styles, total_marks, upload
from .tutor import answer_languages, display_from_content, history_blocks, language_note, low_data_note, stream_reply, turn_note, user_content

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


class retry_in(BaseModel):
    mode: str = default_mode
    hints: bool = False
    language: str = ""
    low_data: bool = False


def settings_notes(body) -> tuple:
    # the student's answer language and low-data mode, checked and turned into notes for this turn
    if body.language and body.language not in answer_languages:
        raise HTTPException(400, "Pick an answer language from the list.")
    return (language_note(body.language), low_data_note if body.low_data else "")


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
    if isinstance(error, anthropic.BadRequestError):
        return f"Rahah couldn't handle that request: {error.message}"
    if isinstance(error, anthropic.APIStatusError):
        return f"Rahah is having trouble right now (error {error.status_code}). Try again in a moment."
    if isinstance(error, anthropic.APIConnectionError):
        return "Rahah couldn't connect right now. Try again in a moment."
    return "Rahah isn't set up yet. Add ANTHROPIC_API_KEY to the .env file and restart the server."


def is_claude_error(error: Exception) -> bool:
    # with no key at all the sdk raises a plain type error before any request is sent
    if isinstance(error, anthropic.AnthropicError):
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


def create_app(cfg: settings | None = None, client=None) -> FastAPI:
    cfg = cfg or load_settings()
    db = store(cfg.db_path)

    @asynccontextmanager
    async def lifespan(_):
        # a backup when the server starts, then a check every hour for a new day, kept for a week
        async def back_up():
            try:
                made = await asyncio.to_thread(db.backup, cfg.db_path.parent / "backups")
                if made:
                    log.info("backed up the database to %s", made)
            except Exception as error:
                log.warning("database backup failed: %s", error)

        async def keep_backed_up():
            while True:
                await asyncio.sleep(3600)
                await back_up()

        await back_up()
        task = asyncio.create_task(keep_backed_up())
        yield
        task.cancel()

    app = FastAPI(title="Rahah", lifespan=lifespan)
    state = {"client": client}

    def claude():
        # created on first use, so the page still loads before a key is set
        if state["client"] is None:
            state["client"] = anthropic.AsyncAnthropic()
        return state["client"]

    def conversation_or_404(conversation_id: str) -> dict:
        conversation = db.get_conversation(conversation_id)
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

    @app.get("/sw.js")
    def service_worker():
        # served from the root so it covers the whole app, and checked on every load so updates land
        return FileResponse(static_dir / "sw.js", media_type="text/javascript", headers={"Cache-Control": "no-cache"})

    def log_usage(kind: str):
        # each request to claude is logged with what it used and cost, for the usage box and later for limits
        return lambda use: db.add_usage(kind, use, cost_of(use))

    @app.get("/api/today")
    def today_nudge(today: str, weekday: int):
        # the page sends its own date and weekday, so the nudge fits the student's day
        try:
            day = date.fromisoformat(today)
        except ValueError:
            raise HTTPException(422, "Pick a real date.")
        decks = db.due_cards()
        exams = [r for r in db.list_reminders() if r["kind"] in ("exam", "cat", "midterm") and not r["done"]]
        soon = sorted(
            ({"id": r["id"], "title": r["title"], "days": (date.fromisoformat(r["due_date"]) - day).days} for r in exams),
            key=lambda r: r["days"],
        )
        soon = [r for r in soon if 0 <= r["days"] <= 14]
        classes = [c for c in db.list_classes() if c["day"] == weekday]
        return {
            "cards_due": sum(d["due"] for d in decks),
            "deck": decks[0] if decks else None,
            "exam": soon[0] if soon else None,
            "classes": [{"title": c["title"], "start_time": c["start_time"], "end_time": c["end_time"]} for c in classes],
        }

    @app.post("/api/messages/{message_id}/rating")
    def rate_answer(message_id: int, body: rating_in):
        # thumbs up or down on one of rahah's answers
        if not db.rate_message(message_id, body.rating):
            raise HTTPException(404, "That answer doesn't exist.")
        return {"rating": body.rating}

    @app.get("/api/feedback")
    def feedback_report():
        return db.feedback_summary()

    @app.get("/api/usage")
    def usage_report():
        now = time.time()
        today = time.mktime(time.localtime(now)[:3] + (0, 0, 0, 0, 0, -1))
        since = {"today": today, "week": now - 7 * 86400, "all": 0}
        return summarise_usage(db.usage_since(0), since)

    # this server's saved subjects join the list as it starts
    sync_custom(db.list_subjects())

    @app.post("/api/subjects")
    def add_subject(body: subject_in):
        # a subject that already exists, built in or added before, is picked instead of added again
        found = find_mode(body.name)
        if not found:
            found = db.add_subject(body.name)
            sync_custom(db.list_subjects())
        return {"id": found, "modes": public_modes()}

    @app.delete("/api/subjects/{subject_id}")
    def delete_subject(subject_id: str):
        if not subject_id.startswith(custom_prefix) or subject_id not in modes:
            raise HTTPException(404, "That subject doesn't exist.")
        db.delete_subject(subject_id)
        sync_custom(db.list_subjects())
        return {"ok": True, "modes": public_modes()}

    @app.get("/api/modes")
    def list_modes():
        return {
            "modes": public_modes(), "groups": groups, "menu_groups": menu_groups, "default": default_mode,
            "languages": answer_languages,
        }

    @app.get("/api/conversations")
    def list_conversations():
        return {"conversations": db.list_conversations()}

    @app.post("/api/conversations")
    def new_conversation(body: new_conversation_in):
        if body.mode not in modes:
            raise HTTPException(400, "Unknown subject.")
        return {"id": db.new_conversation(body.mode)}

    @app.get("/api/search")
    def search_chats(q: str = ""):
        # every chat is searched, not only the newest ones the list shows
        words = " ".join(q.split())[:100]
        if len(words) < 2:
            return {"results": []}
        return {"results": db.search_chats(words)}

    @app.get("/api/conversations/{conversation_id}")
    def get_conversation(conversation_id: str):
        conversation = conversation_or_404(conversation_id)
        return {**conversation, "messages": db.display_messages(conversation_id)}

    @app.delete("/api/conversations/{conversation_id}")
    def delete_conversation(conversation_id: str):
        conversation_or_404(conversation_id)
        db.delete_conversation(conversation_id)
        return {"ok": True}

    @app.post("/api/files")
    async def upload_file(conversation_id: str = Form(...), file: UploadFile = File(...)):
        conversation_or_404(conversation_id)
        limit = cfg.max_upload_mb * 1024 * 1024
        data = await file.read(limit + 1)
        if len(data) > limit:
            raise HTTPException(413, f"Files can be up to {cfg.max_upload_mb} MB.")
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
    def list_notes():
        return {"notes": db.list_notes()}

    @app.post("/api/notes")
    async def add_note(mode: str = Form(default_mode), file: UploadFile = File(...)):
        # a file kept in the notes library under a subject, uploaded to claude once
        if mode not in modes:
            raise HTTPException(400, "Unknown subject.")
        if db.count_notes() >= max_notes:
            raise HTTPException(400, f"Your notes can hold up to {max_notes} files. Remove some first.")
        limit = cfg.max_upload_mb * 1024 * 1024
        data = await file.read(limit + 1)
        if len(data) > limit:
            raise HTTPException(413, f"Files can be up to {cfg.max_upload_mb} MB.")
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
        return db.add_note(uploaded.id, mode, name, kind, media_type, len(data))

    @app.delete("/api/notes/{note_id}")
    async def delete_note(note_id: str):
        if not db.delete_note(note_id):
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
    def send_message(conversation_id: str, body: message_in):
        conversation = conversation_or_404(conversation_id)
        if body.mode not in modes:
            raise HTTPException(400, "Unknown subject.")
        text = body.text.strip()
        if not text:
            raise HTTPException(400, "Write a question first.")
        files = db.get_files(conversation_id, body.file_ids)
        if len(files) != len(set(body.file_ids)) or any(f.used for f in files):
            raise HTTPException(400, "One of the attached files is missing or already sent. Attach it again.")
        notes = db.note_files(body.note_ids)
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
        return answer_response(conversation_id, messages, rows, body.mode, text[:60], "chat")

    @app.post("/api/conversations/{conversation_id}/retry")
    def retry_answer(conversation_id: str, body: retry_in):
        # the last answer is dropped and asked for again, the question stays as it was
        conversation = conversation_or_404(conversation_id)
        if body.mode not in modes:
            raise HTTPException(400, "Unknown subject.")
        if not db.drop_last_answer(conversation_id):
            raise HTTPException(400, "There's no answer to try again yet.")
        messages = db.api_messages(conversation_id)
        rows = []
        note = turn_note(body.mode if conversation["mode"] != body.mode else None, hints=body.hints, extra=settings_notes(body))
        if note:
            rows.append(note)
            messages.append(note)
        return answer_response(conversation_id, messages, rows, body.mode, "", "retry")

    def answer_response(conversation_id: str, messages: list[dict], rows: list[dict], mode: str, title: str, kind: str):
        # once code has run in a chat the tool stays on, since the history holds its runs
        sandbox = db.get_container(conversation_id)
        code = runs_code(mode) or sandbox is not None
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
            db.add_turn(conversation_id, rows + [{"role": "assistant", "content": content, "display": display}], mode, title)

        async def events():
            final, ended, partial, searches = None, False, "", []
            try:
                async for event in stream_reply(claude(), cfg, messages, code=code, container=container):
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
                # the page going away mid answer cancels this generator, that's the stop button
                if not ended and final is None:
                    save_stopped(partial, searches)
            ended = True
            if final.usage:
                log_usage(kind)(final.usage)

            # a refused turn is not saved, so the student can rephrase and carry on
            if final.stop_reason == "refusal":
                yield sse({"t": "refusal", "v": "Rahah can't help with that request. Try rephrasing it."})
                return
            display = display_from_content(final.content, outputs)
            if not display["text"].strip():
                yield sse({"t": "error", "v": "Rahah returned an empty answer. Try asking again."})
                return
            rows.append({"role": "assistant", "content": history_blocks(final.content), "display": display})
            message_id = db.add_turn(conversation_id, rows, mode, title=title)
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
    async def get_output(file_id: str):
        # only files that came out of a run in one of rahah's chats can be fetched
        output = db.get_output(file_id)
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

    def set_or_404(set_id: str) -> dict:
        study_set = db.get_set(set_id)
        if not study_set:
            raise HTTPException(404, "That set doesn't exist.")
        return study_set

    @app.get("/api/sets")
    def list_sets():
        return {"sets": db.list_sets()}

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
    ):
        if kind not in kinds:
            raise HTTPException(400, "Unknown kind of study set.")
        if style not in styles:
            raise HTTPException(400, "Pick multiple choice, written, mixed or past paper.")
        if mode not in modes:
            raise HTTPException(400, "Unknown subject.")
        if language and language not in answer_languages:
            raise HTTPException(400, "Pick an answer language from the list.")
        topic = topic.strip()
        if len(topic) > 2000:
            raise HTTPException(400, "Keep the topic under 2000 characters.")
        files = files or []
        notes = db.note_files(note_ids or [])
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
            made = await make_set(claude(), cfg, kind, topic, count, mode, uploads, style, on_usage=log_usage(kind), language=language)
        except study_error as error:
            raise HTTPException(422, str(error))
        except Exception as error:
            if not is_claude_error(error):
                raise
            log.warning("study set failed: %s", error)
            raise HTTPException(502, friendly_error(error))
        set_id = db.add_set(kind, made["title"], mode, made["items"])
        return db.get_set(set_id)

    @app.get("/api/sets/{set_id}")
    def get_set(set_id: str):
        return set_or_404(set_id)

    @app.post("/api/sets/{set_id}/mark")
    async def mark_written(
        set_id: str,
        index: int = Form(...),
        answer: str = Form(""),
        photo: UploadFile | None = File(None),
    ):
        # one written answer, typed, spoken or a photo of working, marked against its mark scheme
        study_set = set_or_404(set_id)
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
        try:
            return await mark_answer(claude(), cfg, items[index], study_set["mode"], answer, shot, on_usage=log_usage("marking"))
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
    def rate_card(set_id: str, body: card_in):
        # still learning or got it, for one flashcard
        study_set = set_or_404(set_id)
        if study_set["kind"] != "flashcards" or body.card >= len(study_set["items"]):
            raise HTTPException(400, "That card isn't in this deck.")
        box = db.rate_card(set_id, body.card, body.known)
        return {"box": box, "known": db.known_cards(set_id)}

    @app.post("/api/sets/{set_id}/score")
    def record_score(set_id: str, body: score_in):
        # scores are in marks, a multiple choice question is one mark and a written one its own count
        study_set = set_or_404(set_id)
        marks = total_marks(study_set["items"])
        if study_set["kind"] != "quiz" or body.score > marks:
            raise HTTPException(400, "That score doesn't fit this set.")
        return {"best_score": db.record_score(set_id, body.score, marks)}

    @app.get("/api/performance")
    def performance():
        return summarise(db.quiz_attempts())

    def study_history() -> tuple[list[dict], list[dict], dict, list[dict]]:
        deadlines = [r for r in db.list_reminders() if is_upcoming(r)][:10]
        return db.list_conversations(limit=20), db.list_sets(limit=20), summarise(db.quiz_attempts()), deadlines

    def recommendations_body(saved: dict | None, history: tuple) -> dict:
        # fresh means nothing new has been studied since these were picked
        # a deck or quiz deleted since then is left out
        items = [i for i in (saved["items"] if saved else []) if i["action"] != "open" or db.get_set(i["set_id"])]
        return {
            "items": items,
            "created": saved["created"] if saved else None,
            "fresh": bool(saved) and saved["signature"] == signature(*history),
            "has_activity": has_activity(*history),
        }

    @app.get("/api/recommendations")
    def get_recommendations():
        return recommendations_body(db.get_recommendations(), study_history())

    @app.post("/api/recommendations")
    async def new_recommendations():
        history = study_history()
        if not has_activity(*history):
            raise HTTPException(400, "Study something first, then Rahah can suggest what comes next.")
        try:
            items = await recommend(claude(), cfg, *history, on_usage=log_usage("suggestions"))
        except study_error as error:
            raise HTTPException(422, str(error))
        except Exception as error:
            if not is_claude_error(error):
                raise
            log.warning("recommendations failed: %s", error)
            raise HTTPException(502, friendly_error(error))
        db.save_recommendations(items, signature(*history))
        return recommendations_body(db.get_recommendations(), history)

    # reminders, the page works out today's date itself, since that depends on where the student is

    def reminder_out(reminder: dict) -> dict:
        return {**reminder, "reminder_days": reminder_days(reminder["lead_days"], reminder["every_days"])}

    def reminder_or_404(reminder_id: str) -> dict:
        reminder = db.get_reminder(reminder_id)
        if not reminder:
            raise HTTPException(404, "That reminder doesn't exist.")
        return reminder

    def calendar_response(reminders: list[dict], name: str) -> Response:
        return Response(
            calendar_file(reminders),
            media_type="text/calendar; charset=utf-8",
            headers={"Content-Disposition": f'attachment; filename="{safe_filename(name)}.ics"'},
        )

    @app.get("/api/reminders")
    def list_reminders():
        return {"reminders": [reminder_out(r) for r in db.list_reminders()], "kinds": reminder_kinds}

    @app.post("/api/reminders")
    def new_reminder(body: reminder_in):
        return reminder_out(db.get_reminder(db.save_reminder(body.model_dump())))

    @app.put("/api/reminders/{reminder_id}")
    def edit_reminder(reminder_id: str, body: reminder_in):
        reminder_or_404(reminder_id)
        return reminder_out(db.get_reminder(db.save_reminder(body.model_dump(), reminder_id)))

    @app.post("/api/reminders/{reminder_id}/done")
    def finish_reminder(reminder_id: str, body: done_in):
        reminder_or_404(reminder_id)
        db.set_reminder_done(reminder_id, body.done)
        return reminder_out(db.get_reminder(reminder_id))

    @app.post("/api/reminders/{reminder_id}/seen")
    def saw_reminder(reminder_id: str, body: seen_in):
        reminder_or_404(reminder_id)
        return {"seen": db.mark_reminder_seen(reminder_id, body.day)}

    @app.delete("/api/reminders/{reminder_id}")
    def delete_reminder(reminder_id: str):
        reminder_or_404(reminder_id)
        db.delete_reminder(reminder_id)
        return {"ok": True}

    @app.post("/api/reminders/{reminder_id}/plan")
    async def plan_reminder(reminder_id: str, body: plan_in):
        # today comes from the page, since the student's own date is what matters
        reminder = reminder_or_404(reminder_id)
        try:
            today = date.fromisoformat(body.today)
        except ValueError:
            raise HTTPException(422, "Pick a real date.")
        try:
            days = await make_plan(claude(), cfg, reminder, today, body.topics.strip(), on_usage=log_usage("plan"))
        except study_error as error:
            raise HTTPException(422, str(error))
        except Exception as error:
            if not is_claude_error(error):
                raise
            log.warning("plan failed: %s", error)
            raise HTTPException(502, friendly_error(error))
        db.save_plan(reminder_id, {"made": body.today, "topics": body.topics.strip(), "days": days})
        return reminder_out(db.get_reminder(reminder_id))

    @app.post("/api/reminders/{reminder_id}/plan/day")
    def plan_day(reminder_id: str, body: plan_day_in):
        reminder = reminder_or_404(reminder_id)
        plan = reminder["plan"]
        day = next((d for d in (plan or {}).get("days", []) if d["date"] == body.date), None)
        if not day:
            raise HTTPException(404, "That day isn't in the plan.")
        day["done"] = body.done
        db.save_plan(reminder_id, plan)
        return reminder_out(db.get_reminder(reminder_id))

    @app.get("/api/reminders/{reminder_id}/plan.ics")
    def plan_ics(reminder_id: str):
        reminder = reminder_or_404(reminder_id)
        if not reminder["plan"]:
            raise HTTPException(404, "There's no plan for this yet.")
        return Response(
            plan_calendar(reminder, reminder["plan"]["days"]),
            media_type="text/calendar; charset=utf-8",
            headers={"Content-Disposition": f'attachment; filename="{safe_filename(reminder["title"])} plan.ics"'},
        )

    @app.get("/api/reminders/calendar.ics")
    def all_reminders_calendar():
        upcoming = [r for r in db.list_reminders() if is_upcoming(r)]
        if not upcoming:
            raise HTTPException(404, "There are no upcoming reminders to add.")
        return calendar_response(upcoming, "rahah reminders")

    @app.get("/api/reminders/{reminder_id}/calendar.ics")
    def reminder_calendar(reminder_id: str):
        reminder = reminder_or_404(reminder_id)
        return calendar_response([reminder], reminder["title"])

    # the weekly timetable

    def class_or_404(class_id: str) -> dict:
        item = db.get_class(class_id)
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
    def list_classes():
        return {"classes": db.list_classes()}

    @app.post("/api/timetable")
    def new_class(body: class_in):
        return db.get_class(db.save_class(body.model_dump()))

    @app.put("/api/timetable/{class_id}")
    def edit_class(class_id: str, body: class_in):
        class_or_404(class_id)
        return db.get_class(db.save_class(body.model_dump(), class_id))

    @app.delete("/api/timetable/{class_id}")
    def delete_class(class_id: str):
        class_or_404(class_id)
        db.delete_class(class_id)
        return {"ok": True}

    @app.get("/api/timetable/calendar.ics")
    def timetable_calendar():
        classes = db.list_classes()
        if not classes:
            raise HTTPException(404, "There are no classes to add yet.")
        return timetable_response(classes, "rahah timetable")

    @app.get("/api/timetable/{class_id}/calendar.ics")
    def class_calendar(class_id: str):
        item = class_or_404(class_id)
        return timetable_response([item], item["title"])

    @app.delete("/api/sets/{set_id}")
    def delete_set(set_id: str):
        set_or_404(set_id)
        db.delete_set(set_id)
        return {"ok": True}

    app.mount("/static", StaticFiles(directory=static_dir), name="static")
    return app
