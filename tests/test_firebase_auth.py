"""Security boundaries for Firebase sessions and the legacy single-user store."""

from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from api import firebase_auth
from api.auth import PasswordAuthMiddleware
from api.routers.auth import router


@pytest.fixture
def app(monkeypatch, tmp_path):
    monkeypatch.setenv("NEXTNOOTBOOK_USAGE_DB", str(tmp_path / "usage.sqlite"))
    monkeypatch.setattr("api.auth.ensure_workspace", AsyncMock())
    monkeypatch.setenv("NEXTNOOTBOOK_AUTH_MODE", "firebase")
    monkeypatch.setenv("FIREBASE_PROJECT_ID", "test")
    monkeypatch.setenv("FIREBASE_WEB_CONFIG", "{}")
    monkeypatch.setenv("NEXTNOOTBOOK_ALLOWED_ORIGINS", "https://study.example")
    monkeypatch.delenv("NEXTNOOTBOOK_INSECURE_LOCAL_COOKIES", raising=False)
    app = FastAPI()
    app.add_middleware(PasswordAuthMiddleware, excluded_paths=["/api/auth/status"])
    app.include_router(router, prefix="/api")

    @app.get("/api/notebooks")
    async def notebooks():
        from open_notebook.workspaces import current_workspace

        workspace = current_workspace()
        return (
            [{"title": "private material"}] if not workspace or workspace.legacy else []
        )

    return app


@pytest.mark.asyncio
async def test_public_config_never_exposes_credentials(app, monkeypatch):
    monkeypatch.setenv(
        "FIREBASE_WEB_CONFIG",
        '{"projectId":"test","apiKey":"public","private_key":"SECRET"}',
    )
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="https://study.example"
    ) as client:
        response = await client.get("/api/auth/status")
    assert response.json()["firebase"] == {"projectId": "test", "apiKey": "public"}
    assert "SECRET" not in response.text


@pytest.mark.asyncio
async def test_sessions_reject_missing_or_foreign_origin(app, monkeypatch):
    create = AsyncMock()
    monkeypatch.setattr(firebase_auth, "create_session", create)
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="https://study.example"
    ) as client:
        for headers in ({}, {"Origin": "https://attacker.example"}):
            response = await client.post(
                "/api/auth/session", json={"idToken": "token"}, headers=headers
            )
            assert response.status_code == 403
    create.assert_not_called()


@pytest.mark.asyncio
async def test_session_cookie_is_private_and_secure(app, monkeypatch):
    monkeypatch.setattr(
        firebase_auth,
        "create_session",
        AsyncMock(return_value=("session", {"uid": "user", "admin": False})),
    )
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="https://study.example"
    ) as client:
        response = await client.post(
            "/api/auth/session",
            json={"idToken": "token"},
            headers={"Origin": "https://study.example"},
        )
    cookie = response.headers["set-cookie"]
    assert response.status_code == 200
    assert "HttpOnly" in cookie and "Secure" in cookie and "SameSite=lax" in cookie
    assert response.headers["cache-control"] == "no-store"


@pytest.mark.asyncio
async def test_members_cannot_read_the_legacy_shared_data(app, monkeypatch):
    monkeypatch.setattr(
        firebase_auth,
        "session_user",
        AsyncMock(return_value={"uid": "member", "admin": False}),
    )
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="https://study.example"
    ) as client:
        assert (await client.get("/api/notebooks")).status_code == 401
        client.cookies.set(firebase_auth.SESSION_COOKIE, "session")
        response = await client.get("/api/notebooks")
        assert response.status_code == 200
        assert response.json() == []
        assert "private material" not in response.text
        assert (await client.get("/api/auth/me")).status_code == 200


