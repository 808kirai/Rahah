"""local sqlite storage for accounts, conversations, messages, uploaded files and study sets

messages keep the content blocks exactly as they are sent to claude, so every
later turn replays the same history byte for byte

everything a student makes belongs to their account through a user_id column on the top level
tables, chats, sets, reminders, classes, subjects, notes and usage. the rest hangs off those, so a
message is reached through its chat and a card's progress through its deck, and the server checks the
chat or deck belongs to the student first. every method that lists or finds top level rows takes the
student's id
"""

import json
import sqlite3
import time
import uuid
from contextlib import contextmanager
from dataclasses import dataclass
from pathlib import Path

from .accounts import new_token, session_days, token_hash

schema = """
create table if not exists users (
    id text primary key,
    username text not null unique,
    email text unique,
    password text,
    name text not null default '',
    google_sub text unique,
    apple_sub text unique,
    is_admin integer not null default 0,
    daily_cap real,
    disabled integer not null default 0,
    settings text not null default '{}',
    created real not null,
    last_seen real
);
create table if not exists app_keys (
    name text primary key,
    value text not null
);
create table if not exists push_subs (
    endpoint text primary key,
    user_id text not null references users(id) on delete cascade,
    p256dh text not null,
    auth text not null,
    zone text not null default '',
    created real not null
);
create table if not exists push_sent (
    reminder_id text not null references reminders(id) on delete cascade,
    day text not null,
    primary key (reminder_id, day)
);
create table if not exists password_resets (
    token text primary key,
    user_id text not null references users(id) on delete cascade,
    expires real not null,
    used integer not null default 0
);
create table if not exists sessions (
    token text primary key,
    user_id text not null references users(id) on delete cascade,
    created real not null,
    expires real not null
);
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
create table if not exists suggestions (
    user_id text primary key references users(id) on delete cascade,
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
create table if not exists notes (
    id text primary key,
    mode text not null,
    name text not null,
    kind text not null,
    media_type text not null,
    size integer not null,
    created real not null
);
create table if not exists feedback (
    message_id integer primary key references messages(id) on delete cascade,
    rating integer not null,
    created real not null
);
create index if not exists messages_by_conversation on messages(conversation_id, id);
create index if not exists attempts_by_time on quiz_attempts(created, id);
"""

# the tables a student's own rows live in, each gets a user_id column
owned_tables = ("conversations", "study_sets", "reminders", "classes", "subjects", "notes", "usage")

