import os
import secrets
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent.parent
DATA_DIR = Path(os.environ.get("ET_DATA_DIR", BASE_DIR / "data"))
DATA_DIR.mkdir(parents=True, exist_ok=True)

DB_PATH = DATA_DIR / "app.db"
DATABASE_URL = f"sqlite:///{DB_PATH}"

STATIC_DIR = Path(os.environ.get("ET_STATIC_DIR", BASE_DIR / "frontend" / "dist"))

BASE_CURRENCY = os.environ.get("ET_BASE_CURRENCY", "AED")

SESSION_COOKIE = "et_session"
SESSION_MAX_AGE = 60 * 60 * 24 * 30  # 30 days
# Set ET_COOKIE_SECURE=1 once you're serving over HTTPS (e.g. behind a reverse
# proxy on your VPS) so the session cookie is never sent over plain HTTP.
SESSION_COOKIE_SECURE = os.environ.get("ET_COOKIE_SECURE", "0") == "1"

_SECRET_FILE = DATA_DIR / "secret_key"


def get_secret_key() -> str:
    if _SECRET_FILE.exists():
        return _SECRET_FILE.read_text().strip()
    key = secrets.token_hex(32)
    _SECRET_FILE.write_text(key)
    _SECRET_FILE.chmod(0o600)
    return key


SECRET_KEY = get_secret_key()
