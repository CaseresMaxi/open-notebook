# Personal study product review

## Product and component choices

- Primary jobs: study from a notebook, manage reference material, take exams, and ask questions with source context.
- Arc free registry items installed: Button, Input, Avatar, EmptyState, SegmentedControl, BillingToggle (and their motion/animation dependencies).
- New layout and forms use semantic theme variables, Inter/Geist, browser-safe initial renders, explicit labels, and in-place save/error status.
- Notebook notes/summaries are peer panels using tabs. Tile/list views use Arc SegmentedControl. Billing uses Arc BillingToggle and explicit unavailable states.
- Original APIs and data are retained. Rich markdown, image answers, source crops, sandboxed educational figures, interactive tests and context controls retain their implementations.

## Checked

- Desktop and phone navigation have real links, active page semantics and named icon controls.
- Wide tables scroll in their container. New product pages and the notebook were rendered at 390, 768, 1024 and 1440 pixels; no horizontal document overflow.
- Light/dark notebook panels rendered with actual user data. Arc components respect reduced motion.
- Profile save survives reload; unavailable storage reports failure. Profile is explicitly browser-local.
- Summary generation rejects unprocessed sources and empty model results, retains source provenance, and uses the selected notebook. Summary metadata is hidden and preserved in the editor.
- The payment section states that billing is unavailable, has no invented prices, and cannot collect payment details or charge anyone.
- New copy has consistent keys/interpolation across all locales. Spanish and English copy are authored; remaining new translations use English pending localization.
- Type check, lint, existing frontend regressions and production build are the acceptance gates.

## Scope notes

This is an integration into an existing research app, so legacy rich-content controls, compact metadata, dialogs and data panels retain some existing typography and composition. Their backend semantics, confirmation behavior and established accessibility handling are preserved. The upstream `/dev/design` reference page and its original token file are not rewritten. New profile and payments surfaces use the Arc design workflow directly.

Billing and server-side account identity require separate product decisions. Local Codex MCP registration is separate from repository dependencies, and OAuth requires the owner's UIARC authorization. The public registry can install every selected free component without a Pro account.

## Verification results

- Backend: 1120 tests passed; Ruff lint/format and mypy passed.
- Frontend: full regression and coverage suite passed, with targeted checks for summary editing and contextual chat overlays.
- Production Next.js build passed. Browser checks used real notebook data, both themes and the four documented widths; profile save/reload and summary generation were checked separately.
