"""Real Auth-emulator test. Refuses to run against a cloud project."""

import asyncio
import os

import firebase_admin
import httpx
from firebase_admin import auth, credentials


async def main():
    host = os.environ.get("FIREBASE_AUTH_EMULATOR_HOST", "")
    project = os.environ.get("GCLOUD_PROJECT", "")
    if host not in {"127.0.0.1:9099", "localhost:9099"} or not project.startswith(
        "demo-"
    ):
        raise RuntimeError("This test requires the isolated local Auth emulator")
    os.environ["NEXTNOOTBOOK_AUTH_MODE"] = "firebase"
    os.environ["FIREBASE_PROJECT_ID"] = project
    os.environ["FIREBASE_WEB_CONFIG"] = "{}"
    os.environ["NEXTNOOTBOOK_ADMIN_EMAIL"] = "owner@example.invalid"
    os.environ["NEXTNOOTBOOK_ALLOWED_ORIGINS"] = "https://study.example"
    from fastapi import FastAPI

    from api import firebase_auth
    from api.auth import PasswordAuthMiddleware
    from api.routers.auth import router

    # Emulator Admin credentials never reach Google; use local certificate only if configured.
    app = firebase_admin.initialize_app(
        credentials.Certificate(os.environ["GOOGLE_APPLICATION_CREDENTIALS"]),
        {"projectId": project},
        name="emulator-session-test",
    )
    setattr(firebase_auth, "firebase_app", lambda: app)
    api = FastAPI()
    api.add_middleware(PasswordAuthMiddleware, excluded_paths=["/api/auth/status"])
    api.include_router(router, prefix="/api")

    @api.get("/api/notebooks")
    async def notebooks():
        return [{"title": "private notebook"}]

    async with httpx.AsyncClient() as emulator:
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=api), base_url="https://study.example"
        ) as client:
            for email, admin in [
                ("owner@example.invalid", True),
                ("student@example.invalid", False),
            ]:
                signup = await emulator.post(
                    f"http://{host}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=emulator",
                    json={
                        "email": email,
                        "password": "Test-password-123",
                        "returnSecureToken": True,
                    },
                )
                signup.raise_for_status()
                uid = signup.json()["localId"]
                auth.update_user(uid, email_verified=True, app=app)
                login = await emulator.post(
                    f"http://{host}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=emulator",
                    json={
                        "email": email,
                        "password": "Test-password-123",
                        "returnSecureToken": True,
                    },
                )
                login.raise_for_status()
                session = await client.post(
                    "/api/auth/session",
                    headers={"Origin": "https://study.example"},
                    json={"idToken": login.json()["idToken"]},
                )
                assert session.status_code == 200, session.text
                assert session.json()["user"]["admin"] is admin
                me = await client.get("/api/auth/me")
                assert me.status_code == 200 and me.json()["user"]["uid"] == uid
                private = await client.get("/api/notebooks")
                assert private.status_code == (200 if admin else 403)
                if admin:
                    auth.revoke_refresh_tokens(uid, app=app)
                    # Revocation timestamps have one-second precision; token disabling is deterministic.
                    auth.update_user(uid, disabled=True, app=app)
                    assert (await client.get("/api/notebooks")).status_code == 401
                logout = await client.post(
                    "/api/auth/logout", headers={"Origin": "https://study.example"}
                )
                assert logout.status_code == 200
                assert (await client.get("/api/auth/me")).status_code == 401
    firebase_admin.delete_app(app)
    print(
        "PASS: real Firebase sessions, administrator bootstrap, private data isolation, disabled-account rejection and logout"
    )


asyncio.run(main())
