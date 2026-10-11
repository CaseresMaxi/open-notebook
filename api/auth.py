import secrets
from typing import Optional

from fastapi import Request
from starlette.concurrency import run_in_threadpool
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.responses import JSONResponse, Response
from starlette.types import ASGIApp

from api import firebase_auth
from open_notebook.usage import policy_for, register_account
from open_notebook.utils.encryption import get_secret_from_env
from open_notebook.workspace_provisioning import ensure_workspace
from open_notebook.workspaces import Workspace, platform_scope, workspace_scope


class PasswordAuthMiddleware(BaseHTTPMiddleware):
    """
    Middleware to check password authentication for all API requests.
    Auth is fully disabled (no hardcoded default password) if
    OPEN_NOTEBOOK_PASSWORD is not set.
    Supports Docker secrets via OPEN_NOTEBOOK_PASSWORD_FILE.
    """

    def __init__(
        self, app: ASGIApp, excluded_paths: Optional[list[str]] = None
    ) -> None:
        super().__init__(app)
        self.password = get_secret_from_env("OPEN_NOTEBOOK_PASSWORD")
        self.excluded_paths: list[str] = excluded_paths or [
            "/",
            "/health",
            "/docs",
            "/openapi.json",
            "/redoc",
        ]

    async def dispatch(
        self, request: Request, call_next: RequestResponseEndpoint
    ) -> Response:
        if (
            firebase_auth.enabled()
            or (
                bool(request.cookies.get(firebase_auth.SESSION_COOKIE))
                and firebase_auth.configured()
            )
            or request.url.path.startswith(("/api/admin", "/api/account"))
        ):
            if (
                request.method == "OPTIONS"
                or request.url.path in self.excluded_paths
                or request.url.path
                in {
                    "/api/auth/session",
                    "/api/auth/logout",
                    "/api/auth/me",
                }
            ):
                return await call_next(request)
            try:
                cookie = request.cookies.get(firebase_auth.SESSION_COOKIE)
                if not cookie:
                    raise ValueError("Missing session")
                user = await firebase_auth.session_user(cookie)
            except Exception:
                return JSONResponse(
                    status_code=401,
                    content={"detail": "Authentication required"},
                    headers={"X-Account-Required": "true"},
                )
            request.state.user = user
            if request.method not in {"GET", "HEAD", "OPTIONS"}:
                from api.routers.auth import check_origin

                try:
                    check_origin(request)
                except Exception:
                    return JSONResponse(
                        status_code=403, content={"detail": "Invalid request origin"}
                    )
            await run_in_threadpool(register_account, user)
            policy = await run_in_threadpool(policy_for, user["uid"])
            if policy["disabled"]:
                return JSONResponse(
                    status_code=403, content={"detail": "Account disabled"}
                )
            path = request.url.path
            operator_paths = (
                "/api/admin",
                "/api/credentials",
                "/api/embedding/rebuild",
                "/api/embedding-rebuild",
                "/api/rebuild",
                "/api/embedding",
                "/api/podcasts",
                "/api/speaker-profiles",
                "/api/episode-profiles",
                "/api/models/discover",
                "/api/models/count",
                "/api/models/providers",
            )
            platform_paths = (
                "/api/models",
                "/api/providers",
                "/api/settings",
                "/api/config",
            )
            operator_only = (
                path.startswith(operator_paths)
                or (path.startswith(platform_paths) and request.method != "GET")
                or path.startswith("/api/commands/registry")
                or (path == "/api/commands/jobs" and request.method == "POST")
            )
            if operator_only and not user["admin"]:
                return JSONResponse(
                    status_code=403, content={"detail": "Administrator access required"}
                )
            owner_uid = firebase_auth.legacy_owner_uid()
            workspace = Workspace(user["uid"], user["admin"], owner_uid == user["uid"])
            with workspace_scope(workspace):
                await ensure_workspace(workspace)
                if path.startswith(platform_paths) or path.startswith(
                    "/api/credentials"
                ):
                    with platform_scope():
                        return await call_next(request)
                return await call_next(request)

        # Skip authentication if no password is set
        if not self.password:
            return await call_next(request)

        # Skip authentication for excluded paths
        if request.url.path in self.excluded_paths:
            return await call_next(request)

        # Skip authentication for CORS preflight requests (OPTIONS)
        if request.method == "OPTIONS":
            return await call_next(request)

        # Check authorization header
        auth_header = request.headers.get("Authorization")

        if not auth_header:
            return JSONResponse(
                status_code=401,
                content={"detail": "Missing authorization header"},
                headers={"WWW-Authenticate": "Bearer"},
            )

        # Expected format: "Bearer {password}"
        try:
            scheme, credentials = auth_header.split(" ", 1)
            if scheme.lower() != "bearer":
                raise ValueError("Invalid authentication scheme")
        except ValueError:
            return JSONResponse(
                status_code=401,
                content={"detail": "Invalid authorization header format"},
                headers={"WWW-Authenticate": "Bearer"},
            )

        # Check password (constant-time to avoid a timing side-channel)
        if not secrets.compare_digest(
            credentials.encode("latin-1"), self.password.encode("utf-8")
        ):
            return JSONResponse(
                status_code=401,
                content={"detail": "Invalid password"},
                headers={"WWW-Authenticate": "Bearer"},
            )

        # Password is correct, proceed with the request
        response = await call_next(request)
        return response
