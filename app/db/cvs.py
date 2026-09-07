"""cvs table: one row per uploaded CV, exactly one is_active per user."""

from app import db


def get_active_cv_text(telegram_id: int) -> str | None:
    """The CV every analysis/vacancy/application feature actually reads -
    whichever one is_active in `cvs`. Switching the active CV (or
    uploading a new one, which becomes active automatically) changes
    what every other feature sees with no changes needed there."""
    pool = db.get_pool()
    conn = pool.getconn()
    try:
        with conn, conn.cursor() as cur:
            cur.execute("SELECT cv_text FROM cvs WHERE telegram_id = %s AND is_active = true", (telegram_id,))
            row = cur.fetchone()
            return row[0] if row else None
    finally:
        pool.putconn(conn)


def list_cvs(telegram_id: int) -> list[dict]:
    pool = db.get_pool()
    conn = pool.getconn()
    try:
        with conn, conn.cursor() as cur:
            cur.execute("""
                SELECT id, label, is_active, extracted_position, created_at
                FROM cvs WHERE telegram_id = %s ORDER BY created_at DESC
            """, (telegram_id,))
            rows = cur.fetchall()
        return [
            {
                "id": r[0], "label": r[1], "is_active": r[2],
                "extracted_position": r[3], "created_at": r[4].isoformat(),
            }
            for r in rows
        ]
    finally:
        pool.putconn(conn)


def add_cv(telegram_id: int, label: str, cv_text: str, extracted_position: str | None = None) -> int:
    """Adds a new CV and makes it the active one - matches the existing
    upload behavior (uploading becomes what the rest of the app uses
    immediately), while past CVs stay in the list to switch back to."""
    pool = db.get_pool()
    conn = pool.getconn()
    try:
        with conn, conn.cursor() as cur:
            cur.execute(
                "UPDATE cvs SET is_active = false WHERE telegram_id = %s AND is_active = true",
                (telegram_id,),
            )
            cur.execute(
                """
                INSERT INTO cvs (telegram_id, label, cv_text, is_active, extracted_position)
                VALUES (%s, %s, %s, true, %s)
                RETURNING id
                """,
                (telegram_id, label, cv_text, extracted_position),
            )
            return cur.fetchone()[0]
    finally:
        pool.putconn(conn)


def set_active_cv(telegram_id: int, cv_id: int) -> bool:
    """Returns False if cv_id doesn't exist or isn't owned by this
    telegram_id - never leaks whether some other user's cv_id exists."""
    pool = db.get_pool()
    conn = pool.getconn()
    try:
        with conn, conn.cursor() as cur:
            cur.execute("SELECT 1 FROM cvs WHERE id = %s AND telegram_id = %s", (cv_id, telegram_id))
            if not cur.fetchone():
                return False
            cur.execute(
                "UPDATE cvs SET is_active = false WHERE telegram_id = %s AND is_active = true",
                (telegram_id,),
            )
            cur.execute("UPDATE cvs SET is_active = true WHERE id = %s", (cv_id,))
            return True
    finally:
        pool.putconn(conn)


def delete_cv(telegram_id: int, cv_id: int) -> bool:
    """Returns False if not found/not owned. If the deleted CV was the
    active one, auto-promotes the most recently added remaining CV so
    the rest of the app isn't suddenly left with no active CV."""
    pool = db.get_pool()
    conn = pool.getconn()
    try:
        with conn, conn.cursor() as cur:
            cur.execute("SELECT is_active FROM cvs WHERE id = %s AND telegram_id = %s", (cv_id, telegram_id))
            row = cur.fetchone()
            if not row:
                return False
            was_active = row[0]
            cur.execute("DELETE FROM cvs WHERE id = %s", (cv_id,))
            if was_active:
                cur.execute(
                    """
                    UPDATE cvs SET is_active = true WHERE id = (
                        SELECT id FROM cvs WHERE telegram_id = %s ORDER BY created_at DESC LIMIT 1
                    )
                    """,
                    (telegram_id,),
                )
            return True
    finally:
        pool.putconn(conn)
