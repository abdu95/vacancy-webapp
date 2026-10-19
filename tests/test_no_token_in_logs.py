import io
import logging
import os
import sys

sys.path.insert(0, str(__import__("pathlib").Path(__file__).resolve().parent.parent))

os.environ["TELEGRAM_TOKEN"] = "123456:SECRET_TOKEN_VALUE"
os.environ["ANTHROPIC_API_KEY"] = "dummy"
os.environ["DATABASE_URL"] = "postgresql://fake"

from app import main  # noqa: E402,F401 - importing it applies the logging config
import httpx  # noqa: E402

# Telegram's Bot API puts the token in the URL path, and httpx logs every
# request URL at INFO - which once leaked the real token into Railway's logs.
captured = io.StringIO()
logging.getLogger().addHandler(logging.StreamHandler(captured))
with httpx.Client(transport=httpx.MockTransport(lambda request: httpx.Response(200, json={"ok": True}))) as client:
    client.post(f"https://api.telegram.org/bot{os.environ['TELEGRAM_TOKEN']}/sendMessage", json={})
assert "SECRET_TOKEN_VALUE" not in captured.getvalue(), captured.getvalue()
print("PASS: a Telegram API call doesn't write the bot token to the logs")

print("\nALL TOKEN-LOGGING CHECKS PASSED")
