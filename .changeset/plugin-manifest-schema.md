---
'@cogenta/plugins': minor
---

New package: `@cogenta/plugins`. `definePlugin` — the plugin manifest schema
and validator (L7 task 1). Every hard-refusal rule the lot specifies is
enforced: `http.fetch` without an explicit domain (or with `*`) is refused,
a `storage.read`/`storage.write` capability outside the plugin's own
`plugins/<name>/` prefix is refused, an unknown capability name is refused,
and a block provision without a `fallback` is refused. The capability
vocabulary is grounded in contract C's frozen tool-permission taxonomy
(`content.*`, `media.*`, `http.fetch`, `channel.send`, …) rather than a
parallel invention, plus `storage.read`/`storage.write` for plugins' own
prefix-confined storage. Every validation issue is reported at once, same
reasoning as `@cogenta/schema`'s `schemaError`.
