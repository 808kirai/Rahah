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

    def list_conversations(self, limit: int = 50) -> list[dict]:
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
                "select id, kind, title, mode, size, best_score, updated from study_sets "
                "order by updated desc limit ?",
                (limit,),
            ).fetchall()
        return [dict(r) for r in rows]

    def get_set(self, set_id: str) -> dict | None:
        with self._connect() as db:
            row = db.execute("select * from study_sets where id = ?", (set_id,)).fetchone()
        if not row:
            return None
        return {**dict(row), "items": json.loads(row["items"])}

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
