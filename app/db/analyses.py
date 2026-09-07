"""cv_analyses table: the "My Checks" history (one row per full CV-vs-JD
analysis, with roadmap items merged in as they're generated)."""

import json

from app import db


def save_analysis(telegram_id: int, jd_text: str, ats: dict, xyz: dict, tools: dict, level: dict) -> int:
    """Written immediately after a successful /api/cv-jd-analysis call,
    before the user even starts the roadmap - the analysis itself is
    already worth keeping even if they never touch the roadmap steps."""
    pool = db.get_pool()
    conn = pool.getconn()
    try:
        with conn, conn.cursor() as cur:
            cur.execute("""
                INSERT INTO cv_analyses (telegram_id, jd_text, ats, xyz, tools, level)
                VALUES (%s, %s, %s, %s, %s, %s)
                RETURNING id
            """, (telegram_id, jd_text, json.dumps(ats), json.dumps(xyz), json.dumps(tools), json.dumps(level)))
            return cur.fetchone()[0]
    finally:
        pool.putconn(conn)


def save_roadmap_item(telegram_id: int, analysis_id: int, item: int, title: str, body: dict) -> bool:
    """Merges one roadmap step's result into roadmap_items, keyed by item
    number. Returns False if analysis_id doesn't exist/isn't owned by this
    telegram_id - callers should treat a save failure here as best-effort,
    same as CV position extraction: don't fail the roadmap-item request
    itself just because history-saving failed."""
    pool = db.get_pool()
    conn = pool.getconn()
    try:
        with conn, conn.cursor() as cur:
            cur.execute("""
                UPDATE cv_analyses
                SET roadmap_items = roadmap_items || jsonb_build_object(%s, %s::jsonb)
                WHERE id = %s AND telegram_id = %s
            """, (str(item), json.dumps({"title": title, **body}), analysis_id, telegram_id))
            return cur.rowcount > 0
    finally:
        pool.putconn(conn)


def list_analyses(telegram_id: int) -> list[dict]:
    pool = db.get_pool()
    conn = pool.getconn()
    try:
        with conn, conn.cursor() as cur:
            cur.execute("""
                SELECT id, jd_text, level, created_at
                FROM cv_analyses WHERE telegram_id = %s ORDER BY created_at DESC
            """, (telegram_id,))
            rows = cur.fetchall()
        return [
            {"id": r[0], "jd_text": r[1], "level": r[2], "created_at": r[3].isoformat()}
            for r in rows
        ]
    finally:
        pool.putconn(conn)


def get_analysis(telegram_id: int, analysis_id: int) -> dict | None:
    """Returns None if not found/not owned - callers must treat that as
    "not found", never leak whether some other user's analysis_id exists."""
    pool = db.get_pool()
    conn = pool.getconn()
    try:
        with conn, conn.cursor() as cur:
            cur.execute("""
                SELECT id, jd_text, ats, xyz, tools, level, roadmap_items, created_at
                FROM cv_analyses WHERE id = %s AND telegram_id = %s
            """, (analysis_id, telegram_id))
            row = cur.fetchone()
            if not row:
                return None
            return {
                "id": row[0], "jd_text": row[1], "ats": row[2], "xyz": row[3],
                "tools": row[4], "level": row[5], "roadmap_items": row[6],
                "created_at": row[7].isoformat(),
            }
    finally:
        pool.putconn(conn)


def delete_analysis(telegram_id: int, analysis_id: int) -> bool:
    pool = db.get_pool()
    conn = pool.getconn()
    try:
        with conn, conn.cursor() as cur:
            cur.execute("DELETE FROM cv_analyses WHERE id = %s AND telegram_id = %s", (analysis_id, telegram_id))
            return cur.rowcount > 0
    finally:
        pool.putconn(conn)
