# ADR-029: Inline Arc components and Decisions API routing in chat

## Status

Accepted (personal fork, `main`).

## Context

Chat answers could only show charts and tables as generated HTML figures, produced in a multi-round tool loop with its own review call. The composer's visual toggle is on by default, so most turns entered that loop even when no figure was needed, adding seconds and tokens. OpenAI's Decisions API (`POST /v1/decisions`, `gpt-6-luna`) answers fixed classification questions in a few hundred milliseconds.

## Decision

- Answers may contain fenced ```arc blocks with one JSON object of a closed set of types (line, bar, donut, waffle, table, metrics, gauge, steps, accordion, callout). The API validates them (`open_notebook/utils/arc_blocks.py`) and drops malformed or excess blocks before saving. `MarkdownRenderer` renders them with free (MIT) Arc components, loaded on demand, so they also work in saved notes. Copy and read-aloud get a Markdown rendering.
- When an OpenAI credential (or `OPENAI_API_KEY`) exists, each chat turn (`open_notebook/utils/chat_routing.py`) starts the ordinary answer immediately and asks the Decisions API, in parallel, whether the visual tool loop is needed, which presentation fits and how much reasoning the turn deserves. The speculative answer is kept unless the decision needs the tool loop (which also gets the decided effort) or a confident component presentation (restarted with a hint). `OPEN_NOTEBOOK_DECISIONS=off` disables routing.
- Without the Decisions API, the historic behaviour stands: the toggle or an explicit request enters the tool loop.

## Consequences

Turns that need no figure skip the tool loop, and routing never waits on the common path. A turn restarted for tools or a component pays the decision latency once, and cancelled speculative calls can still bill input tokens. The visual toggle now allows the tool loop instead of forcing it whenever the Decisions API is available.
