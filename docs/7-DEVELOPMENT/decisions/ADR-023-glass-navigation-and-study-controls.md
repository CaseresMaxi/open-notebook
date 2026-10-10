# ADR-023: Glass navigation and study controls

- Status: Accepted in personal fork
- Date: 2026-10-08

## Context

The product needs the glass material and selection motion used in the user's Instasent reference, fewer global navigation entries, standard tables, and one scroll owner per activity. Operational chat controls should not occupy the study interface.

## Decision

- Use `quick-liquid` 0.1.2 with the material calibration from Instasent's iOS glass for sidebar navigation and segmented activity/view controls. Keep reading surfaces opaque. Load the engine lazily only with hardware acceleration and suitable user preferences. Solid materials cover SSR, software rendering, reduced motion/transparency and forced colors. Destroy observers and effects on unmount.
- Keep the shell mounted in the dashboard layout across routes. Existing page shell wrappers yield to that parent through a context marker, preventing duplicate shells and preserving the glass engine, canvas and selection continuity.
- Use shared Motion layout selections with Arc spring tokens. Retain Radix tab semantics and keyboard navigation, and the persistent chat pane/draft.
- Use one rounded, opaque floating chat surface with a restrained shadow; apply the glass lens to the composer and session control. Bound Radix’s content wrapper to the viewport so rich responses wrap on small screens. The sidebar uses a compact brand, quiet quick-create action and a single utilities row, without duplicated account information.
- Position notebook tabs, session controls and the composer above the transcript as independent overlays. Reserve top space for the responsive controls and bottom space measured by a composer ResizeObserver, including attachments and multiline drafts. Keep one viewport and preserve tab semantics and drafts.
- Extend the floating study surface and inset glass activity navigation to sources, notes and summaries. Each library owns one scroll container; compact rows expose real title buttons and named action menus. Group summary source selection and generation without a redundant chat link.
- Align the notebook heading with the reading column and move notebook editing, description, exam creation and lifecycle actions into an Arc drawer. On phones, prioritize the conversation with compact shell/header spacing, one row for tabs and sessions, and full-width answers without an avatar gutter.
- Keep global navigation to notebooks, profile and payments. Study activities remain inside notebooks; settings are available separately.
- Use the free Arc sortable-data-table for application record tables and Markdown tables. A shared adapter preserves rich Markdown cell content. Source-library sorting and pagination still use the API; no duplicate data store is introduced. Responsive grid tracks must have a zero minimum so table contents cannot widen the page.
- Radix ScrollArea owns the chat scrollbar; its native viewport scrollbar stays hidden. Arc drawers own their body scrolling. The session drawer separates its close button from the create-session action.
- Put context/memory and composer model/visual configuration in Arc drawers. Display these controls only when `(NODE_ENV=development or NEXT_PUBLIC_ENABLE_DEVELOPER_TOOLS=true)` **and** the URL has `developer=1`. Production defaults hide them. This is a presentation switch, not an authorization boundary. Visual responses are enabled by default in the composer, client hooks and shared API request model. The developer checkbox can opt out explicitly; explicit user image requests still activate visual tools.

## Operations

For local frontend development, append `?developer=1` to a notebook or source URL. An explicitly configured production frontend requires `NEXT_PUBLIC_ENABLE_DEVELOPER_TOOLS=true` **at build time** and the same URL flag. Do not enable this in the ordinary study deployment. Sessions, sources and exam generation remain available without the flag.

## Consequences

The effects have a conservative solid fallback rather than requiring a GPU. Arc components remain vendored and can receive small integration extensions for localized accessibility labels. The backend context APIs and stored conversations are unchanged. This work stays on the personal fork branch; upstream's initial exam contribution remains frozen.

### Record mutation feedback

A shared dashboard listener animates only confirmed record mutations emitted by the API client. Record surfaces expose `data-record-id`, including the standard table rows. Initial loads, navigation, sorting and errors do not trigger the effect. Creations animate when their visible record arrives after query invalidation; deletions use an inert, aria-hidden snapshot so removal can finish after React unmounts the record. This introduces no extra requests, delays, mutation retries or data cache. Motion uses Arc durations/easing and follows the operating system's reduced-motion setting.

Notes receive a localized default title in the editor and creation hook; the domain normalizes empty titles on save so all write paths preserve a non-empty title without migrating existing notes.
