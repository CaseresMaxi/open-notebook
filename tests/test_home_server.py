"""Home server: LAN HTTP origins and an owner that never loses the original data."""

import json

import pytest

from api import firebase_auth
from open_notebook import usage
from open_notebook.exceptions import ConfigurationError
from open_notebook.workspaces import Workspace, workspace_scope


@pytest.fixture
def account_mode(monkeypatch):
    monkeypatch.setenv("NEXTNOOTBOOK_AUTH_MODE", "firebase")
    monkeypatch.setenv("FIREBASE_PROJECT_ID", "demo-test")
    monkeypatch.setenv("FIREBASE_WEB_CONFIG", '{"projectId":"demo-test"}')
    monkeypatch.setenv("OPEN_NOTEBOOK_ENCRYPTION_KEY", "test-signing-key")
    monkeypatch.setenv("NEXTNOOTBOOK_INSECURE_LOCAL_COOKIES", "true")
    monkeypatch.delenv("NEXTNOOTBOOK_LAN_HTTP", raising=False)

    def origins(value):
        monkeypatch.setenv("NEXTNOOTBOOK_ALLOWED_ORIGINS", value)
        monkeypatch.setenv("CORS_ORIGINS", value)

    return origins


@pytest.mark.parametrize(
    "origin",
    [
        "http://192.168.2.7:8502",
        "http://10.0.0.4:8502",
        "http://172.20.1.2:8502",
        "http://studybox.local:8502",
        "http://studybox.home.arpa:8502",
        "http://localhost:8502",
    ],
)
def test_lan_http_accepts_private_network_origins(account_mode, monkeypatch, origin):
    monkeypatch.setenv("NEXTNOOTBOOK_LAN_HTTP", "true")
    account_mode(f"http://localhost:8502,{origin}")
    firebase_auth.validate_runtime_configuration()


@pytest.mark.parametrize(
    "origin",
    [
        "http://study.example:8502",
        "http://8.8.8.8:8502",
        "http://0.0.0.0:8502",
        "http://local:8502",
    ],
)
def test_lan_http_refuses_public_origins(account_mode, monkeypatch, origin):
    monkeypatch.setenv("NEXTNOOTBOOK_LAN_HTTP", "true")
    account_mode(origin)
    with pytest.raises(ConfigurationError):
        firebase_auth.validate_runtime_configuration()


def test_lan_origins_require_explicit_opt_in(account_mode):
    account_mode("http://192.168.2.7:8502")
    with pytest.raises(ConfigurationError):
        firebase_auth.validate_runtime_configuration()


def test_pinned_owner_email_rebinds_a_recreated_account(monkeypatch, tmp_path):
    path = tmp_path / "account-owner.json"
    monkeypatch.setenv("NEXTNOOTBOOK_LEGACY_OWNER_FILE", str(path))
    monkeypatch.setenv("NEXTNOOTBOOK_OWNER_EMAIL", "Owner@Example.com")
    firebase_auth.bind_legacy_owner("old-uid", "owner@example.com")
    with pytest.raises(ValueError):
        firebase_auth.bind_legacy_owner("intruder", "someone@example.com")
    firebase_auth.bind_legacy_owner("new-uid", "owner@example.com")
    assert firebase_auth.legacy_owner_uid() == "new-uid"
    backup = tmp_path / "account-owner.json.old-uid.bak"
    assert json.loads(backup.read_text())["uid"] == "old-uid"


def test_owner_is_recognised_by_verified_email(monkeypatch, tmp_path):
    path = tmp_path / "account-owner.json"
    path.write_text(json.dumps({"version": 1, "uid": "bound-uid"}))
    monkeypatch.setenv("NEXTNOOTBOOK_LEGACY_OWNER_FILE", str(path))
    monkeypatch.setenv("NEXTNOOTBOOK_OWNER_EMAIL", "owner@example.com")
    owner = {"uid": "other-uid", "email": "OWNER@example.com", "emailVerified": True}
    assert firebase_auth.is_legacy_owner({"uid": "bound-uid"})
    assert firebase_auth.is_legacy_owner(owner)
    assert not firebase_auth.is_legacy_owner({**owner, "emailVerified": False})
    assert not firebase_auth.is_legacy_owner({**owner, "email": "student@example.com"})
    monkeypatch.delenv("NEXTNOOTBOOK_OWNER_EMAIL")
    assert not firebase_auth.is_legacy_owner(owner)


def test_owner_is_never_blocked_by_allowances(monkeypatch, tmp_path):
    monkeypatch.setenv("NEXTNOOTBOOK_USAGE_DB", str(tmp_path / "usage.sqlite"))
    for uid in ["owner", "member"]:
        usage.register_account({"uid": uid, "email": None, "name": uid})
        usage.set_policy(
            uid,
            {
                **usage.DEFAULT_POLICY,
                "monthly_tokens": 1,
                "storage_bytes": 1,
                "disabled": True,
            },
        )
    with workspace_scope(Workspace("owner", True, True)):
        usage.settle(usage.reserve("model", 1000))
        usage.claim_file("source.pdf", 10_000)
    assert usage.summary("owner")["used"]["tokens"] == 1000
    with workspace_scope(Workspace("member")):
        with pytest.raises(Exception):
            usage.reserve("model", 1000)
        with pytest.raises(Exception):
            usage.claim_file("source.pdf", 10_000)


def test_lan_http_also_accepts_https_tailnet_origins(account_mode, monkeypatch):
    monkeypatch.setenv("NEXTNOOTBOOK_LAN_HTTP", "true")
    account_mode("http://192.168.2.7:8502,https://studybox.tail1234.ts.net")
    firebase_auth.validate_runtime_configuration()


def test_session_cookie_is_secure_for_https_origins(monkeypatch):
    from types import SimpleNamespace

    def request(origin):
        return SimpleNamespace(headers={"origin": origin})

    monkeypatch.setenv("NEXTNOOTBOOK_INSECURE_LOCAL_COOKIES", "true")
    assert firebase_auth.secure_cookie(request("https://studybox.tail1234.ts.net"))
    assert not firebase_auth.secure_cookie(request("http://192.168.2.7:8502"))
    monkeypatch.delenv("NEXTNOOTBOOK_INSECURE_LOCAL_COOKIES")
    assert firebase_auth.secure_cookie(request("http://192.168.2.7:8502"))
