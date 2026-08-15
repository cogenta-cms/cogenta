---
'@cogenta/plugins': minor
'@cogenta/admin': minor
---

L7 task 7 — "Écran de permissions en langage clair."

- `describeCapability` (`@cogenta/plugins`) translates every capability in
  the frozen vocabulary (`PLUGIN_CAPABILITY_NAMES`) into a plain-language
  French sentence plus a `low`/`medium`/`high` risk level and category —
  never a raw technical identifier. Bypass-review or destructive
  capabilities (`content.publish`, `content.delete`, `site.config_write`,
  `deploy.trigger`, `agent.delegate`, `memory.write`) are `high` risk. A
  capability outside the known vocabulary throws rather than falling back
  to a generic, identifier-adjacent sentence. Proven by a real test that
  mechanically checks every real vocabulary entry's sentence for raw
  fragment leaks (`content.`, `http.fetch:`, `_draft`, etc.), not just the
  lot doc's two literal examples.
- `PluginPermissionReview` (`@cogenta/admin`) is a purely presentational,
  prop-driven component rendering already-translated capability
  descriptions — no hard dependency on `@cogenta/plugins`' types (mirrors
  this app's established pattern of local, structural types for backend
  data, e.g. `content-client.ts`'s `ContentBlock`). The per-item checklist
  is the default, prominent path; "approve all without reading" exists as a
  secondary action, never primary — "l'installation sans lecture est
  possible, mais on ne la facilite pas." A checked high-risk item requires
  an explicit second confirmation before it can be approved. No install
  flow is wired to this component yet (no live plugin registry exists
  anywhere in this codebase) — it renders whatever items it's given.
- Task 5's `PluginGrantStore.revoke` already covers task 8's data-layer
  need ("révisables après installation, et révocables") — this screen's
  translation layer is designed to be reused by that later review screen
  directly, not rebuilt.
