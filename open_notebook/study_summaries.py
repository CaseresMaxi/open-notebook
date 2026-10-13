"""Study summaries grounded in the original material: verified verbatim quotes
and genuine figure crops from the source documents."""

import re
import unicodedata
from typing import Optional

from ai_prompter import Prompter
from langchain_core.messages import HumanMessage, SystemMessage

from open_notebook.ai.provision import provision_langchain_model
from open_notebook.database.repository import ensure_record_id, repo_query
from open_notebook.domain.notebook import Note, Notebook, Source, vector_search
from open_notebook.exceptions import (
    InvalidInputError,
    NotFoundError,
    OpenNotebookError,
)
from open_notebook.utils import clean_thinking_content
from open_notebook.utils.chat_images import chat_model_context, message_images
from open_notebook.utils.chat_visuals import invoke_visual_chat
from open_notebook.utils.error_classifier import classify_error
from open_notebook.utils.text_utils import extract_text_content

SUMMARY_MARKER = "<!-- open-notebook:study-summary:v1 -->"
MAX_IMAGES = 3
SOURCE_CHARS = 120_000
TOPIC_SOURCES = 6
TOPIC_RESULTS = 24

_QUOTE_LINE = re.compile(r'^\s*>\s*(?:\*\*)?["“«](.+?)["”»](?:\*\*)?(.*)$')
_IMAGE_MARKER = re.compile(r"\[\[image:(\d+)\]\]")


def _normalize(text: str) -> str:
    text = unicodedata.normalize("NFKC", text).casefold()
    text = re.sub(r"[\"'“”‘’«»`*_]", "", text)
    return re.sub(r"\s+", " ", text).strip()


def keep_verified_quotes(content: str, originals: list[str]) -> str:
    """Drop blockquoted 'quotations' that do not appear verbatim in the material."""
    haystack = _normalize("\n".join(originals))
    kept = []
    for line in content.splitlines():
        match = _QUOTE_LINE.match(line)
        if match and _normalize(match.group(1)) not in haystack:
            continue
        kept.append(line)
    return "\n".join(kept)


def place_images(content: str, count: int) -> str:
    """Remove markers that point at no image; append any image left unplaced."""
    used: set[int] = set()

    def marker(match: re.Match[str]) -> str:
        index = int(match.group(1))
        if 1 <= index <= count and index not in used:
            used.add(index)
            return match.group(0)
        return ""

    content = _IMAGE_MARKER.sub(marker, content)
    missing = [i for i in range(1, count + 1) if i not in used]
    if missing:
        content += "\n\n" + "\n\n".join(f"[[image:{i}]]" for i in missing)
    return content


async def _notebook_source_ids(notebook_id: str) -> set[str]:
    rows = await repo_query(
        "SELECT VALUE in FROM reference WHERE out = $notebook;",
        {"notebook": ensure_record_id(notebook_id)},
    )
    return {str(row) for row in rows}


async def _source_material(notebook_id: str, source_id: str):
    if source_id not in await _notebook_source_ids(notebook_id):
        raise NotFoundError("Source is not part of this notebook")
    source = await Source.get(source_id)
    text = (source.full_text or "").strip()
    if not text:
        raise InvalidInputError("This source has no processed text yet")
    material = f"## [{source_id}] {source.title or 'Source'}\n\n{text[:SOURCE_CHARS]}"
    return material, [text], {source_id}, source


async def _topic_material(notebook_id: str, topic: str):
    results = await vector_search(
        topic, TOPIC_RESULTS, source=True, note=False, notebook_ids=[notebook_id]
    )
    excerpts: dict[str, list[str]] = {}
    titles: dict[str, str] = {}
    for row in results:
        source_id = next(
            (
                str(value)
                for value in (row.get("id"), row.get("parent_id"))
                if str(value or "").startswith("source:")
            ),
            "",
        )
        if not source_id:
            continue
        if source_id not in excerpts and len(excerpts) >= TOPIC_SOURCES:
            continue
        titles[source_id] = row.get("title") or "Source"
        excerpts.setdefault(source_id, []).extend(row.get("matches") or [])
    if not excerpts:
        raise InvalidInputError(
            "No passages in this notebook match that topic. Try other words."
        )
    material = "\n\n".join(
        f"## [{source_id}] {titles[source_id]}\n\n" + "\n\n…\n\n".join(chunks)
        for source_id, chunks in excerpts.items()
    )
    # Quotes are verified against the full originals, not only the excerpts.
    originals = []
    for source_id in excerpts:
        source = await Source.get(source_id)
        originals.append(source.full_text or "")
    return material, originals, set(excerpts), None


async def generate_study_summary(
    notebook_id: str,
    *,
    source_id: Optional[str] = None,
    topic: Optional[str] = None,
    language: str = "the language of the material",
    title: Optional[str] = None,
    model_id: Optional[str] = None,
) -> Note:
    if bool(source_id) == bool(topic and topic.strip()):
        raise InvalidInputError("Choose either a source or a topic")
    await Notebook.get(notebook_id)
    try:
        if source_id:
            material, originals, allowed, source = await _source_material(
                notebook_id, source_id
            )
        else:
            assert topic
            material, originals, allowed, source = await _topic_material(
                notebook_id, topic.strip()
            )
        system = Prompter(prompt_template="study/summary").render(
            data={
                "language": language,
                "topic": (topic or "").strip(),
                "max_images": MAX_IMAGES,
            }
        )
        payload = [
            SystemMessage(content=system),
            HumanMessage(content="Original material:\n\n" + material),
        ]
        model = await provision_langchain_model(
            chat_model_context(payload), model_id, "transformation", max_tokens=8000
        )
        reply = await invoke_visual_chat(
            model,
            payload,
            allowed,
            model_id,
            visual_request=(
                "Attach genuine crops of the original figures, diagrams or tables "
                "that help explain this summary."
            ),
        )
        content = clean_thinking_content(extract_text_content(reply.content)).strip()
        # Marker numbers index this list, so keep its order intact.
        images = message_images(reply)[:MAX_IMAGES]
        content = place_images(keep_verified_quotes(content, originals), len(images))
        if not content.strip():
            raise InvalidInputError("The model returned an empty summary")
    except OpenNotebookError:
        raise
    except Exception as exc:
        error_class, message = classify_error(exc)
        raise error_class(message) from exc

    header = SUMMARY_MARKER
    if source is not None:
        header += f"\n\n[{source.title or 'Source'}](/sources/{source_id})"
    note = Note(
        title=title,
        note_type="ai",
        content=f"{header}\n\n{content}",
        images=[image.model_dump() for image in images],
    )
    await note.save()
    await note.add_to_notebook(notebook_id)
    return note
