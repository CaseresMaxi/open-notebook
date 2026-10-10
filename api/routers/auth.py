"""
Authentication router for Open Notebook API.
Provides endpoints to check authentication status.
"""

import json
import os

from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import BaseModel, Field

from api import firebase_auth
from open_notebook.utils.encryption import get_secret_from_env

router = APIRouter(prefix="/auth", tags=["auth"])


@router.get("/status")
async def get_auth_status():
    """
    Check if authentication is enabled.
    Returns whether a password is required to access the API.
    Supports Docker secrets via OPEN_NOTEBOOK_PASSWORD_FILE.
    """
    if firebase_auth.configured():
        config = json.loads(os.environ.get("FIREBASE_WEB_CONFIG", "{}"))
        # Strict allowlist: never expose a server credential through configuration.
        public_keys = {
            "apiKey",
            "authDomain",
            "projectId",
            "appId",
            "storageBucket",
            "messagingSenderId",
        }
        return {
            "auth_enabled": firebase_auth.enabled()
            or bool(get_secret_from_env("OPEN_NOTEBOOK_PASSWORD")),
            "mode": "firebase" if firebase_auth.enabled() else "legacy",
            "accounts_available": True,
            "firebase": {
                key: value for key, value in config.items() if key in public_keys
            },
        }
    auth_enabled = bool(get_secret_from_env("OPEN_NOTEBOOK_PASSWORD"))

    return {
        "auth_enabled": auth_enabled,
        "message": "Authentication is required"
        if auth_enabled
        else "Authentication is disabled",
    }


class SessionInput(BaseModel):
    idToken: str = Field(min_length=1, max_length=16384)


def check_origin(request: Request):
    allowed = {
        origin.strip()
        for origin in os.environ.get("NEXTNOOTBOOK_ALLOWED_ORIGINS", "").split(",")
        if origin.strip()
    }
    if not allowed or request.headers.get("origin") not in allowed:
        raise HTTPException(status_code=403, detail="Invalid request origin")


@router.post("/session")
async def start_session(payload: SessionInput, request: Request, response: Response):
    if not firebase_auth.configured():
        raise HTTPException(status_code=404, detail="Account authentication disabled")
    check_origin(request)
    try:
        cookie, user = await firebase_auth.create_session(payload.idToken)
    except Exception:
        raise HTTPException(
            status_code=401, detail="Unable to verify sign-in"
        ) from None
    response.set_cookie(
        firebase_auth.SESSION_COOKIE,
        cookie,
        httponly=True,
        secure=os.getenv("NEXTNOOTBOOK_INSECURE_LOCAL_COOKIES") != "true",
        samesite="lax",
        max_age=firebase_auth.SESSION_SECONDS,
        path="/",
    )
    response.headers["Cache-Control"] = "no-store"
    return {"user": user}


@router.get("/me")
async def current_account(request: Request, response: Response):
    if not firebase_auth.configured():
        raise HTTPException(status_code=404, detail="Account authentication disabled")
    try:
        user = await firebase_auth.session_user(
            request.cookies.get(firebase_auth.SESSION_COOKIE, "")
        )
    except Exception:
        raise HTTPException(status_code=401, detail="Authentication required") from None
    response.headers["Cache-Control"] = "no-store"
    return {"user": user}


@router.post("/logout")
async def end_session(request: Request, response: Response):
    if not firebase_auth.configured():
        raise HTTPException(status_code=404, detail="Account authentication disabled")
    check_origin(request)
    response.delete_cookie(
        firebase_auth.SESSION_COOKIE,
        path="/",
        httponly=True,
        samesite="lax",
        secure=os.getenv("NEXTNOOTBOOK_INSECURE_LOCAL_COOKIES") != "true",
    )
    return {"success": True}
