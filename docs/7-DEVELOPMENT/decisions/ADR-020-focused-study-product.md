# ADR-020: Focused study product and free Arc UI

- **Status:** Accepted in personal fork
- **Date:** 2026-10-08
- **Scope:** `CaseresMaxi/open-notebook`, `feature/focused-product-redesign`

## Context

The fork owner wants a study product centered on sources, notes, summaries, exams and chat. The previous navigation exposed operational and peripheral features as peer destinations, and the notebook assigned as much width to each material column as to its conversation. Profile and billing are requested as product mockups; the installation still uses password authentication and has no billing service.

## Decision

Use only publicly available free Arc UI registry items from [uiarc.dev](https://uiarc.dev/docs/installation). Vendor source into `frontend/src/components/arc`, keep the registry configured in `components.json`, and retain the existing API, data, contextual chat and grading behavior. Adapt the existing Button contract to Arc buttons; retain Slot for link and Radix compatibility. Arc Input owns new profile and login fields; Avatar, EmptyState, SegmentedControl and BillingToggle serve their documented roles. Import foundation tokens once. Apply the product theme in `product.css`, keeping the upstream design reference route and `globals.css` intact.

Use a narrow navigation focused on the study functions. Keep operational tools reachable under Settings. On wide screens arrange sources, chat and a notes/summaries panel; on smaller screens show one active panel. Chat mounts in only one layout at a time.

Summaries are AI notes with a hidden versioned marker, generated through an existing summary transformation from actual extracted source text. Save a source link and the chosen notebook ID with every summary. Hide and preserve the marker during editing. Empty source text or model output cannot produce a saved summary. The summaries library opts into `GET /api/notes?summaries_only=true`; only this path loads note bodies for classification and returns matched summaries. Ordinary notebook note lists keep their lightweight projection. Do not relabel all existing AI notes as summaries.

Profile is browser-local and labeled accordingly; it does not create an authenticated identity. Payments is an explicitly labeled preview with no checkout, card collection, invoices, invented prices or changes to feature availability. Real billing needs a separate decision about identity, tenancy, provider, plans and webhooks.

## Alternatives considered

- Purchase or imitate Arc Pro templates: excluded by the free-components requirement.
- Rebuild persistence, auth and billing alongside the redesign: premature without product decisions and unnecessary for the requested mockups.
- Delete peripheral backend features and existing user content: the requested product focus is achieved through navigation and composition without a destructive data migration.
- Treat every AI note as a summary: inaccurate for saved conversations, questions and other generated notes.

## Consequences

All work is published only to the personal fork. Upstream PR #1486 remains frozen at its initial two-commit contribution. Arc MCP configuration is installed in the local Codex configuration and needs the owner's OAuth sign-in; source installation can proceed through the free public registry independently.

Browser-local profile is not cross-device or multi-user. New strings have keys in all 14 locales; the new product copy is authored in English and Spanish, with English copy for the remaining locales pending translation. Existing localized features retain their translations.

The UI has a clear contract for future account and payment integration without pretending those services exist. Arc uses Motion, adding a runtime dependency; reduced motion is respected. Legacy controls and rich content keep their existing semantics where Arc does not offer a compatible composable primitive.
