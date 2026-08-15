---
'@cogenta/fleet': minor
---

`@cogenta/fleet` gains real-time, operator-facing fleet alerts over
channels — the companion to task 9's commercial client reports, reusing
the same `@cogenta/channels` infrastructure for its `alert`-level message
instead of `report`-level.

- **Three real, closed alert conditions** (`packages/fleet/src/alerts/alerts.ts`):
  `critical-risk` (a site crossing into task 5's `computeSiteRisk`
  `'critical'` tier), `campaign-halted` (task 7's real `CampaignRecord`
  transitioning to `halted`), `site-silent` (a site missing its expected
  telemetry contact — the only real observation channel this architecture
  has, since the control plane never opens a connection to a site).
- **Anti-flapping, reinterpreted honestly**: "## Pièges connus"'s "exiger
  plusieurs échecs consécutifs depuis plusieurs points" assumes active,
  multi-vantage-point probing this architecture structurally doesn't have.
  The consistent reading: require sustained absence across multiple real
  contact windows (3 consecutive missed daily windows) rather than a
  single missed one — documented explicitly as a deliberate reinterpretation,
  not a literal implementation of wording that doesn't map to a push-only
  architecture.
- **Real de-duplication** (`createAlertConditionStore`): a condition
  raises exactly once per active episode (`raise()` returns `{fired:
  false}` on every repeat check while still active) and can re-fire after
  a real `clear()` — never a permanent one-time suppression, never a
  repeat alert per check cycle.
- **Reuses `@cogenta/channels`'s real `buildAlert`** exactly, the same
  reuse discipline task 9 established for `buildReport` — no hand-built
  `AlertChannelMessage` anywhere in this module. `dispatchAlert`'s
  `AlertSender` is a structural interface, never a hard dependency on a
  live channel adapter (no live control-plane deployment exists anywhere
  in this lot).
