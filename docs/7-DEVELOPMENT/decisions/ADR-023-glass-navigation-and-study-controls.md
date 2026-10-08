# ADR-023: Glass navigation and study controls

- Status: Accepted in personal fork
- Date: 2026-10-08

## Context

The product needs the glass material and selection motion used in the user's Instasent reference, fewer global navigation entries, standard tables, and one scroll owner per activity. Operational chat controls should not occupy the study interface.

## Decision

- Use `quick-liquid` 0.1.2 with the material calibration from Instasent's iOS glass for sidebar navigation and segmented activity/view controls. Keep reading surfaces opaque. Load the engine lazily only with hardware acceleration and suitable user preferences. Solid materials cover SSR, software rendering, reduced motion/transparency and forced colors. Destroy observers and effects on unmount.
- Use shared Motion layout selections with Arc spring tokens. Retain Radix tab semantics and keyboard navigation, and the persistent chat pane/draft.
- Keep global navigation to notebooks, profile and payments. Study activities remain inside notebooks; settings are available separately.
- Use the free Arc sortable-data-table for application record tables and Markdown tables. A shared adapter preserves rich Markdown cell content. Source-library sorting and pagination still use the API; no duplicate data store is introduced. Responsive grid tracks must have a zero minimum so table contents cannot widen the page.
- Radix ScrollArea owns the chat scrollbar; its native viewport scrollbar stays hidden. Arc drawers own their body scrolling. The session drawer separates its close button from the create-session action.
- Put context/memory and composer model/visual configuration in Arc drawers. Display these controls only when `(NODE_ENV=development or NEXT_PUBLIC_ENABLE_DEVELOPER_TOOLS=true)` **and** the URL has `developer=1`. Production defaults hide them. This is a presentation switch, not an authorization boundary. Explicit user image requests continue to activate visual tools normally.

## Operations

For local frontend development, append `?developer=1` to a notebook or source URL. An explicitly configured production frontend requires `NEXT_PUBLIC_ENABLE_DEVELOPER_TOOLS=true` **at build time** and the same URL flag. Do not enable this in the ordinary study deployment. Sessions, sources and exam generation remain available without the flag.

## Consequences

The effects have a conservative solid fallback rather than requiring a GPU. Arc components remain vendored and can receive small integration extensions for localized accessibility labels. The backend context APIs and stored conversations are unchanged. This work stays on the personal fork branch; upstream's initial exam contribution remains frozen.
