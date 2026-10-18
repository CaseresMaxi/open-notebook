"""Keep generated visuals self-contained before persistence.

Declarative visuals lose every script. Scripted visuals keep inline scripts
and event handlers: they run in an opaque-origin sandbox whose CSP blocks
network access, and ``script_violations`` rejects code that reaches for
network, navigation, storage or the embedding page before it is attached.
"""

import re
from html import escape
from html.parser import HTMLParser

_GLOBAL = r"\b(?:window|self|globalThis|document)\s*\.\s*"
_FORBIDDEN_SCRIPT = {
    "network requests": r"\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|RTCPeerConnection|sendBeacon)\b",
    "imported code": r"\bimport\s*\(|\bimportScripts\b|\b(?:Shared)?Worker\s*\(",
    "navigation": r"(?<![\w$.])location\b|"
    + _GLOBAL
    + r"(?:location|open)\b|\.href\s*=|\bsetAttribute(?:NS)?\s*\([^,)]*['\"](?:xlink:)?(?:href|src|action|formaction)['\"]",
    "storage or cookies": r"\b(?:localStorage|sessionStorage|indexedDB)\b|"
    + _GLOBAL
    + r"cookie\b",
    # A tree node's .parent is fine; the global parent/top/opener are not.
    "the embedding page": r"(?<![\w$.])(?:parent|top|opener|frameElement)\s*\.|"
    + _GLOBAL
    + r"(?:parent|top|opener|frameElement)\b|\bpostMessage\b",
    "dynamic code": r"\beval\s*\(|\bFunction\s*\(|\bset(?:Timeout|Interval)\s*\(\s*['\"`]",
}


class _VisualParser(HTMLParser):
    def __init__(self, allow_scripts: bool = False) -> None:
        super().__init__(convert_charrefs=False)
        self.allow_scripts = allow_scripts
        self.parts: list[str] = []
        self.hidden = 0
        self.requires_scripts = False
        self.scripts: list[str] = []
        self.in_script = False

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
        if tag == "script" and self.allow_scripts and not self.hidden:
            # Inline code only: an external src is dropped with its element.
            if any(name == "src" for name, _ in attrs):
                self.hidden += 1
            else:
                self.in_script = True
                self.parts.append("<script>")
            return
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
            if name.startswith("on") and self.allow_scripts:
                self.scripts.append(value or "")
            elif name.startswith("on") or name in {
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
        if tag == "script" and self.in_script:
            self.in_script = False
            self.parts.append("</script>")
            return
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
        if self.in_script:
            self.scripts.append(data)
        if not self.hidden:
            self.parts.append(data)

    def handle_entityref(self, name: str) -> None:
        if not self.hidden:
            self.parts.append(f"&{name};")

    def handle_charref(self, name: str) -> None:
        if not self.hidden:
            self.parts.append(f"&#{name};")


def sanitize_visual_html(value: str, allow_scripts: bool = False) -> str:
    parser = _VisualParser(allow_scripts)
    parser.feed(value)
    parser.close()
    return "".join(parser.parts).strip()


def script_violations(value: str) -> list[str]:
    """What a scripted visual's code reaches for beyond its own document."""
    parser = _VisualParser(allow_scripts=True)
    parser.feed(value)
    parser.close()
    code = "\n".join(parser.scripts)
    return [
        reason
        for reason, pattern in _FORBIDDEN_SCRIPT.items()
        if re.search(pattern, code)
    ]


def requires_visual_scripts(value: str) -> bool:
    parser = _VisualParser()
    parser.feed(value)
    parser.close()
    return parser.requires_scripts
