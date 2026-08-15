---
'@cogenta/fleet': minor
---

`@cogenta/fleet` gains staged rollout campaigns: "## Mises à jour groupées"'s
"canari → 10% → 50% → le reste, un échec arrête toute la campagne."

- **`planWaves`/`orderSitesForCanary`**: real, deterministic wave partitioning
  over an already-ordered site list; canary selection reuses task 5's real
  risk scoring (`computeSiteRisk`) — the lowest-risk site goes first, an
  unscored site never becomes a default canary.
- **The critical architectural decision**: verification is asynchronous, via
  a site's own next telemetry contact (tasks 2/3's real ingestion path) —
  never a synchronous probe from the control plane to a site, which would
  violate the lot's absolute "le plan de contrôle n'ouvre jamais de
  connexion vers un site" rule established since task 1. `checkProgress`
  only ever interprets signals `SiteStateStore`/`extractInventory` already
  produce; it adds no new transport.
- **Real halt-on-failure**: a wave with any real failure (version didn't
  reach the target) or a real, bounded per-site timeout (a site that never
  checks back in counts as failure, not an indefinite wait) halts the whole
  campaign — later waves' sites provably never receive an `update` command
  at all, proven by a real integration test injecting a failure in wave 2
  and asserting waves 3/4's command queues stay empty.
- **Real, durable campaign state**: persisted (`cogenta_fleet_rollout_campaigns`,
  `cogenta_fleet_rollout_site_status`), survives being reloaded from a fresh
  store instance against the same database — a real "control-plane restart"
  simulation. `pre_update_version` per site is the real version-history
  record task 8's rollback execution will consume — not a duplicate of
  `SiteStateStore`'s general drift history, which tracks change over time
  rather than "what this one campaign changed."
- Two new `@cogenta/core` error codes: `FLEET_CAMPAIGN_NOT_FOUND`,
  `FLEET_CAMPAIGN_STATE_CORRUPT`.
