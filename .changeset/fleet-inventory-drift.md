---
'@cogenta/fleet': minor
---

`@cogenta/fleet` gains inventory extraction and version-drift detection
(`packages/fleet/src/inventory/drift.ts`), on top of task 3's per-site
telemetry ingestion.

- `extractInventory` flattens a real, already-verified `TelemetrySnapshot`'s
  `installedVersions` (cms/plugins/themes) into a uniform, component-oriented
  view — no new data source, a re-shaping of what already flows through
  ingestion.
- `computeFleetBaseline` computes the real, most-common version per
  component across the currently-known fleet (never hardcoded); `detectDrift`
  reports every site whose version differs, classified `behind`/`ahead` via
  `@cogenta/plugins`'s real, already-tested semver comparator, or
  `different` when either side isn't parseable semver — never a guessed
  direction.
- Honest scoping: `cms` is a real component kind in the shape, but every
  site reports `cms: null` today (no meaningful Cogenta version exists
  anywhere yet, same gap `@cogenta/plugins`' `loadPlugin` already documents
  for `engineCompatible`) — a component with no real version anywhere in
  the fleet produces no baseline entry and no drift entry, rather than a
  fabricated "0.0.0 vs 0.0.0" result.
- `EnrollmentStore` gains `listSites()` — real, metadata-only (id/name/key/
  revocation state, never telemetry), the one legitimate fleet-wide seam
  needed to enumerate sites for drift detection and later tasks (dashboard,
  rollout campaigns) without touching `SiteStateStore`, which structurally
  has no cross-site query at all.
