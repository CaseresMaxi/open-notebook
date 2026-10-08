# ADR-018: Declarative HTML visual artifacts

## Status

Proposed (contribution prototype; awaiting upstream design review).

## Context

Raster generation often distorts labels and complex educational diagrams. Chat and exam figures already share positioned attachments and private figure IDs. Generated code must not run with the application's origin or credentials.

## Decision

Add a typed `HtmlVisual` alongside validated raster `ChatImage` output attachments. The selected chat model supplies bounded, self-contained HTML/CSS/SVG through `render_html_visual`; charts, tables, diagrams and animations prefer this tool. Photos and artistic raster requests keep the existing image adapter. User uploads and student answer images remain raster-only.

Persist the HTML, accessible description and caption in the existing flexible figure pool and chat metadata. Existing `[[image:N]]` positions and `figureN` exam IDs work for both representations, with no database migration. Generation, grading and subsequent chat turns receive the actual HTML as untrusted figure content, never as a fabricated image URL.

Render code only inside an opaque-origin iframe with an empty sandbox permission list and restrictive CSP. Remove scripts, embedded frames, metadata, forms, event handlers, navigation links and external image attributes before persistence. The rendering tool rejects scripts, canvas and ordinary script-dependent buttons, prompting a bounded correction to declarative controls before attaching the figure. CSS/SVG animations and declarative controls are supported; generated JavaScript, canvas, external resources and libraries are intentionally unavailable. Reduced-motion styling disables CSS animation. The fixed-height inline viewport scrolls when needed; expansion opens a taller dialog. Do not inject generated markup into the application's DOM.

## Consequences

Labels and geometry are represented directly, and visuals can be reused in questions without another paid image request. HTML is still model-generated: scientific correctness requires the same scrutiny as generated explanations. Interactive JavaScript simulations would require a separate runtime/security decision. Historical raster figures remain compatible. CSP provides additional resource isolation beyond sanitization; this is not a general-purpose HTML hosting feature.
