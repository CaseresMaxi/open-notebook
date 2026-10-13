"""Turn rendered chat/summary Markdown into text that reads naturally aloud."""

import re
from typing import Callable

# OpenAI accepts 4096 characters per request; stay below it with sentence cuts.
CHUNK_CHARS = 3500


def _table_row(match: re.Match[str]) -> str:
    cells = [cell.strip() for cell in match.group(1).split("|")]
    return "\n" + ", ".join(cell for cell in cells if cell) + "\n"


_RULES: list[tuple[re.Pattern[str], str | Callable[[re.Match[str]], str]]] = [
    (re.compile(r"<!--.*?-->", re.S), " "),
    (re.compile(r"```.*?```", re.S), " "),
    (re.compile(r"\$\$.*?\$\$", re.S), " "),
    (re.compile(r"<[^>\n]+>"), " "),
    (re.compile(r"!\[[^\]]*\]\([^)]*\)"), " "),
    (re.compile(r"\[\[[^\]]*\]\]"), " "),
    (re.compile(r"\[(?:source|note|insight|source_insight):[^\]]*\]"), " "),
    (re.compile(r"\[([^\]]+)\]\([^)]*\)"), r"\1"),
    # Tables: drop separator rows, read each row as one comma-separated phrase.
    (re.compile(r"^[ \t]*\|?[ \t]*:?-{3,}[-:| \t]*$", re.M), ""),
    (re.compile(r"^[ \t]*\|(.*)\|[ \t]*$", re.M), _table_row),
    (re.compile(r"`([^`]*)`"), r"\1"),
    (re.compile(r"^[ \t]*(?:-{3,}|\*{3,}|_{3,})[ \t]*$", re.M), ""),
    # Headings and list items become their own sentences.
    (re.compile(r"^[ \t]{0,3}#{1,6}[ \t]*(.*)$", re.M), r"\n\1\n"),
    (re.compile(r"^[ \t]*(?:[-*+]|\d+[.)])[ \t]+(.*)$", re.M), r"\n\1\n"),
    (re.compile(r"^[ \t]*>[ \t]?", re.M), ""),
    (re.compile(r"(\*\*|__|\*|_|~~)(?=\S)(.+?)(?<=\S)\1"), r"\2"),
]


def speech_text(markdown: str) -> str:
    text = markdown
    for pattern, replacement in _RULES:
        text = pattern.sub(replacement, text)
    lines = [re.sub(r"[ \t]+", " ", line).strip() for line in text.splitlines()]
    paragraphs, current = [], []
    for line in lines:
        if line:
            current.append(line)
        elif current:
            paragraphs.append(" ".join(current))
            current = []
    if current:
        paragraphs.append(" ".join(current))
    # Pause between paragraphs and list items that lack final punctuation.
    return "\n\n".join(p if p[-1] in ".!?:;…" else p + "." for p in paragraphs).strip()


def speech_chunks(text: str, limit: int = CHUNK_CHARS) -> list[str]:
    """Split on paragraph, then sentence, then word boundaries under `limit`."""
    chunks: list[str] = []
    current = ""
    pieces = re.split(r"(?<=[.!?…])\s+|\n{2,}", text)
    for piece in pieces:
        piece = piece.strip()
        while len(piece) > limit:
            cut = piece.rfind(" ", 0, limit)
            cut = cut if cut > 0 else limit
            if current:
                chunks.append(current)
                current = ""
            chunks.append(piece[:cut].strip())
            piece = piece[cut:].strip()
        if not piece:
            continue
        if current and len(current) + 1 + len(piece) > limit:
            chunks.append(current)
            current = piece
        else:
            current = f"{current} {piece}".strip()
    if current:
        chunks.append(current)
    return chunks
