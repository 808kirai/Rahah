"""local sqlite storage for conversations, messages, uploaded files and study sets

messages keep the content blocks exactly as they are sent to claude, so every
later turn replays the same history byte for byte
"""

import json
import sqlite3
import time
import uuid
from contextlib import contextmanager
from dataclasses import dataclass
from pathlib import Path

schema = """
create table if not exists conversations (
    id text primary key,
    title text not null default '',
    mode text not null,
    created real not null,
    updated real not null
);
create table if not exists messages (
    id integer primary key autoincrement,
    conversation_id text not null references conversations(id) on delete cascade,
    role text not null,
    content text not null,
    display text
);
create table if not exists files (
    id text primary key,
    conversation_id text not null references conversations(id) on delete cascade,
    name text not null,
    kind text not null,
    media_type text not null,
    size integer not null,
    used integer not null default 0,
    created real not null
);
create table if not exists study_sets (
    id text primary key,
    kind text not null,
    title text not null,
    mode text not null,
    items text not null,
    size integer not null,
    best_score integer,
    created real not null,
    updated real not null
);
create table if not exists quiz_attempts (
    id integer primary key autoincrement,
    set_id text not null references study_sets(id) on delete cascade,
    score integer not null,
    total integer not null,
    created real not null
);
create table if not exists containers (
    conversation_id text primary key references conversations(id) on delete cascade,
    container_id text not null,
    expires real not null
);
create table if not exists outputs (
    id text primary key,
    conversation_id text not null references conversations(id) on delete cascade,
    name text not null,
    media_type text not null,
    created real not null
);
create table if not exists recommendations (
    id integer primary key check (id = 1),
    items text not null,
    signature text not null,
    created real not null
);
create table if not exists reminders (
    id text primary key,
    kind text not null,
    title text not null,
    mode text not null default '',
    due_date text not null,
    due_time text not null default '',
    every_days integer not null,
    lead_days integer not null,
    notes text not null default '',
    done integer not null default 0,
    seen text not null default '[]',
    plan text not null default '',
    created real not null,
    updated real not null
);
create table if not exists classes (
    id text primary key,
    title text not null,
    mode text not null default '',
    day integer not null,
    start_time text not null,
    end_time text not null,
    place text not null default '',
    created real not null,
    updated real not null
);
create table if not exists subjects (
    id text primary key,
    name text not null,
    created real not null
);
create table if not exists usage (
    id integer primary key autoincrement,
    kind text not null,
    model text not null,
    input_tokens integer not null,
    output_tokens integer not null,
    cache_read integer not null,
    cache_write integer not null,
    searches integer not null,
    cost real,
    created real not null
);
create index if not exists usage_by_time on usage(created);
create table if not exists card_progress (
    set_id text not null references study_sets(id) on delete cascade,
    card integer not null,
    box integer not null,
    updated real not null,
    primary key (set_id, card)
);
create index if not exists messages_by_conversation on messages(conversation_id, id);
create index if not exists attempts_by_time on quiz_attempts(created, id);
"""


@dataclass
class stored_file:
    id: str
    conversation_id: str
    name: str
    kind: str
    media_type: str
    size: int
    used: bool


