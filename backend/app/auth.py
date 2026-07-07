from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError
from fastapi import Depends, HTTPException, Request, Response
from itsdangerous import BadSignature, SignatureExpired, TimestampSigner
from sqlalchemy.orm import Session

from .config import SECRET_KEY, SESSION_COOKIE, SESSION_COOKIE_SECURE, SESSION_MAX_AGE
from .db import get_db
from .models import Setting

_hasher = PasswordHasher()
_signer = TimestampSigner(SECRET_KEY)

PASSWORD_KEY = "password_hash"
SESSION_VERSION_KEY = "session_version"


def get_password_hash(db: Session) -> str | None:
    row = db.get(Setting, PASSWORD_KEY)
    return row.value if row else None


def get_session_version(db: Session) -> int:
    row = db.get(Setting, SESSION_VERSION_KEY)
    return int(row.value) if row else 0


def set_password(db: Session, password: str) -> None:
    hashed = _hasher.hash(password)
    row = db.get(Setting, PASSWORD_KEY)
    if row:
        row.value = hashed
    else:
        db.add(Setting(key=PASSWORD_KEY, value=hashed))

    version_row = db.get(Setting, SESSION_VERSION_KEY)
    new_version = get_session_version(db) + 1
    if version_row:
        version_row.value = str(new_version)
    else:
        db.add(Setting(key=SESSION_VERSION_KEY, value=str(new_version)))

    db.commit()


def verify_password(db: Session, password: str) -> bool:
    hashed = get_password_hash(db)
    if not hashed:
        return False
    try:
        _hasher.verify(hashed, password)
        return True
    except VerifyMismatchError:
        return False


def create_session(response: Response, db: Session = Depends(get_db)) -> None:
    version = get_session_version(db)
    token = _signer.sign(f"v{version}".encode()).decode()
    response.set_cookie(
        SESSION_COOKIE,
        token,
        max_age=SESSION_MAX_AGE,
        httponly=True,
        samesite="lax",
        secure=SESSION_COOKIE_SECURE,
    )


def clear_session(response: Response) -> None:
    response.delete_cookie(SESSION_COOKIE)


def is_authenticated(request: Request, db: Session = Depends(get_db)) -> bool:
    token = request.cookies.get(SESSION_COOKIE)
    if not token:
        return False
    try:
        payload = _signer.unsign(token, max_age=SESSION_MAX_AGE).decode()
        current_version = get_session_version(db)
        if not payload.startswith("v"):
            return False
        token_version = int(payload[1:])
        return token_version == current_version
    except (BadSignature, SignatureExpired, ValueError):
        return False


def require_auth(request: Request, db: Session = Depends(get_db)) -> None:
    # No password configured yet -> allow through so first-run setup works
    if get_password_hash(db) is None:
        return
    if not is_authenticated(request, db):
        raise HTTPException(status_code=401, detail="Not authenticated")
