---
'@cogenta/fleet': minor
---

`@cogenta/fleet` gains per-site rollback, completing what task 7's canary-wave
rollout started: "## Mises à jour groupées"'s "Un échec arrête toute la
campagne et propose le retour arrière du site concerné."

- **Propose, not act**: "propose" is read literally — a halted campaign never
  auto-enqueues a rollback by itself (an unattended automatic rollback of what
  might be a real but transient contact failure is a real operational risk
  the lot's own words don't ask for). `listRollbackCandidates(campaignStore,
  campaign)` is the real, queryable "propose" half: for a `halted` campaign,
  one entry per real failed site (`CampaignRecord.failedSiteIds`, task 7),
  each carrying the real version that site reported immediately before the
  campaign touched it (`RolloutCampaignStore.getSiteRolloutRecords`, a new
  real read path over task 7's own `pre_update_version` history — not
  `SiteStateStore`'s general drift-tracking, which has no concept of "before
  THIS campaign"). Returns `[]` for anything not halted.
- **`triggerRollback`**: the real, separate, deliberate act — enqueues a real,
  signed `rollback` command (task 6's real command queue) for exactly one
  site, strictly per-site (no "roll back the fleet" operation exists, per the
  lot's own words: "il n'existe pas d'état global à restaurer"). Refuses
  (`FLEET_ROLLBACK_NO_PRIOR_VERSION`) when no real prior version is known —
  never rolls back to a fabricated default. Callable standalone, independent
  of any campaign, for an operator manually deciding a specific site needs to
  go back.
- **Site-side handler** (`createRollbackIntentHandler`): registers the real
  `rollback` whitelisted action (task 6) — verifies the payload shape, then
  hands it to a caller-supplied callback. Honest scope: no mechanism exists
  anywhere in this codebase to revert a site's installed plugin/theme/CMS code
  to a prior version (no package-manager integration, no `@cogenta/plugins`
  downgrade path) — this is a real, documented gap, not a handler that
  pretends to act. `recordIntent` is where a real deployment wires whatever
  it actually has.
- **Acceptance criterion resolved without new code**: "Un site peut être
  détaché de la flotte et continuer à fonctionner seul" was already true
  structurally since task 1 — no core CMS package (`@cogenta/schema`,
  `@cogenta/render`, `@cogenta/api`, `@cogenta/cli`, `@cogenta/auth`,
  `@cogenta/blocks`, `@cogenta/theme-canonical`) has ever depended on
  `@cogenta/fleet`. A new real test asserts this against every core
  `package.json` directly, rather than leaving it an assumption.

One new `@cogenta/core` error code: `FLEET_ROLLBACK_NO_PRIOR_VERSION`.
