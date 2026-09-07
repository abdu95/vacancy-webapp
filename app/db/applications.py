"""applications table: the vacancy-tracking Kanban (applied -> ... -> offer/rejected/ghosted)."""

import json

from app import db

VALID_STATUSES = {"applied", "phone_screen", "tech_interview", "offer", "rejected", "ghosted"}


def save_application(telegram_id: int, vacancy: dict, cv_snapshot: str,
                      score: dict | None, source: str = "webapp") -> None:
    pool = db.get_pool()
    conn = pool.getconn()
    try:
        with conn, conn.cursor() as cur:
            cur.execute("""
                INSERT INTO applications (
                    telegram_id, vacancy_title, vacancy_company, vacancy_location,
                    vacancy_url, vacancy_summary, cv_snapshot, match_score,
                    matched_keywords, missing_keywords, source
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """, (
                telegram_id, vacancy["title"], vacancy["company"], vacancy.get("location"),
                vacancy.get("url"), vacancy.get("summary"), cv_snapshot,
                score.get("score") if score else None,
                json.dumps(score.get("matched")) if score else None,
                json.dumps(score.get("missing")) if score else None,
                source,
            ))
    finally:
        pool.putconn(conn)


def update_application_status(telegram_id: int, application_id: int, status: str) -> bool:
    """Returns False if the application doesn't exist or doesn't belong to
    this telegram_id - callers must treat that as "not found", never
    leak whether some other user's application_id exists."""
    if status not in VALID_STATUSES:
        raise ValueError(f"Invalid status: {status}")
    pool = db.get_pool()
    conn = pool.getconn()
    try:
        with conn, conn.cursor() as cur:
            cur.execute("""
                UPDATE applications SET status = %s, updated_at = now()
                WHERE id = %s AND telegram_id = %s
            """, (status, application_id, telegram_id))
            return cur.rowcount > 0
    finally:
        pool.putconn(conn)


def delete_application(telegram_id: int, application_id: int) -> bool:
    pool = db.get_pool()
    conn = pool.getconn()
    try:
        with conn, conn.cursor() as cur:
            cur.execute("""
                DELETE FROM applications WHERE id = %s AND telegram_id = %s
            """, (application_id, telegram_id))
            return cur.rowcount > 0
    finally:
        pool.putconn(conn)


def list_applications(telegram_id: int) -> list[dict]:
    pool = db.get_pool()
    conn = pool.getconn()
    try:
        with conn, conn.cursor() as cur:
            cur.execute("""
                SELECT id, vacancy_title, vacancy_company, vacancy_location, vacancy_url,
                       match_score, status, created_at
                FROM applications
                WHERE telegram_id = %s
                ORDER BY created_at DESC
            """, (telegram_id,))
            rows = cur.fetchall()
        return [
            {
                "id": r[0], "title": r[1], "company": r[2], "location": r[3],
                "url": r[4], "match_score": r[5], "status": r[6],
                "created_at": r[7].isoformat(),
            }
            for r in rows
        ]
    finally:
        pool.putconn(conn)
