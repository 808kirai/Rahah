import sqlite3

from app.store import store


def test_a_long_read_does_not_lock_out_writes(tmp_path):
    db = store(tmp_path / "rahah.db")
    with db._connect() as conn:
        assert conn.execute("pragma journal_mode").fetchone()[0] == "wal"
    # a read left open, like the daily backup copying the file
    reader = sqlite3.connect(db.db_path)
    reader.execute("select * from sqlite_master").fetchone()
    try:
        writer = sqlite3.connect(db.db_path, timeout=1)
        writer.execute("create table probe (x)")
        writer.commit()
        writer.close()
    finally:
        reader.close()
