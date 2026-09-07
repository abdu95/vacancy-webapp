"""orders table: shared with ae-coach-bot's bot/state.py and read by the
separate payme-webhook service - orders created here must stay
indistinguishable from ones the bot creates."""

from app import db


def get_or_create_order(telegram_id: int, amount: int, package: str) -> int:
    """Same `orders` table and reuse-pending-order logic as
    bot/state.py's get_or_create_order - orders created here are
    indistinguishable to payme-webhook from ones created by the bot."""
    pool = db.get_pool()
    conn = pool.getconn()
    try:
        with conn, conn.cursor() as cur:
            cur.execute("""
                UPDATE orders SET amount = %s
                WHERE id = (
                    SELECT id FROM orders
                    WHERE telegram_id = %s AND package = %s AND state = 'pending'
                    ORDER BY created_at DESC LIMIT 1
                )
                RETURNING id
            """, (amount, telegram_id, package))
            row = cur.fetchone()
            if row:
                return row[0]
            cur.execute("""
                INSERT INTO orders (telegram_id, amount, package)
                VALUES (%s, %s, %s)
                RETURNING id
            """, (telegram_id, amount, package))
            return cur.fetchone()[0]
    finally:
        pool.putconn(conn)
