import asyncio
import os
import sys
import unittest.mock as mock

sys.path.insert(0, str(__import__("pathlib").Path(__file__).resolve().parent.parent))

os.environ["TELEGRAM_TOKEN"] = "dummy:token"
os.environ["ANTHROPIC_API_KEY"] = "dummy"
os.environ["DATABASE_URL"] = "postgresql://fake"

from app import main  # noqa: E402

# Staging sets VACANCY_ALERTS_ENABLED=0 because its database is a copy of
# prod's (real users' telegram_ids). Prod leaves it unset, which must keep
# the daily alerts loop running exactly as before the switch existed.
for value, expected_tasks in [(None, 1), ("1", 1), ("0", 0)]:
    if value is None:
        os.environ.pop("VACANCY_ALERTS_ENABLED", None)
    else:
        os.environ["VACANCY_ALERTS_ENABLED"] = value
    with mock.patch.object(main.asyncio, "create_task") as m_task:
        asyncio.run(main._start_background_jobs())
        assert m_task.call_count == expected_tasks, (value, m_task.call_count)
        for call in m_task.call_args_list:
            call.args[0].close()  # the never-started coroutine, to avoid a "never awaited" warning
print("PASS: alerts loop starts when VACANCY_ALERTS_ENABLED is unset or 1, not when 0")

print("\nALL ALERTS SWITCH CHECKS PASSED")
