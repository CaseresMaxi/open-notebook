"""Cross-account boundaries and atomic budgets, including threaded graph work."""

import asyncio
from concurrent.futures import ThreadPoolExecutor
from contextvars import copy_context
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from langchain_core.language_models.fake_chat_models import FakeListChatModel

from open_notebook import usage
from open_notebook.ai.usage_callback import UsageCallback
from open_notebook.database.repository import get_database_name
from open_notebook.exceptions import InvalidInputError, NotFoundError, RateLimitError
from open_notebook.workspace_commands import get_command_status, workspace_command
from open_notebook.workspaces import (
    Workspace,
    data_root,
    platform_scope,
    require_owned_path,
    workspace_scope,
)


@pytest.fixture(autouse=True)
def isolated_runtime(monkeypatch, tmp_path):
    monkeypatch.setenv("NEXTNOOTBOOK_DATA_ROOT", str(tmp_path / "files"))
    monkeypatch.setenv("NEXTNOOTBOOK_USAGE_DB", str(tmp_path / "usage.sqlite"))
    monkeypatch.setenv("OPEN_NOTEBOOK_ENCRYPTION_KEY", "test-signing-key")
    monkeypatch.setenv("NEXTNOOTBOOK_STORAGE_BACKEND", "local")
    for uid in ["alice", "bob"]:
        usage.register_account(
            {"uid": uid, "email": uid + "@example.invalid", "name": uid}
        )


def test_database_scope_cannot_be_selected_by_client_identifiers():
    legacy = get_database_name()
    with workspace_scope(Workspace("alice")):
        alice = get_database_name()
        with platform_scope():
            assert get_database_name() == legacy
        assert get_database_name() == alice
        with workspace_scope(Workspace("bob")):
            assert get_database_name() != alice
        assert get_database_name() == alice
    assert get_database_name() == legacy


def test_private_uploads_cannot_read_other_account_or_follow_symlink(tmp_path):
    with workspace_scope(Workspace("alice")):
        alice_path = data_root() / "uploads" / "exam.pdf"
        alice_path.parent.mkdir()
        alice_path.write_bytes(b"private")
    with workspace_scope(Workspace("bob")):
        with pytest.raises(InvalidInputError):
            require_owned_path(alice_path)
        link = data_root() / "leak.pdf"
        link.symlink_to(alice_path)
        with pytest.raises(InvalidInputError):
            require_owned_path(link)
    with workspace_scope(Workspace("owner", True, True)):
        with pytest.raises(InvalidInputError):
            require_owned_path(alice_path)


@pytest.mark.asyncio
async def test_concurrent_requests_and_manual_threads_keep_owner():
    async def request(uid):
        with workspace_scope(Workspace(uid)):
            before = get_database_name()
            await asyncio.sleep(0)
            assert get_database_name() == before
            with ThreadPoolExecutor() as executor:
                assert (
                    executor.submit(copy_context().run, get_database_name).result()
                    == before
                )
            return before

    names = await asyncio.gather(request("alice"), request("bob"))
    assert names[0] != names[1]


def test_budgets_are_atomic_across_workers():
    usage.set_policy(
        "alice",
        {**usage.DEFAULT_POLICY, "monthly_tokens": 100, "concurrent_calls": 100},
    )

    def attempt(_):
        with workspace_scope(Workspace("alice")):
            try:
                return usage.reserve("model", 10)
            except RateLimitError:
                return None

    with ThreadPoolExecutor(max_workers=12) as executor:
        reservations = list(executor.map(attempt, range(30)))
    assert sum(x is not None for x in reservations) == 10
    assert usage.summary("alice")["used"]["tokens"] == 100
    assert usage.summary("bob")["used"]["tokens"] == 0


def test_retries_and_failed_calls_remain_charged_and_settle_once():
    with workspace_scope(Workspace("alice")):
        reservation = usage.reserve("model", 50)
        usage.settle(reservation, state="failed")
        usage.settle(reservation, actual=1)
        assert usage.summary("alice")["used"]["tokens"] == 50
        with pytest.raises(RuntimeError):
            with usage.metered("model", 50):
                raise RuntimeError("uncertain provider result")
        assert usage.summary("alice")["used"]["tokens"] == 100


def test_file_size_limit_and_idempotent_replacement():
    usage.set_policy("alice", {**usage.DEFAULT_POLICY, "storage_bytes": 10})
    with workspace_scope(Workspace("alice")):
        usage.claim_file("a", 8)
        usage.claim_file("a", 8)
        with pytest.raises(RateLimitError):
            usage.claim_file("b", 3)
        usage.release_file("a")
        usage.claim_file("b", 3)
    assert usage.summary("alice")["used"]["storage_bytes"] == 3


def test_real_langchain_call_is_blocked_before_model_runs():
    usage.set_policy("alice", {**usage.DEFAULT_POLICY, "monthly_tokens": 0})
    model = FakeListChatModel(
        responses=["should never run"], callbacks=[UsageCallback("model", 20)]
    )
    with workspace_scope(Workspace("alice")):
        with pytest.raises(RateLimitError):
            model.invoke("test")
    assert usage.summary("alice")["used"]["calls"] == 0


