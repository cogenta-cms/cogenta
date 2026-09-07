---
'@cogenta/cli': patch
---

Fiche 73 — adds the one missing route the new admin screen needs: `GET /api/theme/sandbox`,
listing every sandbox id currently on disk (`listThemeVersions`'s sibling for sandboxes,
already existed as a function — `listSandboxIds` — just never had an HTTP route). Same
admin-only gate as the rest of the sandbox route family.
