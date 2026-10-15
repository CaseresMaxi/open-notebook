"""Firebase identity and server sessions. Never accepts roles from the browser."""

import json
import os
import tempfile
import time
from datetime import timedelta
from functools import lru_cache
from pathlib import Path

import firebase_admin
from firebase_admin import auth, credentials
from starlette.concurrency import run_in_threadpool

SESSION_COOKIE = "nextnootbook_session"
SESSION_SECONDS = 60 * 60 * 24 * 5


def configured() -> bool:
    return bool(os.getenv("FIREBASE_PROJECT_ID") and os.getenv("FIREBASE_WEB_CONFIG"))


def enabled() -> bool:
    return os.environ.get("NEXTNOOTBOOK_AUTH_MODE") == "firebase"


@lru_cache(maxsize=1)
def firebase_app():
    project = os.environ["FIREBASE_PROJECT_ID"]
    certificate = os.getenv("GOOGLE_APPLICATION_CREDENTIALS")
    credential = credentials.Certificate(certificate) if certificate else None
    return firebase_admin.initialize_app(
        credential, {"projectId": project}, name="nextnootbook"
    )


def admin_emails() -> list[str]:
    """Verified emails granted the administrator role (comma-separated)."""
    raw = os.getenv("NEXTNOOTBOOK_ADMIN_EMAIL", "")
    return [email.strip().casefold() for email in raw.split(",") if email.strip()]


def admin_email() -> str:
    """The primary administrator, who owns the installation when no owner is pinned."""
    emails = admin_emails()
    return emails[0] if emails else ""


def owner_email() -> str:
    """Verified email that always owns the original installation (home server)."""
    return os.getenv("NEXTNOOTBOOK_OWNER_EMAIL", "").strip().casefold()


def _write_owner(path: Path, uid: str, email: str, *, replace: bool) -> None:
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(
            mode="w", dir=path.parent, delete=False
        ) as stream:
            temporary = Path(stream.name)
            json.dump({"version": 1, "uid": uid, "email": email}, stream)
            stream.flush()
            os.fsync(stream.fileno())
        if replace:
            os.replace(temporary, path)
            temporary = None
        else:
            os.link(temporary, path)
    finally:
        if temporary:
            temporary.unlink(missing_ok=True)


def bind_legacy_owner(uid: str, email: str):
    """Bind the existing local installation once, without rewriting study records."""
    cloud_owner = os.getenv("NEXTNOOTBOOK_OWNER_UID")
    if cloud_owner:
        if uid != cloud_owner:
            raise ValueError("Existing study data is already bound to another account")
        return
    target = os.environ.get("NEXTNOOTBOOK_LEGACY_OWNER_FILE")
    if not target:
        return
    path = Path(target)
    path.parent.mkdir(parents=True, exist_ok=True)
    try:
        _write_owner(path, uid, email, replace=False)
    except FileExistsError:
        owner = json.loads(path.read_text())
        if owner.get("uid") == uid:
            return
        # A recreated Firebase account keeps the original data only when the
        # operator pinned its verified email; the previous binding is kept aside.
        if owner_email() and (email or "").casefold() == owner_email():
            backup = path.with_name(f"{path.name}.{owner.get('uid', 'unknown')}.bak")
            if not backup.exists():
                backup.write_text(json.dumps(owner))
            _write_owner(path, uid, email, replace=True)
            return
        raise ValueError(
            "Existing study data is already bound to another account"
        ) from None


def legacy_owner_uid():
    if os.getenv("NEXTNOOTBOOK_OWNER_UID"):
        return os.environ["NEXTNOOTBOOK_OWNER_UID"]
    target = os.environ.get("NEXTNOOTBOOK_LEGACY_OWNER_FILE")
    if not target:
        return None
    path = Path(target)
    return json.loads(path.read_text())["uid"] if path.exists() else None


def is_legacy_owner(user) -> bool:
    """The bound UID, or the pinned verified owner email, sees the original data."""
    if user["uid"] == legacy_owner_uid():
        return True
    return bool(
        owner_email()
        and user.get("emailVerified")
        and (user.get("email") or "").casefold() == owner_email()
    )


def public_user(user, claims=None):
    claims = claims if claims is not None else user.custom_claims or {}
    return {
        "uid": user.uid,
        "email": user.email,
        "name": user.display_name or "",
        "emailVerified": user.email_verified,
        "admin": claims.get("admin") is True,
    }


async def create_session(id_token: str):
    app = firebase_app()
    decoded = await run_in_threadpool(
        auth.verify_id_token, id_token, app=app, check_revoked=True
    )
    if time.time() - decoded.get("auth_time", 0) > 300:
        raise ValueError("Recent sign-in required")
    user = await run_in_threadpool(auth.get_user, decoded["uid"], app=app)
    if user.disabled or not user.email_verified:
        raise ValueError("Verified account required")
    claims = user.custom_claims or {}
    # Only Firebase's verified identity can match the operator configured on the server.
    email = (user.email or "").casefold()
    if owner_email() and user.email_verified and email == owner_email():
        await run_in_threadpool(bind_legacy_owner, user.uid, user.email)
    if user.email_verified and email in admin_emails():
        # Extra administrators get the role, never the original study data.
        if email == admin_email() and not owner_email():
            await run_in_threadpool(bind_legacy_owner, user.uid, user.email)
        if claims.get("admin") is not True:
            claims = {**claims, "admin": True}
            await run_in_threadpool(
                auth.set_custom_user_claims, user.uid, claims, app=app
            )
    cookie = await run_in_threadpool(
        auth.create_session_cookie,
        id_token,
        expires_in=timedelta(seconds=SESSION_SECONDS),
        app=app,
    )
    from open_notebook.usage import register_account

    await run_in_threadpool(register_account, public_user(user, claims))
    return cookie, public_user(user, claims)