@pytest.mark.asyncio
async def test_invalid_cookie_does_not_fall_back_to_installation_password(
    app, monkeypatch
):
    monkeypatch.setenv("OPEN_NOTEBOOK_PASSWORD", "old-password")
    monkeypatch.setattr(
        firebase_auth, "session_user", AsyncMock(side_effect=ValueError("invalid"))
    )
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="https://study.example"
    ) as client:
        client.cookies.set(firebase_auth.SESSION_COOKIE, "invalid")
        response = await client.get(
            "/api/notebooks", headers={"Authorization": "Bearer old-password"}
        )
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_verified_admin_access_and_logout(app, monkeypatch):
    monkeypatch.setattr(
        firebase_auth,
        "session_user",
        AsyncMock(return_value={"uid": "admin", "admin": True}),
    )
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="https://study.example"
    ) as client:
        client.cookies.set(firebase_auth.SESSION_COOKIE, "valid")
        assert (await client.get("/api/notebooks")).status_code == 200
        assert (
            await client.post(
                "/api/auth/logout", headers={"Origin": "https://attacker.example"}
            )
        ).status_code == 403
        response = await client.post(
            "/api/auth/logout", headers={"Origin": "https://study.example"}
        )
        assert response.status_code == 200
        assert "Max-Age=0" in response.headers["set-cookie"]


@pytest.mark.asyncio
async def test_admin_assignment_requires_verified_identity(monkeypatch):
    monkeypatch.setenv("NEXTNOOTBOOK_ADMIN_EMAIL", "owner@example.com")
    monkeypatch.setattr(firebase_auth, "firebase_app", lambda: "app")
    monkeypatch.setattr(
        firebase_auth.auth,
        "verify_id_token",
        Mock(return_value={"uid": "uid", "auth_time": firebase_auth.time.time()}),
    )
    user = SimpleNamespace(
        uid="uid",
        email="owner@example.com",
        display_name="Owner",
        disabled=False,
        email_verified=False,
        custom_claims={},
    )
    monkeypatch.setattr(firebase_auth.auth, "get_user", Mock(return_value=user))
    promote = Mock()
    monkeypatch.setattr(firebase_auth.auth, "set_custom_user_claims", promote)
    monkeypatch.setattr(
        firebase_auth.auth, "create_session_cookie", Mock(return_value="session")
    )
    with pytest.raises(ValueError):
        await firebase_auth.create_session("token")
    promote.assert_not_called()
    user.email_verified = True
    cookie, account = await firebase_auth.create_session("token")
    assert cookie == "session" and account["admin"] is True
    promote.assert_called_once_with("uid", {"admin": True}, app="app")
    promote.reset_mock()
    user.email = "student@example.com"
    _, account = await firebase_auth.create_session("token")
    assert account["admin"] is False
    promote.assert_not_called()


def test_legacy_owner_binding_is_immutable(monkeypatch, tmp_path):
    path = tmp_path / "account-owner.json"
    monkeypatch.setenv("NEXTNOOTBOOK_LEGACY_OWNER_FILE", str(path))
    firebase_auth.bind_legacy_owner("owner-uid", "owner@example.com")
    firebase_auth.bind_legacy_owner("owner-uid", "owner@example.com")
    assert firebase_auth.legacy_owner_uid() == "owner-uid"
    with pytest.raises(ValueError):
        firebase_auth.bind_legacy_owner("different-uid", "owner@example.com")
    assert firebase_auth.legacy_owner_uid() == "owner-uid"
    assert path.stat().st_mode & 0o777 == 0o600


@pytest.mark.asyncio
async def test_optional_accounts_scope_members_without_replacing_local_default(
    app, monkeypatch
):
    monkeypatch.setenv("NEXTNOOTBOOK_AUTH_MODE", "legacy")
    monkeypatch.setattr(
        firebase_auth,
        "session_user",
        AsyncMock(return_value={"uid": "member", "admin": False}),
    )
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="https://study.example"
    ) as client:
        assert (await client.get("/api/notebooks")).json() == [
            {"title": "private material"}
        ]
        client.cookies.set(firebase_auth.SESSION_COOKIE, "session")
        assert (await client.get("/api/notebooks")).json() == []
        client.cookies.clear()
        assert (await client.get("/api/notebooks")).json() == [
            {"title": "private material"}
        ]
