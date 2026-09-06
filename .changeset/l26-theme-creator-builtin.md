---
'@cogenta/agents-builtin': minor
---

Add the "Cogenta Theme Creator" agent (`themeCreatorAgent`) and its only tool, `createProposeThemeTool` (`theme.propose_theme`, contract C `tools@1.5`, permission `theme.customize`). `sideEffects: false` — there is no write path at any autonomy level; the tool only ever proposes theme candidates via `@cogenta/agents`' `proposeThemeCandidates`, and activating one stays the existing human action on `PUT /api/theme/overrides`. Catalog-only, disabled by default like every other agent in this package.
