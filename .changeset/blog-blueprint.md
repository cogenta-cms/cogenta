---
'create-cogenta': minor
'@cogenta/core': minor
---

`create-cogenta` — the `blog` blueprint (L9 task 3): `post`/`category`/`tag`
collections, real demo content seeded through `ContentStore`, the canonical
theme's default skin (`theme.tokens.json`), and a recommended-agents hint
(`.cogenta/recommended-agents.json`) — no live agent scheduler is wired,
since none exists anywhere in this codebase yet (R2). `resolveBlueprint`
now genuinely resolves `blog` as available; `blank`'s output is unchanged.

Also fixes a bare `throw new Error(...)` in `resolveBlueprint`'s internal
consistency check, replaced with a `CogentaError`.

One new `@cogenta/core` error code: `BLUEPRINT_REGISTRY_CORRUPT`.
