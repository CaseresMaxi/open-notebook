"""@mentions of notebook sources and notes in chat messages.

The composer sends "@[Title](source:id)"; the frontend also puts every
mentioned document in the turn's context in full. Here the model is told
which documents the student pointed at, so it answers from them first.
"""

import re

MENTION = re.compile(r"@\[([^\]\n]{1,200})\]\(((?:source|note):[\w-]+)\)")


def mentions(text: str) -> list[tuple[str, str]]:
    """(title, id) pairs in order, each document once."""
    seen: dict[str, str] = {}
    for title, identifier in MENTION.findall(text):
        seen.setdefault(identifier, title)
    return [(title, identifier) for identifier, title in seen.items()]


def plain_mentions(text: str) -> str:
    return MENTION.sub(lambda match: f"@{match.group(1)}", text)


def mention_instructions(text: str) -> str:
    found = mentions(text)
    if not found:
        return ""
    listed = "\n".join(f"- [{identifier}] {title}" for title, identifier in found)
    return (
        "\n\n# MENTIONED DOCUMENTS\n"
        "In the latest message the student explicitly referenced these documents, written "
        "as @[Title](id):\n"
        f"{listed}\n"
        'Their full content is in the CONTEXT. Treat the reference as "this document": base '
        "the answer on them first, cite them by id, and say so if they do not cover the question. "
        "When asked to take questions or exercises from them (for example to build a practice "
        "test), reuse the document's own items faithfully, keeping their wording and options, "
        "and only add new ones if the student asks for more."
    )
