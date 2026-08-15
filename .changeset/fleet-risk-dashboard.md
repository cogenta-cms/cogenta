---
'@cogenta/fleet': minor
---

`@cogenta/fleet` gains real risk scoring (`computeSiteRisk`/`rankSitesByRisk`, `packages/fleet/src/control/risk.ts`) and query helpers (`filterRisks`/`groupRisksByClient`) for L8 task 5, "Tableau de bord de flotte : tri par risque, pas par ordre alphabétique."

- **Real inputs only**: the score weighs exactly the `TelemetryPayload` fields with a real data source today — open CVEs (by real urgency, a single critical CVE alone reaches the `critical` tier, matching the lot's literal acceptance criterion), admin-account MFA coverage, and version drift (task 4's `detectDrift`). Fields still "shape only" — availability, backups, certificate expiry, aggregated errors — contribute nothing; wiring their real data sources later just grows the weight table, no redesign.
- A site with no telemetry at all is scored as real risk, not a clean zero.
- Ranking is a real, deterministic sort (score descending, name ascending on ties) — proven by a test where the alphabetically-last site (a critical CVE) ranks first ahead of an alphabetically-first, merely-drifted site.
- `filterRisks`/`groupRisksByClient` are real O(n) query functions designed for the lot's own "concevoir directement pour cent" warning, not a client-side afterthought.
- `EnrollmentStore` (task 1) gains an optional `client` field on `issuePairingToken`/`SiteRegistration` — the one client/agency-grouping concept this package had nothing for before. `issuePairingToken`'s second parameter changed from a bare `ttlMs` number to an options object (`{ttlMs?, client?}`) — a breaking change to task 1's own not-yet-published API, updated at its one real call site.

`@cogenta/admin` gains `FleetDashboard` (`packages/admin/src/fleet/dashboard.tsx`) — purely presentational and prop-driven (a local, structural `FleetSiteRisk` type, no hard dependency on `@cogenta/fleet`, matching `plugins/permission-review.tsx`'s established pattern), since no live fleet control plane is deployed anywhere yet. Renders whatever already-ranked list it's given — never re-sorts — with real search/client-filter/minimum-tier controls.
