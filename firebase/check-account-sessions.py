"""Exercise private accounts against Auth emulator and a local isolated SurrealDB namespace."""

import asyncio
import os
import tempfile

if os.environ.get("FIREBASE_AUTH_EMULATOR_HOST") not in {
    "127.0.0.1:9099",
    "localhost:9099",
} or not os.environ.get("GCLOUD_PROJECT", "").startswith("demo-"):
    raise RuntimeError("This test requires the isolated Auth emulator")
os.environ["OPEN_NOTEBOOK_ENCRYPTION_KEY"] = "test-only-runtime-integration-key"
os.environ["NEXTNOOTBOOK_STORAGE_BACKEND"] = "local"
os.environ.update(
    {
        "NEXTNOOTBOOK_AUTH_MODE": "firebase",
        "NEXTNOOTBOOK_ADMIN_EMAIL": "owner@example.invalid",
        "NEXTNOOTBOOK_ALLOWED_ORIGINS": "https://study.example",
        "FIREBASE_WEB_CONFIG": "{}",
        "FIREBASE_PROJECT_ID": "demo-nextnootbook",
        "SURREAL_URL": "ws://127.0.0.1:8000/rpc",
        "SURREAL_USER": "root",
        "SURREAL_PASS": "root",
        "SURREAL_PASSWORD": "root",
        "SURREAL_NAMESPACE": "qa_nextnootbook_accounts_20261010",
        "SURREAL_DATABASE": "integration",
    }
)
root = tempfile.TemporaryDirectory()
os.environ["NEXTNOOTBOOK_DATA_ROOT"] = root.name + "/files"
os.environ["NEXTNOOTBOOK_USAGE_DB"] = root.name + "/usage.sqlite"
os.environ["NEXTNOOTBOOK_LEGACY_OWNER_FILE"] = root.name + "/owner.json"
import firebase_admin
import httpx
from firebase_admin import auth, credentials

from api import firebase_auth

app = firebase_admin.initialize_app(
    credentials.Certificate(os.environ["GOOGLE_APPLICATION_CREDENTIALS"]),
    {"projectId": "demo-nextnootbook"},
    name="runtime-integration",
)
setattr(firebase_auth, "firebase_app", lambda: app)
from langchain_core.messages import HumanMessage
from surreal_commands import CommandInput, CommandOutput, command

from api.main import app as api
from open_notebook.database.async_migrate import AsyncMigrationManager
from open_notebook.database.repository import (
    ensure_record_id,
    get_database_name,
    repo_query,
)
from open_notebook.domain.content_settings import ContentSettings
from open_notebook.graphs.chat import graph
from open_notebook.workspace_commands import submit_command, workspace_command
from open_notebook.workspaces import Workspace, workspace_scope


class ProbeInput(CommandInput):
    value: str


class ProbeOutput(CommandOutput):
    database: str


@command("isolation_probe", app="open_notebook", retry={"enabled": False})
@workspace_command
async def probe(data: ProbeInput) -> ProbeOutput:
    await repo_query("CREATE probe CONTENT $data;", {"data": {"value": data.value}})
    return ProbeOutput(database=get_database_name())


async def main():
    assert os.environ.get("FIREBASE_AUTH_EMULATOR_HOST") in {
        "127.0.0.1:9099",
        "localhost:9099",
    }
    await AsyncMigrationManager().run_migration_up()
    async with httpx.AsyncClient() as emulator:
        clients = []
        uids = []
        for email in [
            "owner@example.invalid",
            "alice@example.invalid",
            "bob@example.invalid",
        ]:
            signup = await emulator.post(
                "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=emulator",
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
                "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=emulator",
                json={
                    "email": email,
                    "password": "Test-password-123",
                    "returnSecureToken": True,
                },
            )
            login.raise_for_status()
            client = httpx.AsyncClient(
                transport=httpx.ASGITransport(app=api),
                base_url="https://study.example",
                headers={"Origin": "https://study.example"},
            )
            session = await client.post(
                "/api/auth/session", json={"idToken": login.json()["idToken"]}
            )
            assert session.status_code == 200, session.text
            clients.append(client)
            uids.append(uid)
        owner, alice, bob = clients
        created = await alice.post(
            "/api/notebooks",
            json={"name": "Alice private", "description": "Only Alice"},
        )
        assert created.status_code == 200, created.text
        notebook_id = created.json()["id"]
        assert (await alice.get("/api/notebooks")).json()[0]["name"] == "Alice private"
        assert (await bob.get("/api/notebooks")).json() == []
        assert (await owner.get("/api/notebooks")).json() == []
        for method, body in [
            ("GET", None),
            ("DELETE", None),
            ("PUT", {"name": "Stolen"}),
        ]:
            response = await bob.request(
                method, "/api/notebooks/" + notebook_id, json=body
            )
            assert response.status_code == 404, (
                method,
                response.status_code,
                response.text,
            )
        assert (await bob.get("/api/admin/accounts")).status_code == 403
        assert (await bob.put("/api/models/defaults", json={})).status_code == 403
        assert (await bob.get("/api/credentials")).status_code == 403
        assert (await owner.get("/api/admin/accounts")).status_code == 200
        with workspace_scope(Workspace(uids[1])):
            settings = await ContentSettings.get_instance()
            assert isinstance(settings, ContentSettings)
            assert (
                settings.default_embedding_option == "always"
                and settings.auto_delete_files == "no"
            )
            graph.update_state(
                {"configurable": {"thread_id": "same-id"}},
                {"messages": [HumanMessage(content="Alice secret")]},
            )
            job = str(
                submit_command(
                    "open_notebook", "isolation_probe", {"value": "private-worker"}
                )
            )
        with workspace_scope(Workspace(uids[2])):
            assert not graph.get_state(
                {"configurable": {"thread_id": "same-id"}}
            ).values
            settings = await ContentSettings.get_instance()
            assert isinstance(settings, ContentSettings)
            assert settings is not None and settings.auto_delete_files == "no"
        response = await bob.get("/api/commands/jobs/" + job)
        assert response.status_code == 404, response.text
        from surreal_commands.core.service import command_service

        rows = await repo_query("SELECT * FROM $id;", {"id": ensure_record_id(job)})
        row = rows[0]
        await command_service.execute_command(
            job, "open_notebook.isolation_probe", row["args"], row["context"]
        )
        with workspace_scope(Workspace(uids[1])):
            assert len(await repo_query("SELECT * FROM probe;")) == 1
        with workspace_scope(Workspace(uids[2])):
            assert await repo_query("SELECT * FROM probe;") == []
        assert (await alice.get("/api/commands/jobs/" + job)).status_code == 200
        for client in clients:
            await client.aclose()
    await repo_query("REMOVE NAMESPACE IF EXISTS qa_nextnootbook_accounts_20261010;")
    print(
        "PASS: real Firebase sessions, real SurrealDB per-account databases, cross-user CRUD denial, private checkpoints, signed background job execution, operator permissions and study defaults"
    )


asyncio.run(main())
