---
'@cogenta/core': patch
'@cogenta/plugins': minor
---

L7 task 4: the real, capability-gated SDK a sandboxed plugin actually calls.
A small starter set — `content.read`, `http.fetch:<domain>`,
`storage.read:<prefix>`/`storage.write:<prefix>` — each backed by a real
host-side handler (`packages/plugins/src/host/capabilities.ts`) reached
through a real bidirectional RPC extension of task 3's message protocol
(`sdk-call`/`sdk-result`/`sdk-error`).

Every handler re-verifies the SPECIFIC request (the exact requested domain,
the exact storage key) against the SPECIFIC granted capability parameter —
never just "was this capability name granted at all." A plugin granted
`http.fetch:api.example.com` cannot use its own SDK method to reach a
different domain; a plugin granted `storage.write:plugins/<name>` cannot
escape that prefix, including via `../` traversal.

"Une méthode non accordée est absente de l'objet SDK, pas seulement
refusée" (explicit acceptance criterion) is enforced structurally: the
guest-side sandbox (`packages/plugins/src/guest/sandbox-entry.mjs`) only
ever assigns a method key onto the `sdk` object for a capability actually
present in the granted list — a non-granted method is a genuinely missing
object key, not a present function that throws.

One new `@cogenta/core` error code: `PLUGIN_CAPABILITY_REFUSED`.
