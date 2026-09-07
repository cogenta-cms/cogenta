---
'@cogenta/plugins': minor
---

Fiche 73 task 3 — new `runIsolatedModule(options)`, a sibling to `runIsolated` that
does a real `await import()` of an ES module inside an isolated worker and calls one
of its named exports, rather than `runIsolated`'s import-less `vm.Script` string.

This is the sizing/proof the fiche's own piège n°1 asked for before the rest of the
theme sandbox could be estimated: the real unknown was never "can a plain
`HtmlElement`-shaped tree cross the worker boundary" (it already does, via the same
JSON round-trip `runIsolated` already uses) — it is that a theme's `RenderContext`
carries live, host-bound methods (`t()`, `content.entry()`, ...) a theme calls
*during* rendering. `runIsolatedModule` answers that with a generalised version of
the same request/reply RPC `runIsolated` already proves for plugin capabilities: a
caller names arbitrary host callbacks, and the worker hands the module one flat,
RPC-backed callback object as its last argument.

Carries a real, weaker isolation guarantee than `runIsolated`, on purpose and
documented rather than hidden: a genuine `import()` has no `vm` boundary stopping it
from reaching `node:fs`/`node:net` (proven by a dedicated test). Safety for a real
theme has to come from elsewhere — `verifyTheme`'s static import scan, already wired
in fiche 73's task 1, refusing a theme before its code ever reaches a worker like
this one — plus the same `env: {}`/bounded `resourceLimits`/host-side timeout
`runIsolated` already gives every worker.

Nothing in this change wires `runIsolatedModule` into `cogenta serve` or into real
theme rendering — that remains fiche 73's task 4 (the sandbox/preview route), which
this task's own estimate now has a concrete mechanism to build on.
