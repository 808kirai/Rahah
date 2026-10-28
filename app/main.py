"""the rahah web server, run it with uvicorn app.main:create_app --factory"""

import json
import logging
import re
import time
from pathlib import Path

import anthropic
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse, Response, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from .config import load_settings, settings
from .modes import default_mode, groups, menu_groups, modes, public_modes, runs_code
from .performance import summarise
from .recommend import has_activity, recommend, signature
from .reminders import calendar_file, is_upcoming, kinds as reminder_kinds, reminder_days, reminder_in
from .store import store
from .study import kinds, make_set, max_items, study_error, upload
from .tutor import display_from_content, history_blocks, mode_note, stream_reply, user_content

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
max_set_mb = 20


class new_conversation_in(BaseModel):
    mode: str = default_mode


class score_in(BaseModel):
    score: int = Field(ge=0)


class done_in(BaseModel):
    done: bool


class seen_in(BaseModel):
    day: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}$")


class message_in(BaseModel):
    text: str = Field(min_length=1, max_length=20000)
    mode: str = default_mode
    file_ids: list[str] = Field(default_factory=list, max_length=10)


def friendly_error(error: Exception) -> str:
    # most specific first, since these classes inherit from each other
    if isinstance(error, anthropic.AuthenticationError):
        return "Rahah's API key isn't valid. Check ANTHROPIC_API_KEY in the .env file."
    if isinstance(error, anthropic.PermissionDeniedError):
        return "Rahah's API key doesn't have access to this model."
    if isinstance(error, anthropic.NotFoundError):
        return "Claude couldn't find the model or an attached file. Try attaching the file again."
    if isinstance(error, anthropic.RateLimitError):
        return "Rahah is busy right now. Wait a moment and try again."
    if isinstance(error, anthropic.BadRequestError):
        return f"Claude couldn't process that request: {error.message}"
    if isinstance(error, anthropic.APIStatusError):
        return f"Claude is having trouble right now (error {error.status_code}). Try again in a moment."
    if isinstance(error, anthropic.APIConnectionError):
        return "Rahah couldn't reach Claude. Check the internet connection and try again."
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
            raise HTTPException(400, "That text file isn't UTF-8 text.")
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
    app = FastAPI(title="Rahah")
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

    @app.get("/")
    def index():
        return FileResponse(static_dir / "index.html")

    @app.get("/api/modes")
    def list_modes():
        return {"modes": public_modes(), "groups": groups, "menu_groups": menu_groups, "default": default_mode}

    @app.get("/api/conversations")
    def list_conversations():
        return {"conversations": db.list_conversations()}

    @app.post("/api/conversations")
    def new_conversation(body: new_conversation_in):
        if body.mode not in modes:
            raise HTTPException(400, "Unknown subject mode.")
        return {"id": db.new_conversation(body.mode)}

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

    @app.post("/api/conversations/{conversation_id}/messages")
    def send_message(conversation_id: str, body: message_in):
        conversation = conversation_or_404(conversation_id)
        if body.mode not in modes:
            raise HTTPException(400, "Unknown subject mode.")
        text = body.text.strip()
        if not text:
            raise HTTPException(400, "Write a question first.")
        files = db.get_files(conversation_id, body.file_ids)
        if len(files) != len(set(body.file_ids)) or any(f.used for f in files):
            raise HTTPException(400, "One of the attached files is missing or already sent. Attach it again.")

        history = db.api_messages(conversation_id)
        rows = [{
            "role": "user",
            "content": user_content(text, files),
            "display": {"text": text, "files": [{"name": f.name, "kind": f.kind} for f in files]},
            "file_ids": [f.id for f in files],
        }]
        if not history or conversation["mode"] != body.mode:
            rows.append(mode_note(body.mode))
        messages = history + [{"role": r["role"], "content": r["content"]} for r in rows]

        # once code has run in a chat the tool stays on, since the history holds its runs
        sandbox = db.get_container(conversation_id)
        code = runs_code(body.mode) or sandbox is not None
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

        async def events():
            final = None
            try:
                async for event in stream_reply(claude(), cfg, messages, code=code, container=container):
                    if event["t"] == "final":
                        final = event["v"]
                        continue
                    if event["t"] == "run_done":
                        event["v"]["files"] = [await describe_output(f) for f in event["v"].get("files", [])]
                    yield sse(event)
            except Exception as error:
                if not is_claude_error(error):
                    raise
                log.warning("claude request failed: %s", error)
                yield sse({"t": "error", "v": friendly_error(error)})
                return

            # a refused turn is not saved, so the student can rephrase and carry on
            if final.stop_reason == "refusal":
                yield sse({"t": "refusal", "v": "Rahah can't help with that request. Try rephrasing it."})
                return
            display = display_from_content(final.content, outputs)
            if not display["text"].strip():
                yield sse({"t": "error", "v": "Claude returned an empty answer. Try asking again."})
                return
            rows.append({"role": "assistant", "content": history_blocks(final.content), "display": display})
            db.add_turn(conversation_id, rows, body.mode, title=text[:60])
            if final.container:
                db.set_container(conversation_id, final.container, final.container_expires.timestamp())
            truncated = final.stop_reason in ("max_tokens", "pause_turn")
            yield sse({"t": "done", "v": {**display, "truncated": truncated}})

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
        files: list[UploadFile] | None = File(None),
    ):
        if kind not in kinds:
            raise HTTPException(400, "Unknown kind of study set.")
        if mode not in modes:
            raise HTTPException(400, "Unknown subject mode.")
        topic = topic.strip()
        if len(topic) > 2000:
            raise HTTPException(400, "Keep the topic under 2000 characters.")
        files = files or []
        if len(files) > max_set_files:
            raise HTTPException(400, f"Add up to {max_set_files} files.")
        if not topic and not files:
            raise HTTPException(400, "Write a topic or add some notes first.")

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

        count = max(1, min(count, max_items))
        try:
            made = await make_set(claude(), cfg, kind, topic, count, mode, uploads)
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

    @app.post("/api/sets/{set_id}/score")
    def record_score(set_id: str, body: score_in):
        study_set = set_or_404(set_id)
        if study_set["kind"] != "quiz" or body.score > study_set["size"]:
            raise HTTPException(400, "That score doesn't fit this set.")
        return {"best_score": db.record_score(set_id, body.score, study_set["size"])}

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
            items = await recommend(claude(), cfg, *history)
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

    @app.delete("/api/sets/{set_id}")
    def delete_set(set_id: str):
        set_or_404(set_id)
        db.delete_set(set_id)
        return {"ok": True}

    app.mount("/static", StaticFiles(directory=static_dir), name="static")
    return app
