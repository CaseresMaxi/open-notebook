"""Readable, source-faithful note labels without another provider request."""

import html
import re

DEFAULT_TITLES = {
    "",
    "new note",
    "nueva nota",
    "untitled note",
    "nota sin título",
    "product.newnote",
}


def note_metadata(content: str | None) -> tuple[str, str]:
    text = content or ""
    text = re.sub(r"<!--.*?-->|```.*?```", "", text, flags=re.S)
    text = re.sub(r"!\[[^]]*\]\([^)]*\)", "", text)
    text = re.sub(r"\[([^]]+)\]\([^)]*\)", r"\1", text)
    text = re.sub(r"\[(?:source|note):[^]]*\]", "", text)
    text = re.sub(r"<[^>]*>", "", text)
    heading_first = bool(re.match(r"\s*#{1,6}\s", text))
    text = re.sub(r"(?m)^\s*(?:#{1,6}\s+|[-*+]\s+|\d+[.)]\s+|>\s*)", "", text)
    text = html.unescape(re.sub(r"[*_`~]", "", text))
    lines = [" ".join(line.split()) for line in text.splitlines() if line.strip()]
    first = re.split(r"(?<=[.!?])\s", lines[0])[0] if lines else "New note"
    title = " ".join(first.split()[:12]).rstrip(".!?:;")
    if len(title) > 90:
        title = title[:87].rsplit(" ", 1)[0] + "…"
    description = " ".join(lines[1:] if heading_first and len(lines) > 1 else lines)
    if len(description) > 180:
        description = description[:177].rsplit(" ", 1)[0] + "…"
    return title or "New note", description
