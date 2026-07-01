from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy.orm import Session

from .. import auth
from ..db import get_db
from ..schemas import AuthStatus, PasswordIn

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.get("/status", response_model=AuthStatus)
def status(request: Request, db: Session = Depends(get_db)):
    has_password = auth.get_password_hash(db) is not None
    return AuthStatus(
        setup_required=not has_password,
        authenticated=has_password and auth.is_authenticated(request),
    )


@router.post("/setup", response_model=AuthStatus)
def setup(body: PasswordIn, response: Response, db: Session = Depends(get_db)):
    if auth.get_password_hash(db) is not None:
        raise HTTPException(status_code=400, detail="Password already set")
    auth.set_password(db, body.password)
    auth.create_session(response)
    return AuthStatus(setup_required=False, authenticated=True)


@router.post("/login", response_model=AuthStatus)
def login(body: PasswordIn, response: Response, db: Session = Depends(get_db)):
    if not auth.verify_password(db, body.password):
        raise HTTPException(status_code=401, detail="Wrong password")
    auth.create_session(response)
    return AuthStatus(setup_required=False, authenticated=True)


@router.post("/logout")
def logout(response: Response):
    auth.clear_session(response)
    return {"ok": True}
