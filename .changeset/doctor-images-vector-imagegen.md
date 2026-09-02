---
"@cogenta/cli": patch
---

Audit fiche 05/15 (2026-09-01), correction A3 — `cogenta doctor` now
reports on the two driver-backed needs it previously said nothing about:

- **`images`**: which image transformer is active — `sharp` (optimal,
  native libvips) or the WebAssembly fallback (degraded) — the same
  driver-tier reporting `database`/`cache`/`storage`/`rateLimit` already
  get (rule R1, the `new-driver` skill's "doctor reporting" requirement).
  An operator on a host where `sharp` cannot install previously had no way
  to learn that short of a slow first media upload.
- **`vector`** (L18 semantic search): reports the active vector store
  driver (`pgvector`/`file`/`memory`) the same way. A site with
  `vector.driver: 'pgvector'` pinned but no real Postgres connection now
  fails `doctor` with a named, actionable `DRIVER_UNAVAILABLE` problem
  instead of only surfacing the first time the assistant needs it; a site
  that leaves `vector` unconfigured reports no problem, since a
  service-free default (`file`, or `memory` as a last resort) always
  exists (R1).

Also reports **image generation** (L18 task 4) as a note, when configured
— the provider, model, and whether an API key is present in the
environment — mirroring the existing LLM-provider note. This is a note
rather than a `checks` entry: `createImageProviderRegistry` has no
driver-tier/health concept (there is no service-free way to generate an
image, R2's own reason this section has no default), unlike every real
driver need above.
