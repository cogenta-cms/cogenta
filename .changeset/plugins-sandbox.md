---
"@cogenta/core": minor
"@cogenta/plugins": minor
"@cogenta/cli": minor
---

A sandbox to write a plugin in (L31 step 4). `.cogenta/plugin-sandbox/<id>/` is where a plugin is written before any site runs it — the same shape the theme workshop already proved, and what makes it safe to let an agent write code: a path that resolves outside the sandbox is refused lexically *and* on the real filesystem (a symlink pointing out is caught), `check` refuses a plugin whose manifest does not validate, whose code does not evaluate in the real isolated worker, whose declared events, routes or schedules have no matching handler, or that asks for a capability nothing implements, and `deploy` never silently replaces an installed plugin — it keeps a copy of what it replaced. Installing grants nothing: a freshly deployed plugin holds no capability until a person grants one. `cogenta plugin sandbox new|list|files|check|deploy|delete` drives all of it, and `runIsolated`'s new `describeHandlers` reports what a plugin exposes without running any of it. `@cogenta/core` gains `PLUGIN_SANDBOX_PATH_ESCAPE` and `PLUGIN_SANDBOX_INVALID`.
