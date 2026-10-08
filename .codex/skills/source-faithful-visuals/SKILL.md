---
name: source-faithful-visuals
description: Generate or review educational charts, tables, diagrams and animations using the user's existing sources. Apply when source fidelity, visual reasoning or reconstruction matters; inspect original representations and compare the rendered result against them.
---

# Source-faithful visuals

Produce a representation that helps the user reason about their own material. A readable render is only one part of verification: establish what it represents and compare it with the actual source.

## Inspect before designing

Locate the relevant original pages, figures and nearby explanation. Open the page image, not only OCR text or a summary. Match each preview with its source and page; selected-source IDs define the permitted scope. Empty text on a scanned page is not evidence that it has no figure.

Record the learning purpose and observed invariants: labels, class encodings, axes and units, stated values, branch conditions, topology, ordering, captions and caveats. Inspect multiple related pages when the explanation depends on their sequence.

Choose the representation deliberately:

- Reuse a genuine crop when the original figure already answers the request.
- Adapt a source representation to HTML/CSS/SVG when interaction, legibility or simplification helps. Preserve the facts and disclose changes.
- Make a conceptual diagram when the source describes a relationship without recoverable plot data.
- Use a clearly identified illustrative example when introducing new data or geometry. Link its underlying concept to the source. Do not label invented values or guessed coordinates as a reconstruction.

If an original cannot be read, identify the limitation and use an available verified text excerpt where appropriate. Ask for missing material only when the requested result depends on it.

## Check the represented relationships

Use checks that test the actual educational claim, not just the markup or a matching caption:

- Nearest neighbors: compute distances from the plotted coordinates, sort them, check the selected k and any boundary circle, then verify class counts/voting. Preserve the source's symbols and case labels in an adaptation.
- Decision trees: check exact split operators/thresholds, branch direction, class counts and totals. A schematic must not imply a new learned model.
- Statistical charts: verify scale, normalization, denominators, units and actual values. Do not extract quantitative precision from an unlabeled schematic.
- Matrices/projections/clustering: preserve dimensions, label correspondence, orientation and distinctions between illustrative geometry and measured data.
- Tables/process diagrams: retain ordering, categories, quantities and dependency direction; do not erase caveats to simplify layout.

For an exam, prevent answers/rubrics/marked solutions from leaking through the figure, description, controls, comments or public provenance. Grading must receive the same figure data the student sees.

## Render and compare

View the actual result at the chat's narrow width and enlarged size, alongside the original page. Check labels, symbols, values, relationships, clipping and legibility. Exercise controls and reduced-motion behavior when animation exists. If you did not see the render, state that limitation instead of claiming visual verification.

Prefer source-based live tests. A toy dataset can test rendering mechanics; it does not establish fidelity to the user's sources. Correct a semantic mismatch before celebrating working controls or test counts.

In Open Notebook, inspect the current source-inspection tools and the runtime guide at `prompts/visuals/source_fidelity.jinja`. Keep source preview, evidence validation, saved provenance and exam figure context aligned. This Codex skill is development guidance; the app must enforce its own source-review workflow.

Respect the user's publishing destination. A fork branch connected to an upstream PR publishes new commits to that PR automatically. Keep personal work on a separate fork-only branch when the upstream contribution has a frozen scope.
