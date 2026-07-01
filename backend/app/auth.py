from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError
from fastapi import Depends, HTTPException, Request, Response
from itsdangerous import BadSignature, SignatureExpired, TimestampSigner
from sqlalchemy.orm import Session

from .config import SECRET_KEY, SESSION_COOKIE, SESSION_MAX_AGE
from .db import get_db
from .models import Setting

_hasher = PasswordHasher()
_signer = TimestampSigner(SECRET_KEY)

PASSWORD_KEY = "password_hash"


def get_password_hash(db: Session) -> str | None:
    row = db.get(Setting, PASSWORD_KEY)
    return row.value if row else None


def set_password(db: Session, password: str) -> None:
    hashed = _hasher.hash(password)
    row = db.get(Setting, PASSWORD_KEY)
    if row:
        row.value = hashed
    else:
        db.add(Setting(key=PASSWORD_KEY, value=hashed))
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


def create_session(response: Response) -> None:
    token = _signer.sign(b"ok").decode()
    response.set_cookie(
        SESSION_COOKIE,
        token,
        max_age=SESSION_MAX_AGE,
        httponly=True,
        samesite="lax",
    )


def clear_session(response: Response) -> None:
    response.delete_cookie(SESSION_COOKIE)


def is_authenticated(request: Request) -> bool:
    token = request.cookies.get(SESSION_COOKIE)
    if not token:
        return False
    try:
        _signer.unsign(token, max_age=SESSION_MAX_AGE)
        return True
    except (BadSignature, SignatureExpired):
        return False


def require_auth(request: Request, db: Session = Depends(get_db)) -> None:
    # No password configured yet -> allow through so first-run setup works
    if get_password_hash(db) is None:
        return
    if not is_authenticated(request):
        raise HTTPException(status_code=401, detail="Not authenticated")
