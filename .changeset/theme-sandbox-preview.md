---
'@cogenta/core': minor
'@cogenta/plugins': minor
'@cogenta/cli': minor
---

Fiche 73 task 4 — the theme sandbox itself: a working directory outside `themes/`
(`<projectRoot>/.cogenta/theme-sandbox/<id>/`), so in-progress edits — hand-written or
AI-generated — never touch a theme a real request could resolve mid-edit.

New in `@cogenta/cli`'s `theme-sandbox.ts`: `createSandbox` (a fresh, empty working
directory), `cloneThemeIntoSandbox` (a real, recursive file copy from an existing local
theme — never a symlink or junction, which behaves differently across platforms — and a
clear, actionable error for a built-in npm-packaged theme, which has no folder here to
clone from), `listSandboxIds`, and `renderSandboxPreview`.

`renderSandboxPreview` re-reads the sandbox directory on every call (no reload daemon —
a preview is one explicit click, never a continuous stream) and renders it through fiche
73 task 3's `runIsolatedModule` — never in the `cogenta serve` process itself. It is
deliberately NOT gated on `verifyTheme`'s security scan the way a deployment will be
(task 5): a preview has to show the sandbox's code exactly as it behaves right now, valid
for deployment or not. The isolation this preview carries is `runIsolatedModule`'s own,
already-documented, worker-level guarantee — not a full sandbox against a forbidden
import — matching ADR-0034's "point de vigilance" rather than overselling it. Preview
content is fixed and database-free, the same reasoning `renderThemeGalleryPreview`
already uses: nothing here can leak a real entry.

`@cogenta/plugins`: `runIsolatedModule`/`RunIsolatedModuleOptions` (task 3) are now
re-exported from the package's public entry point, not just internal.

`@cogenta/core`: two new error codes, `THEME_SANDBOX_SOURCE_NOT_FOUND` and
`THEME_SANDBOX_IMAGE_UNSUPPORTED`.

Not yet included, honestly: no `GET /admin/theme-sandbox/<id>` HTTP route is wired into
`cogenta serve` yet — this task delivers the underlying mechanism, tested end to end
with real filesystem fixtures and real isolated-worker renders, for a route to be wired
onto next. Nothing here is reachable from outside the process yet, so there is no new
public surface to secure in the meantime.