class store:
    def __init__(self, db_path: Path):
        self.db_path = Path(db_path)
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        with self._connect() as db:
            db.executescript(schema)
            columns = {r["name"] for r in db.execute("pragma table_info(reminders)").fetchall()}
            if "plan" not in columns:
                db.execute("alter table reminders add column plan text not null default ''")

    @contextmanager
    def _connect(self):
        db = sqlite3.connect(self.db_path)
        db.row_factory = sqlite3.Row
        db.execute("pragma foreign_keys = on")
        try:
            yield db
            db.commit()
        finally:
            db.close()

    def new_conversation(self, mode: str) -> str:
        conversation_id = uuid.uuid4().hex
        now = time.time()
        with self._connect() as db:
            db.execute(
                "insert into conversations (id, mode, created, updated) values (?, ?, ?, ?)",
                (conversation_id, mode, now, now),
            )
        return conversation_id

    def get_conversation(self, conversation_id: str) -> dict | None:
        with self._connect() as db:
            row = db.execute("select * from conversations where id = ?", (conversation_id,)).fetchone()
        return dict(row) if row else None

    # only the newest chats are listed, older ones stay saved but aren't sent to the page
    def list_conversations(self, limit: int = 10) -> list[dict]:
        with self._connect() as db:
            rows = db.execute(
                "select id, title, mode, updated from conversations "
                "where title != '' order by updated desc limit ?",
                (limit,),
            ).fetchall()
        return [dict(r) for r in rows]

    def delete_conversation(self, conversation_id: str) -> None:
        with self._connect() as db:
            db.execute("delete from conversations where id = ?", (conversation_id,))

    def api_messages(self, conversation_id: str) -> list[dict]:
        # the history in the exact shape the messages api expects
        with self._connect() as db:
            rows = db.execute(
                "select role, content from messages where conversation_id = ? order by id",
                (conversation_id,),
            ).fetchall()
        return [{"role": r["role"], "content": json.loads(r["content"])} for r in rows]

    def display_messages(self, conversation_id: str) -> list[dict]:
        # only what the chat page shows, system mode notes are skipped
        with self._connect() as db:
            rows = db.execute(
                "select role, display from messages "
                "where conversation_id = ? and display is not null order by id",
                (conversation_id,),
            ).fetchall()
        return [{"role": r["role"], **json.loads(r["display"])} for r in rows]

    def drop_last_answer(self, conversation_id: str) -> bool:
        """removes the answer after the last question, false when there is no question yet"""
        with self._connect() as db:
            row = db.execute(
                "select max(id) as last from messages where conversation_id = ? and role = 'user'", (conversation_id,),
            ).fetchone()
            if row["last"] is None:
                return False
            db.execute(
                "delete from messages where conversation_id = ? and role = 'assistant' and id > ?",
                (conversation_id, row["last"]),
            )
        return True

    def add_turn(self, conversation_id: str, rows: list[dict], mode: str, title: str) -> None:
        # rows are written together so a failed turn never leaves half a history
        with self._connect() as db:
            for row in rows:
                display = row.get("display")
                db.execute(
                    "insert into messages (conversation_id, role, content, display) values (?, ?, ?, ?)",
                    (
                        conversation_id,
                        row["role"],
                        json.dumps(row["content"]),
                        json.dumps(display) if display is not None else None,
                    ),
                )
            db.execute(
                "update conversations set mode = ?, updated = ?, "
                "title = case when title = '' then ? else title end where id = ?",
                (mode, time.time(), title, conversation_id),
            )
            file_ids = [f for row in rows for f in row.get("file_ids", [])]
            db.executemany("update files set used = 1 where id = ?", [(f,) for f in file_ids])

    def add_file(self, file_id: str, conversation_id: str, name: str, kind: str, media_type: str, size: int) -> None:
        with self._connect() as db:
            db.execute(
                "insert into files (id, conversation_id, name, kind, media_type, size, created) "
                "values (?, ?, ?, ?, ?, ?, ?)",
                (file_id, conversation_id, name, kind, media_type, size, time.time()),
            )

    def get_files(self, conversation_id: str, file_ids: list[str]) -> list[stored_file]:
        if not file_ids:
            return []
        marks = ",".join("?" for _ in file_ids)
        with self._connect() as db:
            rows = db.execute(
                f"select * from files where conversation_id = ? and id in ({marks})",
                (conversation_id, *file_ids),
            ).fetchall()
        by_id = {r["id"]: r for r in rows}
        # keep the order the student attached them in
        return [
            stored_file(
                id=r["id"], conversation_id=r["conversation_id"], name=r["name"], kind=r["kind"],
                media_type=r["media_type"], size=r["size"], used=bool(r["used"]),
            )
            for f in file_ids
            if (r := by_id.get(f))
        ]

    # the sandbox claude runs code in, and the files those runs make

    def get_container(self, conversation_id: str) -> dict | None:
        with self._connect() as db:
            row = db.execute("select * from containers where conversation_id = ?", (conversation_id,)).fetchone()
        return dict(row) if row else None

    def set_container(self, conversation_id: str, container_id: str, expires: float) -> None:
        with self._connect() as db:
            db.execute(
                "insert into containers (conversation_id, container_id, expires) values (?, ?, ?) "
                "on conflict(conversation_id) do update set container_id = excluded.container_id, "
                "expires = excluded.expires",
                (conversation_id, container_id, expires),
            )

    def add_output(self, file_id: str, conversation_id: str, name: str, media_type: str) -> None:
        with self._connect() as db:
            db.execute(
                "insert or ignore into outputs (id, conversation_id, name, media_type, created) "
                "values (?, ?, ?, ?, ?)",
                (file_id, conversation_id, name, media_type, time.time()),
            )

    def get_outputs(self, conversation_id: str) -> dict[str, dict]:
        with self._connect() as db:
            rows = db.execute(
                "select id, name, media_type from outputs where conversation_id = ?", (conversation_id,),
            ).fetchall()
        return {r["id"]: {"id": r["id"], "name": r["name"], "type": r["media_type"]} for r in rows}

    def get_output(self, file_id: str) -> dict | None:
        with self._connect() as db:
            row = db.execute("select * from outputs where id = ?", (file_id,)).fetchone()
        return dict(row) if row else None

    # reminders for exams, assignments and other events
    # seen holds the dates a reminder was already shown on, so it isn't shown twice in a day

    def _reminder(self, row) -> dict:
        reminder = {**dict(row), "done": bool(row["done"]), "seen": json.loads(row["seen"])}
        reminder["plan"] = json.loads(row["plan"]) if row["plan"] else None
        return reminder

    # a revision plan, the days and whether each one is done
    def save_plan(self, reminder_id: str, plan: dict | None) -> None:
        with self._connect() as db:
            db.execute("update reminders set plan = ? where id = ?", (json.dumps(plan) if plan else "", reminder_id))

    def list_reminders(self) -> list[dict]:
        with self._connect() as db:
            rows = db.execute("select * from reminders order by due_date, due_time, created").fetchall()
        return [self._reminder(r) for r in rows]

    def get_reminder(self, reminder_id: str) -> dict | None:
        with self._connect() as db:
            row = db.execute("select * from reminders where id = ?", (reminder_id,)).fetchone()
        return self._reminder(row) if row else None

    def save_reminder(self, fields: dict, reminder_id: str | None = None) -> str:
        now = time.time()
        columns = ("kind", "title", "mode", "due_date", "due_time", "every_days", "lead_days", "notes")
        values = [fields[c] for c in columns]
        with self._connect() as db:
            if reminder_id:
                db.execute(
                    f"update reminders set {', '.join(f'{c} = ?' for c in columns)}, updated = ? where id = ?",
                    (*values, now, reminder_id),
                )
                return reminder_id
            reminder_id = uuid.uuid4().hex
            db.execute(
                f"insert into reminders (id, {', '.join(columns)}, created, updated) "
                f"values (?, {', '.join('?' for _ in columns)}, ?, ?)",
                (reminder_id, *values, now, now),
            )
        return reminder_id

    def set_reminder_done(self, reminder_id: str, done: bool) -> None:
        with self._connect() as db:
            db.execute("update reminders set done = ?, updated = ? where id = ?", (int(done), time.time(), reminder_id))

    def mark_reminder_seen(self, reminder_id: str, day: str) -> list[str]:
        with self._connect() as db:
            row = db.execute("select seen from reminders where id = ?", (reminder_id,)).fetchone()
            seen = json.loads(row["seen"])
            if day not in seen:
                # only the last few dates matter, the list never grows past the reminders themselves
                seen = (seen + [day])[-60:]
                db.execute("update reminders set seen = ? where id = ?", (json.dumps(seen), reminder_id))
        return seen

    def delete_reminder(self, reminder_id: str) -> None:
        with self._connect() as db:
            db.execute("delete from reminders where id = ?", (reminder_id,))

    # a safe copy of the whole database, one a day, the oldest dropped after keep days

    def backup(self, folder: Path, keep: int = 7) -> Path | None:
        """copies the database to folder as rahah-yyyy-mm-dd.db unless today's copy is there already"""
        folder = Path(folder)
        folder.mkdir(parents=True, exist_ok=True)
        target = folder / f"rahah-{time.strftime('%Y-%m-%d')}.db"
        if target.exists():
            return None
        # sqlite's own backup copies a consistent snapshot even while the app is writing
        with self._connect() as source:
            copy = sqlite3.connect(target)
            try:
                source.backup(copy)
            finally:
                copy.close()
        for old in sorted(folder.glob("rahah-*.db"))[:-keep]:
            old.unlink()
        return target

    # what each request to claude used and cost

    def add_usage(self, kind: str, use: dict, cost: float | None) -> None:
        with self._connect() as db:
            db.execute(
                "insert into usage (kind, model, input_tokens, output_tokens, cache_read, cache_write, searches, cost, created) "
                "values (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (kind, use["model"], use["input_tokens"], use["output_tokens"], use["cache_read"], use["cache_write"],
                 use["searches"], cost, time.time()),
            )

    def usage_since(self, start: float) -> list[dict]:
        with self._connect() as db:
            rows = db.execute("select * from usage where created >= ? order by created", (start,)).fetchall()
        return [dict(r) for r in rows]

    # subjects the student added themselves

    def list_subjects(self) -> list[dict]:
        with self._connect() as db:
            rows = db.execute("select id, name from subjects order by created").fetchall()
        return [dict(r) for r in rows]

    def add_subject(self, name: str) -> str:
        subject_id = "my-" + uuid.uuid4().hex[:10]
        with self._connect() as db:
            db.execute("insert into subjects (id, name, created) values (?, ?, ?)", (subject_id, name, time.time()))
        return subject_id

    def delete_subject(self, subject_id: str) -> None:
        # anything filed under it moves back to general study, which reminders and classes store as blank
        with self._connect() as db:
            db.execute("delete from subjects where id = ?", (subject_id,))
            db.execute("update conversations set mode = 'general' where mode = ?", (subject_id,))
            db.execute("update study_sets set mode = 'general' where mode = ?", (subject_id,))
            db.execute("update reminders set mode = '' where mode = ?", (subject_id,))
            db.execute("update classes set mode = '' where mode = ?", (subject_id,))

    # the weekly timetable, in order through the week

    def list_classes(self) -> list[dict]:
        with self._connect() as db:
            rows = db.execute("select * from classes order by day, start_time, created").fetchall()
        return [dict(r) for r in rows]

    def get_class(self, class_id: str) -> dict | None:
        with self._connect() as db:
            row = db.execute("select * from classes where id = ?", (class_id,)).fetchone()
        return dict(row) if row else None

    def save_class(self, fields: dict, class_id: str | None = None) -> str:
        now = time.time()
        columns = ("title", "mode", "day", "start_time", "end_time", "place")
        values = [fields[c] for c in columns]
        with self._connect() as db:
            if class_id:
                db.execute(
                    f"update classes set {', '.join(f'{c} = ?' for c in columns)}, updated = ? where id = ?",
                    (*values, now, class_id),
                )
                return class_id
            class_id = uuid.uuid4().hex
            db.execute(
                f"insert into classes (id, {', '.join(columns)}, created, updated) "
                f"values (?, {', '.join('?' for _ in columns)}, ?, ?)",
                (class_id, *values, now, now),
            )
        return class_id

    def delete_class(self, class_id: str) -> None:
        with self._connect() as db:
            db.execute("delete from classes where id = ?", (class_id,))

    # recommendations, only the latest batch is kept

    def get_recommendations(self) -> dict | None:
        with self._connect() as db:
            row = db.execute("select items, signature, created from recommendations where id = 1").fetchone()
        if not row:
            return None
        return {"items": json.loads(row["items"]), "signature": row["signature"], "created": row["created"]}

    def save_recommendations(self, items: list[dict], signature: str) -> float:
        now = time.time()
        with self._connect() as db:
            db.execute(
                "insert into recommendations (id, items, signature, created) values (1, ?, ?, ?) "
                "on conflict(id) do update set items = excluded.items, signature = excluded.signature, "
                "created = excluded.created",
                (json.dumps(items), signature, now),
            )
        return now

    # study sets, flashcard decks and quizzes

    def add_set(self, kind: str, title: str, mode: str, items: list[dict]) -> str:
        set_id = uuid.uuid4().hex
        now = time.time()
        with self._connect() as db:
            db.execute(
                "insert into study_sets (id, kind, title, mode, items, size, created, updated) "
                "values (?, ?, ?, ?, ?, ?, ?, ?)",
                (set_id, kind, title, mode, json.dumps(items), len(items), now, now),
            )
        return set_id

    def list_sets(self, limit: int = 50) -> list[dict]:
        with self._connect() as db:
            rows = db.execute(
                "select id, kind, title, mode, size, best_score, updated, items from study_sets "
                "order by updated desc limit ?",
                (limit,),
            ).fetchall()
        # tests are scored in marks, which can be more than the number of questions once some are written
        with self._connect() as db:
            known = {r["set_id"]: r["n"] for r in db.execute(
                "select set_id, count(*) as n from card_progress where box >= 2 group by set_id").fetchall()}
        sets = []
        for r in rows:
            row = dict(r)
            row["known"] = known.get(row["id"], 0)
            items = json.loads(row.pop("items"))
            row["marks"] = sum(i["marks"] if i.get("type") == "written" else 1 for i in items)
            row["written"] = any(i.get("type") == "written" for i in items)
            sets.append(row)
        return sets

    def get_set(self, set_id: str) -> dict | None:
        with self._connect() as db:
            row = db.execute("select * from study_sets where id = ?", (set_id,)).fetchone()
            boxes = db.execute("select card, box from card_progress where set_id = ?", (set_id,)).fetchall()
        if not row:
            return None
        return {**dict(row), "items": json.loads(row["items"]), "progress": {str(b["card"]): b["box"] for b in boxes}}

    # flashcards move up a box each time they're known and back to the first box when they aren't,
    # a card counts as known while it's in box 2 or higher
    def rate_card(self, set_id: str, card: int, known: bool) -> int:
        with self._connect() as db:
            row = db.execute("select box from card_progress where set_id = ? and card = ?", (set_id, card)).fetchone()
            box = min(max(row["box"] if row else 0, 1) + 1, 5) if known else 1
            db.execute(
                "insert into card_progress (set_id, card, box, updated) values (?, ?, ?, ?) "
                "on conflict(set_id, card) do update set box = excluded.box, updated = excluded.updated",
                (set_id, card, box, time.time()),
            )
        return box

    def known_cards(self, set_id: str) -> int:
        with self._connect() as db:
            row = db.execute("select count(*) as n from card_progress where set_id = ? and box >= 2", (set_id,)).fetchone()
        return row["n"]

    def record_score(self, set_id: str, score: int, total: int) -> int:
        # every attempt is kept for the performance page, and the best score moves the set to the front of its row
        now = time.time()
        with self._connect() as db:
            db.execute(
                "insert into quiz_attempts (set_id, score, total, created) values (?, ?, ?, ?)",
                (set_id, score, total, now),
            )
            db.execute(
                "update study_sets set best_score = max(coalesce(best_score, 0), ?), updated = ? where id = ?",
                (score, now, set_id),
            )
            row = db.execute("select best_score from study_sets where id = ?", (set_id,)).fetchone()
        return row["best_score"]

    def quiz_attempts(self) -> list[dict]:
        # oldest first, with the quiz each attempt belongs to
        with self._connect() as db:
            rows = db.execute(
                "select a.set_id, s.title, s.mode, a.score, a.total, a.created "
                "from quiz_attempts a join study_sets s on s.id = a.set_id order by a.created, a.id"
            ).fetchall()
        return [dict(r) for r in rows]

    def delete_set(self, set_id: str) -> None:
        with self._connect() as db:
            db.execute("delete from study_sets where id = ?", (set_id,))
