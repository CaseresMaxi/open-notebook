# ADR-018: Declarative HTML visual artifacts

## Status

Accepted in the personal fork; outside the frozen initial upstream exam contribution.

## Context

Raster generation often distorts labels and complex educational diagrams. Chat and exam figures already share positioned attachments and private figure IDs. Generated code must not run with the application's origin or credentials.

## Decision

Add a typed `HtmlVisual` alongside validated raster `ChatImage` output attachments. The selected chat model supplies bounded, self-contained HTML/CSS/SVG through `render_html_visual`; charts, tables, diagrams and animations prefer this tool. Photos and artistic raster requests keep the existing image adapter. User uploads and student answer images remain raster-only.

Persist the HTML, accessible description and caption in the existing flexible figure pool and chat metadata. Existing `[[image:N]]` positions and `figureN` exam IDs work for both representations, with no database migration. Generation, grading and subsequent chat turns receive the actual HTML as untrusted figure content, never as a fabricated image URL.

Render code only inside an opaque-origin iframe with an empty sandbox permission list and restrictive CSP. Remove scripts, embedded frames, metadata, forms, event handlers, navigation links and external image attributes before persistence. The rendering tool rejects scripts, canvas and ordinary script-dependent buttons, prompting a bounded correction to declarative controls before attaching the figure. CSS/SVG animations and declarative controls are supported; generated JavaScript, canvas, external resources and libraries are intentionally unavailable. Reduced-motion styling disables CSS animation. The fixed-height inline viewport scrolls when needed; expansion opens a taller dialog. Do not inject generated markup into the application's DOM.

## Consequences

Labels and geometry are represented directly, and visuals can be reused in questions without another paid image request. HTML is still model-generated: scientific correctness requires the same scrutiny as generated explanations. Interactive JavaScript simulations would require a separate runtime/security decision. Historical raster figures remain compatible. CSP provides additional resource isolation beyond sanitization; this is not a general-purpose HTML hosting feature.

## Personal fork follow-up: source fidelity

The user's subsequent work is maintained only on `CaseresMaxi/open-notebook` branch `feature/source-faithful-visuals`. The initial upstream exam contribution is frozen at `706c2ee`; this HTML/runtime follow-up is outside that upstream PR.

A source-bearing generation now requires a structured visual brief. Page citations are accepted only after the original pixels reached the model in a previous turn; batching a preview and claimed inspection together does not satisfy this gate. The brief records purpose, observations, preserved invariants, deliberate changes and concrete checks. Missing-original conceptual fallbacks must quote a bounded excerpt actually returned from the allowed source; they cannot use the adaptation basis or fabricate a page citation.

Before attachment, a separately provisioned model compares the actual generated HTML/CSS/SVG with the inspected original page pixels and the brief. Rejected code returns actionable issues for correction, with at most six review invocations per turn and bounded tool rounds/calls. This checks semantic consistency, not a rendered screenshot: the reviewer is explicitly told that it has not executed HTML. Development verification must still compare actual browser renders against real source pages. There is no claim of perfect scientific fidelity.

Save basis, references and disclosed changes with each artifact, including the exam figure pool. Public inline-quiz messages and student exam endpoints remove observations/notes before submission; grading and saved review retain the evidence. No schema migration is needed because existing figure objects are flexible. The repository Codex skill and runtime prompts have separate roles: development guidance does not replace application enforcement.