async def session_user(cookie: str):
    app = firebase_app()
    decoded = await run_in_threadpool(
        auth.verify_session_cookie, cookie, check_revoked=True, app=app
    )
    user = await run_in_threadpool(auth.get_user, decoded["uid"], app=app)
    if user.disabled or not user.email_verified:
        raise ValueError("Verified account required")
    # Read current claims, so role removal takes effect without waiting five days.
    return public_user(user)


LAN_SUFFIXES = (".local", ".lan", ".home", ".home.arpa", ".internal")


def private_network_host(hostname: str | None) -> bool:
    """Loopback, RFC 1918/link-local addresses or a home-network hostname."""
    import ipaddress

    if not hostname:
        return False
    try:
        address = ipaddress.ip_address(hostname)
    except ValueError:
        name = hostname.rstrip(".").casefold()
        return name == "localhost" or ("." in name and name.endswith(LAN_SUFFIXES))
    return (address.is_private or address.is_loopback) and not (
        address.is_unspecified or address.is_multicast
    )


def secure_cookie(request) -> bool:
    """Secure unless explicitly local, and always for an HTTPS origin."""
    if os.getenv("NEXTNOOTBOOK_INSECURE_LOCAL_COOKIES") != "true":
        return True
    return (request.headers.get("origin") or "").startswith("https://")


def validate_runtime_configuration():
    """Refuse an accidentally anonymous or insecure account-mode configuration."""
    from urllib.parse import urlparse

    from open_notebook.exceptions import ConfigurationError
    from open_notebook.utils.encryption import get_secret_from_env

    mode = os.getenv("NEXTNOOTBOOK_AUTH_MODE", "legacy")
    if os.getenv("NEXTNOOTBOOK_DATABASE_BACKEND") == "firestore" and (
        mode != "firebase" or os.getenv("NEXTNOOTBOOK_STORAGE_BACKEND") != "firebase"
    ):
        raise ConfigurationError(
            "Firestore runtime requires Firebase accounts and Storage"
        )
    if mode not in {"legacy", "firebase"}:
        raise ConfigurationError("NEXTNOOTBOOK_AUTH_MODE must be legacy or firebase")
    if mode != "firebase":
        return
    if not configured() or not get_secret_from_env("OPEN_NOTEBOOK_ENCRYPTION_KEY"):
        raise ConfigurationError(
            "Account mode requires Firebase configuration and an encryption key"
        )
    config = json.loads(os.environ["FIREBASE_WEB_CONFIG"])
    if config.get("projectId") != os.environ["FIREBASE_PROJECT_ID"]:
        raise ConfigurationError("Firebase client and server project must match")
    origins = {
        x.strip()
        for x in os.getenv("NEXTNOOTBOOK_ALLOWED_ORIGINS", "").split(",")
        if x.strip()
    }
    cors = {x.strip() for x in os.getenv("CORS_ORIGINS", "").split(",") if x.strip()}
    if (
        not origins
        or not cors
        or "*" in origins
        or "*" in cors
        or not cors.issubset(origins)
    ):
        raise ConfigurationError(
            "Account mode requires explicit matching allowed origins and CORS"
        )
    insecure = os.getenv("NEXTNOOTBOOK_INSECURE_LOCAL_COOKIES") == "true"
    # Home server: plain HTTP is tolerated only for origins inside the private network.
    lan_http = os.getenv("NEXTNOOTBOOK_LAN_HTTP") == "true"
    for origin in origins:
        parsed = urlparse(origin)
        if (
            parsed.username
            or parsed.password
            or parsed.path not in {"", "/"}
            or parsed.query
            or parsed.fragment
        ):
            raise ConfigurationError(
                "Origins must contain only a scheme, host and optional port"
            )
        if insecure:
            if lan_http:
                # HTTPS origins (e.g. a Tailscale name) keep Secure cookies.
                if parsed.scheme == "http" and not private_network_host(
                    parsed.hostname
                ):
                    raise ConfigurationError(
                        "LAN HTTP is allowed only on private network origins"
                    )
            elif parsed.hostname not in {"localhost", "127.0.0.1", "::1"}:
                raise ConfigurationError(
                    "Insecure cookies are allowed only on loopback origins"
                )
        if parsed.scheme not in {"http", "https"}:
            raise ConfigurationError("Origins require HTTP or HTTPS")
        if not insecure and parsed.scheme != "https":
            raise ConfigurationError(
                "Account mode requires HTTPS outside local development"
            )
