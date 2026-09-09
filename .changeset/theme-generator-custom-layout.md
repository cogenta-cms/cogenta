---
'@cogenta/agents': minor
'@cogenta/agents-builtin': minor
'@cogenta/api': minor
'@cogenta/cli': patch
---

**"Générer un thème avec l'IA" can now actually write a custom page layout, not only
recolour an already-installed one.** A live user report: the admin screen only ever called
`theme.propose_theme` directly (`POST /api/theme/generate`, `@cogenta/cli`'s
`theme-wiring.ts`) — a pure token-adjustment path — so no request, however detailed, and no
attached reference screenshot, however different, could ever change more than colours/fonts
of the theme already active. `theme.write_sandbox_file` (fiche 73) already existed and could
write a real layout, but nothing on this screen ever reached for it.

New in `@cogenta/agents`: `classifyThemeLayoutNeed` (`theme-creator/layout-classifier.ts`) —
a small classification call deciding whether a request needs a genuinely different page
structure or whether adjusting an installed theme's tokens is enough, reusing the same
attachment-processing (`theme-creator/attachments.ts`, extracted from `propose-theme.ts` so
both share one implementation).

New in `@cogenta/agents-builtin`: `generateSandboxTheme` (a real tool-calling agent run,
`theme.write_sandbox_file` as its only tool, `autonomy: 'autonomous'` scoped to this one
call — legitimate because a sandbox write is inert until the pre-existing, separately
human-confirmed deploy step promotes it, never the catalog "Cogenta Theme Creator"
declaration's own `propose` default used by its other entry points) and
`generateThemeCandidates`, the new single entry point tying classification, token
candidates and a sandbox candidate together. **A reference image always forces the
custom-layout attempt**, regardless of the classifier's own verdict — a live run against a
real screenshot showed the classifier alone judged "tokens are enough" for a request an
installed theme could not actually reproduce (a floating review badge over the hero, an
icon-stat band, a circular experience badge) because it *does* have a hero/stats/about
section "in some form"; an attached image is the strongest, least ambiguous signal an
operator wants visual fidelity to a specific composition, not a plausible section list.

Also fixed, found by the same live run: a model asked to write `theme.render.*` named its
file `theme.render.tsx` — a name neither `CONFIG_MODULE_NAME` nor `RENDER_MODULE_NAME`
recognised, so the write silently succeeded while the file was never importable (this
sandbox has no build step; a plain ESM `import()` cannot transform JSX) and the preview
failed with a generic, unhelpful "no theme.render.{js,mjs,ts} yet". `theme-sandbox.ts`
(`@cogenta/cli`) now recognises this specific near-miss and rejects it with the real reason,
letting the agent's own self-correction loop actually fix it instead of dead-ending.

`@cogenta/api`'s `theme-router.ts` gains `SandboxCandidateLike`/`ThemeGenerateCandidateLike`
(additive — existing `SkinCandidateLike` gains a required `kind: 'tokens'` discriminator).
The admin screen (`@cogenta/admin`, no changeset — private) renders either candidate kind:
a sandbox candidate previews through the same real, isolated-worker render the "Gérer les
thèmes locaux" screen's own "Aperçu" already uses, and "Activer" runs the existing
check → deploy → `PUT /api/theme/overrides` pipeline, never a new write path.

Verified live end-to-end against a real reference screenshot and a real provider: the
classifier's own decision, a real multi-file agent run (manifest + render module + CSS,
self-correcting on a rejected write), a real preview render, a real deploy, activation, and
the public site serving the generated layout — not a recolour of `@cogenta/theme-portfolio`,
a distinct header/hero/stats/about composition matching the reference's actual structure.
