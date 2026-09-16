---
'@cogenta/plugins': minor
'@cogenta/cli': minor
'@cogenta/api': patch
---

Manage plugins the way a person would, not the way the filesystem does

A plugin manifest may now carry a `title`: what to call it in front of a
person, when that is not what a package may be called. `name` stays the
package name everything is keyed on.

`@cogenta/cli` gains starting points a plugin can be created from — react to a
publication, serve a page, run something daily, or start from scratch — each
one code that already validates and runs, plus `uninstallPlugin` (which keeps
a copy under `.cogenta/plugin-versions/`) and `describePluginSandboxes`, which
lists drafts from their manifests without evaluating their code.

`cogenta serve` gains `DELETE /api/plugins/:name` (uninstall, revoking its
grants), `POST /api/plugins/:name/state` (turn a plugin off or on) and
`DELETE /api/plugins/sandbox/:id` (throw a draft away); `POST
/api/plugins/sandbox` now takes a `name` and a `template` and derives the
directory. `GET /api/plugins` reports each plugin's disabled state and
describes drafts rather than listing directory names.

A plugin can now be disabled with the reason `'manual'` — a person turned it
off, which is not a violation but is the same answer to "may it run?".
