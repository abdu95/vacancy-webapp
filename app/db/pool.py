"""
Shared Postgres connection pool. Every other app/db/* module reaches this
through `db.get_pool()` (via `from app import db`, not a direct import of
this module) so that `mock.patch.object(db, "get_pool", ...)` - the
pattern every existing DB test already uses - keeps working unchanged
regardless of which submodule a query lives in.
"""

import os

from psycopg2.pool import SimpleConnectionPool

_pool: SimpleConnectionPool | None = None


def get_pool() -> SimpleConnectionPool:
    global _pool
    if _pool is None:
        dsn = os.getenv("DATABASE_URL")
        if not dsn:
            raise ValueError("DATABASE_URL not set")
        _pool = SimpleConnectionPool(1, 5, dsn)
    return _pool
