"""local sqlite storage for conversations, messages and uploaded files

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
create index if not exists messages_by_conversation on messages(conversation_id, id);
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
