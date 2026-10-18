# ADR-032: Concept maps, test intent, @mentions and scripted HTML visuals in chat

## Status

Accepted (personal fork, `main`). Amends [ADR-018](ADR-018-html-visual-artifacts.md) (declarative-only HTML visuals) and extends [ADR-029](ADR-029-arc-components-and-turn-decisions.md).

## Context

Students asked for concept maps: the key ideas of a topic, weighted by relevance, and how they connect. As generated HTML they needed the slow visual tool loop, and ADR-018 forbade JavaScript, so a map could not be explored (focus a concept, drag, filter). The model also had no way to build other interactive visuals (simulations, step-through algorithms).

## Decision

- **Concept maps are an arc block** (`concept_map`): concepts with an id, label, one-sentence detail, weight 1-5 and optional group (max 6), plus labelled source→target links. The API validates ids, drops self-loops and duplicate pairs (`open_notebook/utils/arc_blocks.py`). The frontend lays them out deterministically in the panel's real width (`frontend/src/lib/utils/concept-map-layout.ts`) and renders them as an interactive SVG (`ConceptMap.tsx`): size and fill strength show relevance, colour shows group, focusing a concept dims the rest and lists its relations, concepts can be dragged, the view zoomed and filtered to key concepts. Copy and read-aloud get a nested Markdown list.
- **The Decisions API routes to concept maps**: `concept_map` is a presentation choice, so a confident decision restarts the answer with a concept-map hint, and the visual-tools predicate no longer counts concept maps as needing tools. The model may also choose one on its own from the arc instructions.
- **The Decisions API also judges test intent** (`practice_test`): whether the student asks to take an exam, test or practice questions now, as opposed to asking about one. When it answers, that verdict replaces the keyword heuristic for the format buttons, inline-quiz conversion and exam-safe figures; without it, the keyword check (now typo tolerant) still applies.
- **@mentions name specific documents**: the composer offers the notebook's sources and notes after `@`, shows `@Title` while typing and sends `@[Title](source:id)` so the reference persists in the transcript as plain text. The frontend puts every mentioned document in the turn's context in full, on top of the selections and chat focus; the backend (`open_notebook/utils/chat_mentions.py`) lists them in a MENTIONED DOCUMENTS prompt section, and the Decisions API sees plain `@Title`. Source chat does not offer mentions.
- **HTML visuals may carry inline JavaScript** (`HtmlVisual.scripted`). The sanitizer keeps inline `<script>` and event handlers only for scripted visuals and still drops external scripts, links, frames, forms and meta tags. `script_violations` rejects code that names network, navigation, storage, the embedding page or dynamic code, and the tool asks the model to rewrite it. The frame runs scripted visuals with `sandbox="allow-scripts"` (opaque origin, no popups, no top navigation) and a CSP whose only change is `script-src 'unsafe-inline'`; `connect-src`, `img-src` and the rest stay closed.

## Consequences

Concept maps render instantly inside an ordinary answer and work in saved notes. Interactive visuals become possible. The pattern check is a denylist, so obfuscated code could still try to navigate the frame itself to an external URL carrying data the visual contains; the CSP blocks requests but browsers do not enforce `navigate-to`. The data at risk is the visual's own generated content, and the opaque origin keeps cookies, storage and the app out of reach.
