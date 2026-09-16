---
"@cogenta/plugins": major
"@cogenta/cli": minor
---

Two real escapes closed, found by a security review of L31 (2026-09-16), both reproduced with working proofs before the fix.

**The sandbox held objects of the worker's own realm.** The `vm` context was handed the worker's `console`, `Math`, `JSON`, `Promise` and `setTimeout`, and `setTimeout.constructor` is that realm's `Function`: `setTimeout.constructor('return process')()` returned the real `process` — filesystem, `child_process`, and the site's `.env` with it — from any plugin, with no capability granted. Everything a plugin can touch is now built *inside* the context; the single bridge to the host has a null prototype and is deleted from the global after bootstrap; values cross as JSON so no prototype chain leads out. Six escape paths are regression tests.

**A manifest was executed in the host process.** `plugin.manifest.mjs` was an imported module, so every boot ran one per installed plugin and *inspecting* a sandbox ran the very code being reviewed, before any signature or capability check. A manifest is now `plugin.manifest.json` — read, parsed, never executed — and an executable manifest is refused by name. **Breaking**: a plugin must ship `plugin.manifest.json`; `definePlugin` remains for writing and validating one.

Also: `http.fetch` re-checks the granted hostname on every redirect hop (five maximum) instead of only the first, closing SSRF through a granted host that redirects inward; plugin route responses are served with `Content-Security-Policy: sandbox; default-src 'none'` and `nosniff`, so markup a plugin wrote cannot read the admin session token from the site's own origin; at most eight plugin runs are in flight at once (503 past that) so a public plugin route cannot exhaust the host; and a plugin's response body is capped at 1 MiB. Installing a plugin, granting a capability and revoking one are recorded in the audit log.
