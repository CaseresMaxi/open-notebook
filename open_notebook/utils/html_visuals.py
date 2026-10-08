"""Keep generated visuals declarative and self-contained before persistence."""

from html import escape
from html.parser import HTMLParser


class _VisualParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=False)
        self.parts: list[str] = []
        self.hidden = 0
        self.requires_scripts = False

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if (
            tag in {"script", "canvas"}
            or any(name.startswith("on") for name, _ in attrs)
            or (
                tag == "button"
                and not any(name == "popovertarget" for name, _ in attrs)
            )
        ):
            self.requires_scripts = True
        if tag in {"script", "iframe", "object", "embed"}:
            self.hidden += 1
            return
        if self.hidden or tag in {
            "meta",
            "base",
            "link",
            "html",
            "head",
            "body",
            "form",
        }:
            return
        if tag in {"animate", "set", "animatetransform", "animatemotion"} and any(
            name == "attributename"
            and (value or "").lower()
            in {"href", "xlink:href", "src", "action", "formaction"}
            for name, value in attrs
        ):
            return
        kept = []
        for name, value in attrs:
            if name.startswith("on") or name in {
                "action",
                "formaction",
                "srcdoc",
                "target",
            }:
                continue
            if name in {"href", "xlink:href"} and not (value or "").startswith("#"):
                continue
            if name in {"src", "poster"} and not (value or "").startswith(
                "data:image/"
            ):
                continue
            kept.append(
                name if value is None else f'{name}="{escape(value, quote=True)}"'
            )
        self.parts.append(f"<{tag}{' ' if kept else ''}{' '.join(kept)}>")

    def handle_startendtag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        self.handle_starttag(tag, attrs)
        self.handle_endtag(tag)

    def handle_endtag(self, tag: str) -> None:
        if tag in {"script", "iframe", "object", "embed"}:
            self.hidden = max(0, self.hidden - 1)
            return
        if not self.hidden and tag not in {
            "meta",
            "base",
            "link",
            "html",
            "head",
            "body",
            "form",
        }:
            self.parts.append(f"</{tag}>")

    def handle_data(self, data: str) -> None:
        if not self.hidden:
            self.parts.append(data)

    def handle_entityref(self, name: str) -> None:
        if not self.hidden:
            self.parts.append(f"&{name};")

    def handle_charref(self, name: str) -> None:
        if not self.hidden:
            self.parts.append(f"&#{name};")


def sanitize_visual_html(value: str) -> str:
    parser = _VisualParser()
    parser.feed(value)
    parser.close()
    return "".join(parser.parts).strip()


def requires_visual_scripts(value: str) -> bool:
    parser = _VisualParser()
    parser.feed(value)
    parser.close()
    return parser.requires_scripts
