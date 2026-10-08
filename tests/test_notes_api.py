from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def client():
    """Create test client after environment variables have been cleared by conftest."""
    from api.main import app

    return TestClient(app)


class TestNoteCreation:
    """Test suite for Note API endpoints."""

    @patch("api.routers.notes.Note")
    def test_create_note_returns_command_id(self, mock_note_cls, client):
        """Test that creating a note returns the embed command_id."""
        mock_note = AsyncMock()
        mock_note.id = "note:abc123"
        mock_note.title = "Test Note"
        mock_note.content = "Some content"
        mock_note.note_type = "human"
        mock_note.created = "2026-01-01T00:00:00Z"
        mock_note.updated = "2026-01-01T00:00:00Z"
        mock_note.save.return_value = "command:embed123"
        mock_note.add_to_notebook = AsyncMock()
        mock_note_cls.return_value = mock_note

        response = client.post(
            "/api/notes",
            json={"content": "Some content", "note_type": "human"},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["command_id"] == "command:embed123"
        assert data["id"] == "note:abc123"

    @patch("api.routers.notes.Note")
    def test_create_note_command_id_none_when_no_content_embedding(
        self, mock_note_cls, client
    ):
        """Test that command_id is None when save returns None (no embedding)."""
        mock_note = AsyncMock()
        mock_note.id = "note:abc456"
        mock_note.title = "Empty Note"
        mock_note.content = "Some content"
        mock_note.note_type = "human"
        mock_note.created = "2026-01-01T00:00:00Z"
        mock_note.updated = "2026-01-01T00:00:00Z"
        mock_note.save.return_value = None
        mock_note.add_to_notebook = AsyncMock()
        mock_note_cls.return_value = mock_note

        response = client.post(
            "/api/notes",
            json={"content": "Some content", "note_type": "human"},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["command_id"] is None


class TestNoteUpdate:
    """Test suite for Note update endpoint."""

    @patch("api.routers.notes.Note")
    def test_update_note_returns_command_id(self, mock_note_cls, client):
        """Test that updating a note returns the embed command_id."""
        mock_note = AsyncMock()
        mock_note.id = "note:abc123"
        mock_note.title = "Test Note"
        mock_note.content = "Original content"
        mock_note.note_type = "human"
        mock_note.created = "2026-01-01T00:00:00Z"
        mock_note.updated = "2026-01-01T00:00:00Z"
        mock_note.save.return_value = "command:embed789"
        mock_note_cls.get = AsyncMock(return_value=mock_note)

        response = client.put(
            "/api/notes/note:abc123",
            json={"content": "Updated content"},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["command_id"] == "command:embed789"

    @patch("api.routers.notes.Note")
    def test_update_note_command_id_none_when_no_embedding(self, mock_note_cls, client):
        """Test that command_id is None on update when no embedding is triggered."""
        mock_note = AsyncMock()
        mock_note.id = "note:abc123"
        mock_note.title = "Test Note"
        mock_note.content = "Some content"
        mock_note.note_type = "human"
        mock_note.created = "2026-01-01T00:00:00Z"
        mock_note.updated = "2026-01-01T00:00:00Z"
        mock_note.save.return_value = None
        mock_note_cls.get = AsyncMock(return_value=mock_note)

        response = client.put(
            "/api/notes/note:abc123",
            json={"title": "Updated Title"},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["command_id"] is None


class TestStudySummaryLists:
    def test_summary_list_loads_content_and_excludes_other_ai_notes(self, client):
        from types import SimpleNamespace

        marker = "<!-- open-notebook:study-summary:v1 -->"
        saved_summary = SimpleNamespace(
            id="note:summary",
            title="Summary",
            content=marker + "\nActual summary",
            note_type="ai",
            created="2026-10-08",
            updated="2026-10-08",
        )
        other_ai_note = SimpleNamespace(
            id="note:ordinary",
            title="AI answer",
            content="Ordinary saved chat answer",
            note_type="ai",
            created="2026-10-08",
            updated="2026-10-08",
        )
        notebook = AsyncMock()
        notebook.get_notes.return_value = [saved_summary, other_ai_note]
        with patch(
            "open_notebook.domain.notebook.Notebook.get",
            new=AsyncMock(return_value=notebook),
        ):
            response = client.get(
                "/api/notes",
                params={"notebook_id": "notebook:one", "summaries_only": True},
            )
        assert response.status_code == 200
        notebook.get_notes.assert_awaited_once_with(include_content=True)
        assert [item["id"] for item in response.json()] == ["note:summary"]
        assert response.json()[0]["content"].startswith(marker)

    def test_normal_list_keeps_the_lightweight_projection(self, client):
        notebook = AsyncMock()
        notebook.get_notes.return_value = []
        with patch(
            "open_notebook.domain.notebook.Notebook.get",
            new=AsyncMock(return_value=notebook),
        ):
            response = client.get("/api/notes", params={"notebook_id": "notebook:one"})
        assert response.status_code == 200
        notebook.get_notes.assert_awaited_once_with()