@pytest.mark.asyncio
async def test_worker_rejects_modified_owner_signature():
    from open_notebook.workspace_commands import _signature

    payload = {"uid": "alice", "admin": False, "legacy": False}

    @workspace_command
    async def task(input_data):
        return get_database_name()

    input_data = SimpleNamespace(
        execution_context=SimpleNamespace(
            user_context={"workspace": payload, "signature": _signature(payload)}
        )
    )
    result = await task(input_data)
    assert result == Workspace("alice").database
    input_data.execution_context.user_context["workspace"] = {**payload, "uid": "bob"}
    with pytest.raises(ValueError, match="signature"):
        await task(input_data)


@pytest.mark.asyncio
async def test_job_status_does_not_reveal_other_owner(monkeypatch):
    monkeypatch.setattr(
        "open_notebook.workspace_commands.repo_query",
        AsyncMock(return_value=[{"context": {"workspace": {"uid": "alice"}}}]),
    )
    lookup = AsyncMock()
    monkeypatch.setattr("open_notebook.workspace_commands.original_status", lookup)
    with workspace_scope(Workspace("bob")):
        with pytest.raises(NotFoundError):
            await get_command_status("command:any")
    lookup.assert_not_called()


@pytest.mark.asyncio
async def test_private_source_addresses_rejected_in_account_mode():
    from open_notebook.utils.url_validation import validate_url

    with workspace_scope(Workspace("alice")):
        with pytest.raises(ValueError, match="public"):
            await validate_url("http://127.0.0.1:8000", "source")


@pytest.mark.asyncio
async def test_account_record_settings_are_not_cached_between_users(monkeypatch):
    from open_notebook.domain.content_settings import ContentSettings
    from open_notebook.workspaces import current_workspace

    async def settings(*args, **kwargs):
        workspace = current_workspace()
        assert workspace is not None
        return {
            "default_embedding_option": "always"
            if workspace.uid == "alice"
            else "never"
        }

    monkeypatch.setattr("open_notebook.domain.base.repo_query", settings)
    with workspace_scope(Workspace("alice")):
        alice = await ContentSettings.get_instance()
    with workspace_scope(Workspace("bob")):
        bob = await ContentSettings.get_instance()
    assert alice is not bob
    assert isinstance(alice, ContentSettings) and isinstance(bob, ContentSettings)
    assert alice.default_embedding_option == "always"
    assert bob.default_embedding_option == "never"


@pytest.mark.parametrize(
    "configuration",
    ["missing", "wildcard", "http-public", "project-mismatch", "invalid-mode"],
)
def test_account_mode_refuses_unsafe_configuration(monkeypatch, configuration):
    from api.firebase_auth import validate_runtime_configuration
    from open_notebook.exceptions import ConfigurationError

    monkeypatch.setenv("NEXTNOOTBOOK_AUTH_MODE", "firebase")
    monkeypatch.setenv("FIREBASE_PROJECT_ID", "demo-test")
    monkeypatch.setenv("FIREBASE_WEB_CONFIG", '{"projectId":"demo-test"}')
    monkeypatch.setenv("NEXTNOOTBOOK_ALLOWED_ORIGINS", "https://study.example")
    monkeypatch.setenv("CORS_ORIGINS", "https://study.example")
    monkeypatch.delenv("NEXTNOOTBOOK_INSECURE_LOCAL_COOKIES", raising=False)
    if configuration == "missing":
        monkeypatch.delenv("FIREBASE_PROJECT_ID")
    elif configuration == "wildcard":
        monkeypatch.setenv("CORS_ORIGINS", "*")
    elif configuration == "http-public":
        monkeypatch.setenv("NEXTNOOTBOOK_INSECURE_LOCAL_COOKIES", "true")
    elif configuration == "project-mismatch":
        monkeypatch.setenv("FIREBASE_WEB_CONFIG", '{"projectId":"other"}')
    else:
        monkeypatch.setenv("NEXTNOOTBOOK_AUTH_MODE", "fierbase")
    with pytest.raises(ConfigurationError):
        validate_runtime_configuration()


@pytest.mark.asyncio
async def test_shared_source_file_is_retained_after_deleting_one_reference(
    monkeypatch, tmp_path
):
    from open_notebook.domain.base import ObjectModel
    from open_notebook.domain.notebook import Asset, Source

    path = tmp_path / "shared.pdf"
    path.write_bytes(b"original")
    source = Source(id="source:one", title="One", asset=Asset(file_path=str(path)))
    monkeypatch.setattr(ObjectModel, "delete", AsyncMock(return_value=True))
    monkeypatch.setattr(
        "open_notebook.domain.notebook.repo_query",
        AsyncMock(return_value=[{"id": "source:two"}]),
    )
    await source.delete()
    assert path.read_bytes() == b"original"


def test_cloud_original_remains_downloadable_without_local_cache(monkeypatch):
    from api.routers.sources import _is_source_file_available
    from open_notebook.domain.notebook import Asset, Source

    monkeypatch.setenv("NEXTNOOTBOOK_STORAGE_BACKEND", "firebase")
    with workspace_scope(Workspace("alice")):
        path = data_root() / "uploads" / "retained.pdf"
        source = Source(id="source:one", title="One", asset=Asset(file_path=str(path)))
        assert _is_source_file_available(source) is None
        monkeypatch.setenv("NEXTNOOTBOOK_STORAGE_BACKEND", "local")
        assert _is_source_file_available(source) is False
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(b"original")
        assert _is_source_file_available(source) is True
