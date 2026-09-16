---
'@cogenta/plugins': patch
---

Document how a plugin adds a block or a widget to a page

`docs/guide-plugin.md` gains the section people ask for first: declaring a block
and a widget, rendering them as a tree, what the host refuses and why, what it
costs, and what the admin does with them on its own.

`examples/plugin-starter` — the template the guide points at — now provides both,
and its own test runs them in the real sandbox and compares the tree, so the
example cannot rot into a lie.
