# ADR-031: Chat focus and live Jupyter notebooks in the notebook chat

- Status: Accepted
- Date: 2026-10-15

## Context

Students want the notebook chat to concentrate on one or a few sources without opening a separate per-source chat, and to work on a Jupyter notebook (ADR-030) together with the chat: ask about a cell, get help with an error they just hit, and try the code the chat proposes.

## Decision

- **Focus is a client-side working mode**, kept per notebook in this tab (`lib/stores/chat-focus-store.ts`), not a saved setting. It is set from a source card's menu, from the crosshair button in the source dialog, or from a notebook cell's "ask the chat" button. While it is set, the chat column overrides the normal context selections: focused sources are sent in full, every other source and every note is left out. The normal selections come back untouched when the focus is cleared.
- **Each turn sends the focus** (`ExecuteChatRequest.focus`, `open_notebook/utils/chat_focus.py`). It is validated with size limits, stored in the checkpoint state for that turn only (reset to `None` when absent) and rendered as a `# FOCUS` section of the system prompt.
- **Live notebooks:** a Jupyter notebook's session (edits, outputs of this session, errors, cells added from the chat) moved from component state to a store with module-level kernels (`lib/stores/jupyter-session-store.ts`). Closing the source dialog keeps Python running and keeps its variables; at most two kernels stay alive (about 200 MB each) and the least recently used one is disposed. When a focused notebook has a session, the chat receives what is on screen (`LiveNotebook`, cells numbered like the UI) and the saved text is reduced to insights to avoid sending it twice.
- **Code from the chat into the notebook:** while a notebook is focused, Python code blocks in answers offer "Add to notebook" (`CodeBlockActionContext` in the Markdown renderer). The code becomes a new cell at the end, marked as coming from the chat; it runs, edits and is explained like any other. Nothing runs automatically.

## Consequences

- No new endpoints and no schema change. A focused turn costs what its sources cost; a live notebook is capped at 60k characters in the prompt.
- The focus and the notebook sessions are lost on reload, by design: they describe what the student is doing now.
- The chat never executes code: the student decides what to add and run, in their own browser.