# what the page may see of an account
public_user_fields = ("id", "username", "email", "name", "is_admin", "daily_cap", "created")


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
            # when the student ticked the box for the terms, privacy and a guardian's ok if under 18
            columns = {r["name"] for r in db.execute("pragma table_info(users)").fetchall()}
            if "agreed" not in columns:
                db.execute("alter table users add column agreed real")
            # a shared test or deck has a secret link anyone signed in can copy it from
            set_columns = {r["name"] for r in db.execute("pragma table_info(study_sets)").fetchall()}
            if "share_token" not in set_columns:
                db.execute("alter table study_sets add column share_token text")
                db.execute("create unique index if not exists sets_by_share on study_sets(share_token)")
            # the secret part of each student's calendar feed address
            if "calendar_token" not in columns:
                db.execute("alter table users add column calendar_token text")
                db.execute("create unique index if not exists users_by_calendar on users(calendar_token)")
            # rows from before accounts have no owner until the first account claims them
            for table in owned_tables:
                columns = {r["name"] for r in db.execute(f"pragma table_info({table})").fetchall()}
                if "user_id" not in columns:
                    db.execute(f"alter table {table} add column user_id text references users(id) on delete cascade")
                db.execute(f"create index if not exists {table}_by_user on {table}(user_id)")

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

    # accounts

    def _user(self, row) -> dict | None:
        if not row:
            return None
        user = dict(row)
        user["is_admin"] = bool(user["is_admin"])
        user["disabled"] = bool(user["disabled"])
        user["settings"] = json.loads(user["settings"] or "{}")
        return user

    def create_user(self, username: str, email: str | None, password: str | None, name: str = "",
                    google_sub: str | None = None, apple_sub: str | None = None, admin: bool | None = None,
                    agreed: bool = False) -> dict:
        """a new account, admin when admin is true, or when it's left out and this is the very first account,
        and the admin takes everything made before accounts"""
        user_id = uuid.uuid4().hex
        now = time.time()
        with self._connect() as db:
            first = db.execute("select count(*) from users").fetchone()[0] == 0 if admin is None else admin
            db.execute(
                "insert into users (id, username, email, password, name, google_sub, apple_sub, is_admin, created, last_seen, agreed) "
                "values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (user_id, username, email, password, name, google_sub, apple_sub, int(first), now, now, now if agreed else None),
            )
            if first:
                self._claim_unowned(db, user_id)
        return self.get_user(user_id)

    def make_admin(self, user_id: str) -> dict | None:
        """turns an existing account into the admin, and it takes anything made before accounts"""
        with self._connect() as db:
            db.execute("update users set is_admin = 1 where id = ?", (user_id,))
            self._claim_unowned(db, user_id)
        return self.get_user(user_id)

    def _claim_unowned(self, db, user_id: str) -> None:
        for table in owned_tables:
            db.execute(f"update {table} set user_id = ? where user_id is null", (user_id,))
        db.execute(
            "insert or ignore into suggestions (user_id, items, signature, created) "
            "select ?, items, signature, created from recommendations where id = 1",
            (user_id,),
        )

    def get_user(self, user_id: str) -> dict | None:
        with self._connect() as db:
            return self._user(db.execute("select * from users where id = ?", (user_id,)).fetchone())

    def find_user(self, login: str) -> dict | None:
        # by username with its exact capitals, or by email in any case
        with self._connect() as db:
            row = db.execute("select * from users where username = ? or email = ?", (login, login.lower())).fetchone()
        return self._user(row)

    def find_user_by(self, field: str, value: str) -> dict | None:
        assert field in ("google_sub", "apple_sub", "email", "username")
        with self._connect() as db:
            return self._user(db.execute(f"select * from users where {field} = ?", (value,)).fetchone())

    def taken(self, field: str, value: str, besides: str | None = None) -> bool:
        assert field in ("username", "email")
        with self._connect() as db:
            # two usernames that differ only in capitals would be easy to mix up, so they count as the same here
            row = db.execute(f"select id from users where lower({field}) = lower(?) and id != ?", (value, besides or "")).fetchone()
        return row is not None

    def update_user(self, user_id: str, **fields) -> dict | None:
        allowed = ("username", "email", "password", "name", "google_sub", "apple_sub", "is_admin", "daily_cap", "disabled", "settings")
        fields = {k: v for k, v in fields.items() if k in allowed}
        if "settings" in fields:
            fields["settings"] = json.dumps(fields["settings"])
        for flag in ("is_admin", "disabled"):
            if flag in fields:
                fields[flag] = int(bool(fields[flag]))
        if fields:
            with self._connect() as db:
                db.execute(f"update users set {', '.join(f'{k} = ?' for k in fields)} where id = ?", (*fields.values(), user_id))
        return self.get_user(user_id)

    def list_users(self) -> list[dict]:
        with self._connect() as db:
            rows = db.execute("select * from users order by created").fetchall()
        return [self._user(r) for r in rows]

    def count_users(self) -> int:
        with self._connect() as db:
            return db.execute("select count(*) from users").fetchone()[0]

    def user_file_ids(self, user_id: str) -> list[str]:
        # every file the student keeps with claude, from their notes library and their chats
        with self._connect() as db:
            rows = db.execute(
                "select id from notes where user_id = ? union "
                "select f.id from files f join conversations c on c.id = f.conversation_id where c.user_id = ?",
                (user_id, user_id),
            ).fetchall()
        return [r[0] for r in rows]

    def delete_user(self, user_id: str) -> None:
        # owned rows go first, then the account, and their chats, sets and progress go with them
        with self._connect() as db:
            for table in owned_tables:
                db.execute(f"delete from {table} where user_id = ?", (user_id,))
            db.execute("delete from users where id = ?", (user_id,))

    def user_cost_since(self, user_id: str, start: float) -> float:
        with self._connect() as db:
            row = db.execute("select coalesce(sum(cost), 0) from usage where user_id = ? and created >= ?", (user_id, start)).fetchone()
        return row[0]

    def student_cost_since(self, start: float) -> float:
        # what every student together has spent, the admin's own use isn't counted
        with self._connect() as db:
            row = db.execute(
                "select coalesce(sum(u.cost), 0) from usage u join users s on s.id = u.user_id "
                "where u.created >= ? and s.is_admin = 0",
                (start,),
            ).fetchone()
        return row[0]

    def cost_by_user(self, start: float) -> dict[str, float]:
        with self._connect() as db:
            rows = db.execute(
                "select user_id, coalesce(sum(cost), 0) as cost from usage where created >= ? group by user_id", (start,),
            ).fetchall()
        return {r["user_id"]: r["cost"] for r in rows}

    # sessions, only a hash of each token is kept, so a copy of the database can't sign anyone in

    def new_session(self, user_id: str) -> str:
        from .accounts import new_token
        token = new_token()
        now = time.time()
        with self._connect() as db:
            db.execute(
                "insert into sessions (token, user_id, created, expires) values (?, ?, ?, ?)",
                (token_hash(token), user_id, now, now + session_days * 86400),
            )
            # expired sessions are cleared out now and then
            db.execute("delete from sessions where expires < ?", (now,))
        return token

    def session_user(self, token: str) -> dict | None:
        now = time.time()
        with self._connect() as db:
            row = db.execute(
                "select u.* from sessions s join users u on u.id = s.user_id where s.token = ? and s.expires > ?",
                (token_hash(token), now),
            ).fetchone()
            # last seen moves at most once a minute, so most requests don't write
            if row and (row["last_seen"] or 0) < now - 60:
                db.execute("update users set last_seen = ? where id = ?", (now, row["id"]))
        return self._user(row)

    def end_session(self, token: str) -> None:
        with self._connect() as db:
            db.execute("delete from sessions where token = ?", (token_hash(token),))

    # keys rahah makes for itself once, like the one that signs phone notifications

    def get_key(self, name: str) -> str | None:
        with self._connect() as db:
            row = db.execute("select value from app_keys where name = ?", (name,)).fetchone()
        return row[0] if row else None

    def set_key(self, name: str, value: str) -> None:
        with self._connect() as db:
            db.execute("insert or replace into app_keys (name, value) values (?, ?)", (name, value))

    # phones and browsers that get notifications, and which reminder days were already sent

    def add_push(self, user_id: str, endpoint: str, p256dh: str, auth: str, zone: str) -> None:
        # a phone belongs to whoever turned notifications on last
        with self._connect() as db:
            db.execute(
                "insert or replace into push_subs (endpoint, user_id, p256dh, auth, zone, created) values (?, ?, ?, ?, ?, ?)",
                (endpoint, user_id, p256dh, auth, zone, time.time()),
            )

    def remove_push(self, endpoint: str, user_id: str | None = None) -> None:
        with self._connect() as db:
            if user_id:
                db.execute("delete from push_subs where endpoint = ? and user_id = ?", (endpoint, user_id))
            else:
                db.execute("delete from push_subs where endpoint = ?", (endpoint,))

    def count_pushes(self, user_id: str) -> int:
        with self._connect() as db:
            return db.execute("select count(*) from push_subs where user_id = ?", (user_id,)).fetchone()[0]

    def pushes_by_user(self) -> dict[str, list[dict]]:
        with self._connect() as db:
            rows = db.execute("select * from push_subs order by created").fetchall()
        grouped: dict[str, list[dict]] = {}
        for row in rows:
            grouped.setdefault(row["user_id"], []).append(dict(row))
        return grouped

    def mark_pushed(self, reminder_id: str, day: str) -> bool:
        # true the first time a reminder day is marked, so each one is only sent once
        with self._connect() as db:
            return db.execute("insert or ignore into push_sent (reminder_id, day) values (?, ?)", (reminder_id, day)).rowcount == 1

    def calendar_token(self, user_id: str, fresh: bool = False) -> str:
        # the secret in a student's calendar feed address, a fresh one stops the old address working
        with self._connect() as db:
            row = db.execute("select calendar_token from users where id = ?", (user_id,)).fetchone()
            if row and row[0] and not fresh:
                return row[0]
            token = new_token()
            db.execute("update users set calendar_token = ? where id = ?", (token, user_id))
            return token

    def user_by_calendar(self, token: str) -> dict | None:
        with self._connect() as db:
            return self._user(db.execute("select * from users where calendar_token = ?", (token,)).fetchone())

    def add_reset(self, user_id: str, token: str, expires: float) -> None:
        # only the newest link works, asking again cancels the one before
        with self._connect() as db:
            db.execute("delete from password_resets where user_id = ? or expires < ?", (user_id, time.time()))
            db.execute("insert into password_resets (token, user_id, expires) values (?, ?, ?)", (token_hash(token), user_id, expires))

    def take_reset(self, token: str) -> str | None:
        # a link works once, before it runs out, and gives back whose it was
        key = token_hash(token)
        with self._connect() as db:
            row = db.execute(
                "select user_id from password_resets where token = ? and used = 0 and expires > ?", (key, time.time())
            ).fetchone()
            if not row:
                return None
            # marking it used only counts if nobody else used it a moment before
            if db.execute("update password_resets set used = 1 where token = ? and used = 0", (key,)).rowcount != 1:
                return None
        return row[0]

    def end_sessions(self, user_id: str, keep: str | None = None) -> None:
        # signs the account out everywhere, except the session keep if given
        with self._connect() as db:
            db.execute("delete from sessions where user_id = ? and token != ?", (user_id, token_hash(keep) if keep else ""))

    # conversations

    def new_conversation(self, uid: str, mode: str) -> str:
        conversation_id = uuid.uuid4().hex
        now = time.time()
        with self._connect() as db:
            db.execute(
                "insert into conversations (id, mode, created, updated, user_id) values (?, ?, ?, ?, ?)",
                (conversation_id, mode, now, now, uid),
            )
        return conversation_id

    def get_conversation(self, uid: str, conversation_id: str) -> dict | None:
        with self._connect() as db:
            row = db.execute("select * from conversations where id = ? and user_id = ?", (conversation_id, uid)).fetchone()
        return _without_owner(row)

    # only the newest chats are listed, older ones stay saved but aren't sent to the page
    def list_conversations(self, uid: str, limit: int = 10) -> list[dict]:
        with self._connect() as db:
            rows = db.execute(
                "select id, title, mode, updated from conversations "
                "where user_id = ? and title != '' order by updated desc limit ?",
                (uid, limit),
            ).fetchall()
        return [dict(r) for r in rows]

    def search_chats(self, uid: str, words: str, limit: int = 20) -> list[dict]:
        """chats whose title or messages contain the words, newest first, each with a snippet around the match"""
        # ! marks a percent or underscore the student typed, so they're searched for as themselves
        like = "%" + words.replace("!", "!!").replace("%", "!%").replace("_", "!_") + "%"
        with self._connect() as db:
            rows = db.execute(
                "select c.id, c.title, c.mode, c.updated, "
                "(select m.display from messages m where m.conversation_id = c.id and m.display like ? escape '!' "
                "order by m.id limit 1) as hit "
                "from conversations c where c.user_id = ? and c.title != '' and (c.title like ? escape '!' or exists ("
                "select 1 from messages m where m.conversation_id = c.id and m.display like ? escape '!')) "
                "order by c.updated desc limit ?",
                (like, uid, like, like, limit),
            ).fetchall()
        found = []
        for r in rows:
            text = json.loads(r["hit"])["text"] if r["hit"] else r["title"]
            at = text.lower().find(words.lower())
            start = max(0, at - 50) if at >= 0 else 0
            snippet = ("…" if start else "") + " ".join(text[start:start + 140].split()) + ("…" if len(text) > start + 140 else "")
            found.append({"id": r["id"], "title": r["title"], "mode": r["mode"], "updated": r["updated"], "snippet": snippet})
        return found

    def delete_conversation(self, uid: str, conversation_id: str) -> None:
        with self._connect() as db:
            db.execute("delete from conversations where id = ? and user_id = ?", (conversation_id, uid))

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
                "select m.id, m.role, m.display, f.rating from messages m left join feedback f on f.message_id = m.id "
                "where m.conversation_id = ? and m.display is not null order by m.id",
                (conversation_id,),
            ).fetchall()
        return [{"role": r["role"], "id": r["id"], "rating": r["rating"] or 0, **json.loads(r["display"])} for r in rows]

    # thumbs up or down on an answer, 1 or -1, and 0 clears it, only on the student's own chats
    def rate_message(self, uid: str, message_id: int, rating: int) -> bool:
        with self._connect() as db:
            row = db.execute(
                "select m.role from messages m join conversations c on c.id = m.conversation_id "
                "where m.id = ? and c.user_id = ?",
                (message_id, uid),
            ).fetchone()
            if not row or row["role"] != "assistant":
                return False
            if rating:
                db.execute(
                    "insert into feedback (message_id, rating, created) values (?, ?, ?) "
                    "on conflict(message_id) do update set rating = excluded.rating, created = excluded.created",
                    (message_id, rating, time.time()),
                )
            else:
                db.execute("delete from feedback where message_id = ?", (message_id,))
        return True

    def feedback_summary(self, uid: str | None, recent: int = 8) -> dict:
        """the totals, and the latest answers marked unhelpful with the question each one answered
        uid None covers every student, for the admin"""
        mine = "" if uid is None else " and c.user_id = ?"
        args = () if uid is None else (uid,)
        with self._connect() as db:
            totals = {r["rating"]: r["n"] for r in db.execute(
                "select f.rating, count(*) as n from feedback f join messages m on m.id = f.message_id "
                f"join conversations c on c.id = m.conversation_id where 1 = 1{mine} group by f.rating",
                args,
            )}
            down = db.execute(
                "select m.id, m.conversation_id, m.display, f.created, "
                "(select q.display from messages q where q.conversation_id = m.conversation_id and q.role = 'user' "
                "and q.id < m.id order by q.id desc limit 1) as question "
                "from feedback f join messages m on m.id = f.message_id join conversations c on c.id = m.conversation_id "
                f"where f.rating = -1{mine} order by f.created desc limit ?",
                (*args, recent),
            ).fetchall()
        return {
            "up": totals.get(1, 0),
            "down": totals.get(-1, 0),
            "unhelpful": [{
                "conversation_id": r["conversation_id"],
                "question": json.loads(r["question"])["text"][:200] if r["question"] else "",
                "answer": json.loads(r["display"])["text"][:300],
                "created": r["created"],
            } for r in down],
        }

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

    def add_turn(self, conversation_id: str, rows: list[dict], mode: str, title: str) -> int | None:
        # rows are written together so a failed turn never leaves half a history
        last_id = None
        with self._connect() as db:
            for row in rows:
                display = row.get("display")
                cursor = db.execute(
                    "insert into messages (conversation_id, role, content, display) values (?, ?, ?, ?)",
                    (
                        conversation_id,
                        row["role"],
                        json.dumps(row["content"]),
                        json.dumps(display) if display is not None else None,
                    ),
                )
                if row["role"] == "assistant":
                    last_id = cursor.lastrowid
            db.execute(
                "update conversations set mode = ?, updated = ?, "
                "title = case when title = '' then ? else title end where id = ?",
                (mode, time.time(), title, conversation_id),
            )
            file_ids = [f for row in rows for f in row.get("file_ids", [])]
            db.executemany("update files set used = 1 where id = ?", [(f,) for f in file_ids])
        return last_id

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

    def get_output(self, uid: str, file_id: str) -> dict | None:
        with self._connect() as db:
            row = db.execute(
                "select o.* from outputs o join conversations c on c.id = o.conversation_id where o.id = ? and c.user_id = ?",
                (file_id, uid),
            ).fetchone()
        return dict(row) if row else None

    # reminders for exams, assignments and other events
    # seen holds the dates a reminder was already shown on, so it isn't shown twice in a day

    def _reminder(self, row) -> dict:
        reminder = {**dict(row), "done": bool(row["done"]), "seen": json.loads(row["seen"])}
        reminder["plan"] = json.loads(row["plan"]) if row["plan"] else None
        reminder.pop("user_id", None)
        return reminder

    # a revision plan, the days and whether each one is done
    def save_plan(self, uid: str, reminder_id: str, plan: dict | None) -> None:
        with self._connect() as db:
            db.execute(
                "update reminders set plan = ? where id = ? and user_id = ?",
                (json.dumps(plan) if plan else "", reminder_id, uid),
            )

    def list_reminders(self, uid: str) -> list[dict]:
        with self._connect() as db:
            rows = db.execute("select * from reminders where user_id = ? order by due_date, due_time, created", (uid,)).fetchall()
        return [self._reminder(r) for r in rows]

    def get_reminder(self, uid: str, reminder_id: str) -> dict | None:
        with self._connect() as db:
            row = db.execute("select * from reminders where id = ? and user_id = ?", (reminder_id, uid)).fetchone()
        return self._reminder(row) if row else None

    def save_reminder(self, uid: str, fields: dict, reminder_id: str | None = None) -> str:
        now = time.time()
        columns = ("kind", "title", "mode", "due_date", "due_time", "every_days", "lead_days", "notes")
        values = [fields[c] for c in columns]
        with self._connect() as db:
            if reminder_id:
                db.execute(
                    f"update reminders set {', '.join(f'{c} = ?' for c in columns)}, updated = ? where id = ? and user_id = ?",
                    (*values, now, reminder_id, uid),
                )
                return reminder_id
            reminder_id = uuid.uuid4().hex
            db.execute(
                f"insert into reminders (id, {', '.join(columns)}, created, updated, user_id) "
                f"values (?, {', '.join('?' for _ in columns)}, ?, ?, ?)",
                (reminder_id, *values, now, now, uid),
            )
        return reminder_id

    def set_reminder_done(self, uid: str, reminder_id: str, done: bool) -> None:
        with self._connect() as db:
            db.execute(
                "update reminders set done = ?, updated = ? where id = ? and user_id = ?",
                (int(done), time.time(), reminder_id, uid),
            )

    def mark_reminder_seen(self, uid: str, reminder_id: str, day: str) -> list[str]:
        with self._connect() as db:
            row = db.execute("select seen from reminders where id = ? and user_id = ?", (reminder_id, uid)).fetchone()
            seen = json.loads(row["seen"])
            if day not in seen:
                # only the last few dates matter, the list never grows past the reminders themselves
                seen = (seen + [day])[-60:]
                db.execute("update reminders set seen = ? where id = ?", (json.dumps(seen), reminder_id))
        return seen

    def delete_reminder(self, uid: str, reminder_id: str) -> None:
        with self._connect() as db:
            db.execute("delete from reminders where id = ? and user_id = ?", (reminder_id, uid))

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

    # what each request to claude used and cost, and who asked for it

    def add_usage(self, uid: str | None, kind: str, use: dict, cost: float | None) -> None:
        with self._connect() as db:
            db.execute(
                "insert into usage (kind, model, input_tokens, output_tokens, cache_read, cache_write, searches, cost, created, user_id) "
                "values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (kind, use["model"], use["input_tokens"], use["output_tokens"], use["cache_read"], use["cache_write"],
                 use["searches"], cost, time.time(), uid),
            )

    def usage_since(self, start: float, uid: str | None = None) -> list[dict]:
        # uid None is everyone's, for the admin
        with self._connect() as db:
            if uid is None:
                rows = db.execute("select * from usage where created >= ? order by created", (start,)).fetchall()
            else:
                rows = db.execute("select * from usage where created >= ? and user_id = ? order by created", (start, uid)).fetchall()
        return [dict(r) for r in rows]

    # subjects students added themselves

    def list_subjects(self, uid: str | None = None) -> list[dict]:
        # uid None lists every student's, which is what the server keeps in its subject list
        with self._connect() as db:
            if uid is None:
                rows = db.execute("select id, name, user_id from subjects order by created").fetchall()
            else:
                rows = db.execute("select id, name, user_id from subjects where user_id = ? order by created", (uid,)).fetchall()
        return [dict(r) for r in rows]

    def add_subject(self, uid: str, name: str) -> str:
        subject_id = "my-" + uuid.uuid4().hex[:10]
        with self._connect() as db:
            db.execute("insert into subjects (id, name, created, user_id) values (?, ?, ?, ?)", (subject_id, name, time.time(), uid))
        return subject_id

    def delete_subject(self, uid: str, subject_id: str) -> None:
        # anything filed under it moves back to general study, which reminders and classes store as blank
        with self._connect() as db:
            db.execute("delete from subjects where id = ? and user_id = ?", (subject_id, uid))
            db.execute("update conversations set mode = 'general' where mode = ? and user_id = ?", (subject_id, uid))
            db.execute("update study_sets set mode = 'general' where mode = ? and user_id = ?", (subject_id, uid))
            db.execute("update reminders set mode = '' where mode = ? and user_id = ?", (subject_id, uid))
            db.execute("update classes set mode = '' where mode = ? and user_id = ?", (subject_id, uid))
            db.execute("update notes set mode = 'general' where mode = ? and user_id = ?", (subject_id, uid))

    # the notes library, files kept with claude once and used again in any chat or set

    def add_note(self, uid: str, note_id: str, mode: str, name: str, kind: str, media_type: str, size: int) -> dict:
        with self._connect() as db:
            db.execute(
                "insert into notes (id, mode, name, kind, media_type, size, created, user_id) values (?, ?, ?, ?, ?, ?, ?, ?)",
                (note_id, mode, name, kind, media_type, size, time.time(), uid),
            )
        return self.get_note(uid, note_id)

    def get_note(self, uid: str, note_id: str) -> dict | None:
        with self._connect() as db:
            row = db.execute("select * from notes where id = ? and user_id = ?", (note_id, uid)).fetchone()
        return _without_owner(row)

    def list_notes(self, uid: str) -> list[dict]:
        with self._connect() as db:
            return [_without_owner(r) for r in db.execute("select * from notes where user_id = ? order by created desc", (uid,))]

    def count_notes(self, uid: str) -> int:
        with self._connect() as db:
            return db.execute("select count(*) from notes where user_id = ?", (uid,)).fetchone()[0]

    def note_files(self, uid: str, note_ids: list[str]) -> list[stored_file]:
        # notes in the same shape as chat files, so they go to claude the same way, in the order picked
        by_id = {n["id"]: n for n in self.list_notes(uid)}
        return [
            stored_file(id=n["id"], conversation_id="", name=n["name"], kind=n["kind"],
                        media_type=n["media_type"], size=n["size"], used=False)
            for i in dict.fromkeys(note_ids)
            if (n := by_id.get(i))
        ]

    def file_in_history(self, file_id: str) -> bool:
        with self._connect() as db:
            return db.execute("select 1 from messages where content like ? limit 1", (f'%"{file_id}"%',)).fetchone() is not None

    def delete_note(self, uid: str, note_id: str) -> bool:
        with self._connect() as db:
            return db.execute("delete from notes where id = ? and user_id = ?", (note_id, uid)).rowcount > 0

    # the weekly timetable, in order through the week

    def list_classes(self, uid: str) -> list[dict]:
        with self._connect() as db:
            rows = db.execute("select * from classes where user_id = ? order by day, start_time, created", (uid,)).fetchall()
        return [_without_owner(r) for r in rows]

    def get_class(self, uid: str, class_id: str) -> dict | None:
        with self._connect() as db:
            row = db.execute("select * from classes where id = ? and user_id = ?", (class_id, uid)).fetchone()
        return _without_owner(row)

    def save_class(self, uid: str, fields: dict, class_id: str | None = None) -> str:
        now = time.time()
        columns = ("title", "mode", "day", "start_time", "end_time", "place")
        values = [fields[c] for c in columns]
        with self._connect() as db:
            if class_id:
                db.execute(
                    f"update classes set {', '.join(f'{c} = ?' for c in columns)}, updated = ? where id = ? and user_id = ?",
                    (*values, now, class_id, uid),
                )
                return class_id
            class_id = uuid.uuid4().hex
            db.execute(
                f"insert into classes (id, {', '.join(columns)}, created, updated, user_id) "
                f"values (?, {', '.join('?' for _ in columns)}, ?, ?, ?)",
                (class_id, *values, now, now, uid),
            )
        return class_id

    def delete_class(self, uid: str, class_id: str) -> None:
        with self._connect() as db:
            db.execute("delete from classes where id = ? and user_id = ?", (class_id, uid))

    # suggestions, only each student's latest batch is kept

    def get_recommendations(self, uid: str) -> dict | None:
        with self._connect() as db:
            row = db.execute("select items, signature, created from suggestions where user_id = ?", (uid,)).fetchone()
        if not row:
            return None
        return {"items": json.loads(row["items"]), "signature": row["signature"], "created": row["created"]}

    def save_recommendations(self, uid: str, items: list[dict], signature: str) -> float:
        now = time.time()
        with self._connect() as db:
            db.execute(
                "insert into suggestions (user_id, items, signature, created) values (?, ?, ?, ?) "
                "on conflict(user_id) do update set items = excluded.items, signature = excluded.signature, "
                "created = excluded.created",
                (uid, json.dumps(items), signature, now),
            )
        return now

    # study sets, flashcard decks and quizzes

    def add_set(self, uid: str, kind: str, title: str, mode: str, items: list[dict]) -> str:
        set_id = uuid.uuid4().hex
        now = time.time()
        with self._connect() as db:
            db.execute(
                "insert into study_sets (id, kind, title, mode, items, size, created, updated, user_id) "
                "values (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (set_id, kind, title, mode, json.dumps(items), len(items), now, now, uid),
            )
        return set_id

    def list_sets(self, uid: str, limit: int = 50) -> list[dict]:
        with self._connect() as db:
            rows = db.execute(
                "select id, kind, title, mode, size, best_score, updated, items from study_sets "
                "where user_id = ? order by updated desc limit ?",
                (uid, limit),
            ).fetchall()
            known = {r["set_id"]: r["n"] for r in db.execute(
                "select p.set_id, count(*) as n from card_progress p join study_sets s on s.id = p.set_id "
                "where p.box >= 2 and s.user_id = ? group by p.set_id",
                (uid,),
            ).fetchall()}
        # tests are scored in marks, which can be more than the number of questions once some are written
        sets = []
        for r in rows:
            row = dict(r)
            row["known"] = known.get(row["id"], 0)
            items = json.loads(row.pop("items"))
            row["marks"] = sum(i["marks"] if i.get("type") == "written" else 1 for i in items)
            row["written"] = any(i.get("type") == "written" for i in items)
            sets.append(row)
        return sets

    def share_set(self, uid: str, set_id: str) -> str | None:
        # the set's share link, made the first time it's shared
        with self._connect() as db:
            row = db.execute("select share_token from study_sets where id = ? and user_id = ?", (set_id, uid)).fetchone()
            if not row:
                return None
            if row[0]:
                return row[0]
            token = new_token()
            db.execute("update study_sets set share_token = ? where id = ?", (token, set_id))
            return token

    def stop_sharing(self, uid: str, set_id: str) -> bool:
        with self._connect() as db:
            return db.execute("update study_sets set share_token = null where id = ? and user_id = ?", (set_id, uid)).rowcount == 1

    def shared_set(self, token: str) -> dict | None:
        # a shared set with who shared it, found by its link
        with self._connect() as db:
            row = db.execute(
                "select s.*, u.username as owner_username, u.name as owner_name, u.disabled as owner_disabled "
                "from study_sets s join users u on u.id = s.user_id where s.share_token = ?",
                (token,),
            ).fetchone()
        if not row or row["owner_disabled"]:
            return None
        found = dict(row)
        found["items"] = json.loads(found["items"])
        return found

    def get_set(self, uid: str, set_id: str) -> dict | None:
        with self._connect() as db:
            row = db.execute("select * from study_sets where id = ? and user_id = ?", (set_id, uid)).fetchone()
            boxes = db.execute("select card, box from card_progress where set_id = ?", (set_id,)).fetchall() if row else []
        if not row:
            return None
        study_set = _without_owner(row)
        return {**study_set, "items": json.loads(row["items"]), "progress": {str(b["card"]): b["box"] for b in boxes}}

    # flashcards move up a box each time they're known and back to the first box when they aren't,
    # a card counts as known while it's in box 2 or higher. the server checks the deck is the student's first
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

    # cards come due again after 1, 2, 4, 8 or 16 days, the higher the box the longer the gap
    review_days = {1: 1, 2: 2, 3: 4, 4: 8, 5: 16}

    def due_cards(self, uid: str, now: float | None = None) -> list[dict]:
        """each deck with cards due for practice, most due first"""
        now = now or time.time()
        with self._connect() as db:
            rows = db.execute(
                "select p.set_id, p.box, p.updated, s.title from card_progress p join study_sets s on s.id = p.set_id "
                "where s.user_id = ?",
                (uid,),
            ).fetchall()
        decks: dict[str, dict] = {}
        for r in rows:
            if now - r["updated"] >= self.review_days.get(r["box"], 1) * 86400 - 3600:
                deck = decks.setdefault(r["set_id"], {"id": r["set_id"], "title": r["title"], "due": 0})
                deck["due"] += 1
        return sorted(decks.values(), key=lambda d: -d["due"])

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

    def quiz_attempts(self, uid: str) -> list[dict]:
        # oldest first, with the quiz each attempt belongs to
        with self._connect() as db:
            rows = db.execute(
                "select a.set_id, s.title, s.mode, a.score, a.total, a.created "
                "from quiz_attempts a join study_sets s on s.id = a.set_id where s.user_id = ? order by a.created, a.id",
                (uid,),
            ).fetchall()
        return [dict(r) for r in rows]

    def card_activity(self, uid: str, since: float) -> list[dict]:
        # cards rated since then, each once at its latest rating, with its box and subject
        with self._connect() as db:
            rows = db.execute(
                "select c.box, c.updated, s.mode from card_progress c join study_sets s on s.id = c.set_id "
                "where s.user_id = ? and c.updated >= ?",
                (uid, since),
            ).fetchall()
        return [dict(r) for r in rows]

    def question_times(self, uid: str, since: float) -> list[float]:
        # when each chat answer was asked for, from the usage log
        with self._connect() as db:
            rows = db.execute(
                "select created from usage where kind = 'chat' and user_id = ? and created >= ?", (uid, since),
            ).fetchall()
        return [r["created"] for r in rows]

    def delete_set(self, uid: str, set_id: str) -> None:
        with self._connect() as db:
            db.execute("delete from study_sets where id = ? and user_id = ?", (set_id, uid))


def _without_owner(row) -> dict | None:
    # the owner's id stays on the server
    if not row:
        return None
    found = dict(row)
    found.pop("user_id", None)
    return found
