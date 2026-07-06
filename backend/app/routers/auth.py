from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy.orm import Session

from .. import auth
from ..db import get_db
from ..schemas import AuthStatus, ChangePasswordIn, PasswordIn

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


@router.post("/change-password", response_model=AuthStatus, dependencies=[Depends(auth.require_auth)])
def change_password(body: ChangePasswordIn, db: Session = Depends(get_db)):
    if not auth.verify_password(db, body.current_password):
        raise HTTPException(status_code=401, detail="Current password is wrong")
    auth.set_password(db, body.new_password)
    return AuthStatus(setup_required=False, authenticated=True)
