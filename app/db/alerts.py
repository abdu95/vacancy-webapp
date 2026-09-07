"""Daily vacancy-alerts saved criteria (on the `users` table) and the
alerted_vacancies dedup table the alerts job checks against."""

from app import db


def get_saved_search(telegram_id: int) -> dict:
    pool = db.get_pool()
    conn = pool.getconn()
    try:
        with conn, conn.cursor() as cur:
            cur.execute(
                "SELECT saved_job_title, saved_location, vacancy_alerts_enabled FROM users WHERE telegram_id = %s",
                (telegram_id,),
            )
            row = cur.fetchone()
            if not row:
                return {"job_title": None, "location": None, "alerts_enabled": False}
            return {"job_title": row[0], "location": row[1], "alerts_enabled": row[2]}
    finally:
        pool.putconn(conn)


def save_search_criteria(telegram_id: int, job_title: str, location: str, alerts_enabled: bool) -> None:
    pool = db.get_pool()
    conn = pool.getconn()
    try:
        with conn, conn.cursor() as cur:
            cur.execute("""
                UPDATE users SET saved_job_title = %s, saved_location = %s, vacancy_alerts_enabled = %s
                WHERE telegram_id = %s
            """, (job_title or None, location or None, alerts_enabled, telegram_id))
    finally:
        pool.putconn(conn)


def list_users_with_alerts_enabled() -> list[tuple[int, str, str | None]]:
    """(telegram_id, job_title, location) for every user who has both
    opted in and actually set a job title - the daily alerts job's
    worklist. location may be None/blank, meaning "Any"."""
    pool = db.get_pool()
    conn = pool.getconn()
    try:
        with conn, conn.cursor() as cur:
            cur.execute("""
                SELECT telegram_id, saved_job_title, saved_location
                FROM users
                WHERE vacancy_alerts_enabled = true AND saved_job_title IS NOT NULL AND saved_job_title != ''
            """)
            return cur.fetchall()
    finally:
        pool.putconn(conn)


def filter_new_vacancy_urls(telegram_id: int, urls: list[str]) -> list[str]:
    """Returns the subset of `urls` this user hasn't already been alerted
    about (checked against alerted_vacancies)."""
    if not urls:
        return []
    pool = db.get_pool()
    conn = pool.getconn()
    try:
        with conn, conn.cursor() as cur:
            cur.execute(
                "SELECT vacancy_url FROM alerted_vacancies WHERE telegram_id = %s AND vacancy_url = ANY(%s)",
                (telegram_id, urls),
            )
            already_sent = {r[0] for r in cur.fetchall()}
        return [u for u in urls if u not in already_sent]
    finally:
        pool.putconn(conn)


def mark_vacancies_alerted(telegram_id: int, urls: list[str]) -> None:
    if not urls:
        return
    pool = db.get_pool()
    conn = pool.getconn()
    try:
        with conn, conn.cursor() as cur:
            cur.executemany(
                "INSERT INTO alerted_vacancies (telegram_id, vacancy_url) VALUES (%s, %s) ON CONFLICT DO NOTHING",
                [(telegram_id, u) for u in urls],
            )
    finally:
        pool.putconn(conn)
