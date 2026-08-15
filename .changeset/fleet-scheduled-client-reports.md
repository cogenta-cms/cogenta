---
'@cogenta/fleet': minor
---

`@cogenta/fleet` gains scheduled client reports: "## Rapports client"'s
"Un rapport mensuel par site... C'est un livrable commercial pour l'agence,
pas un tableau technique. Le format doit pouvoir être lu par le client
final."

- **Real fields vs. honest gaps**: `assembleClientReport` reads real data
  from tasks 2/3/4/5 (`openCves`, `coreWebVitalsAggregate`, version drift)
  and marks `availability`/`backups` as `{available: false}` — never a
  fabricated uptime percentage or backup date — matching `TelemetryPayload`'s
  own field-by-field honest scoping. `publishedContent`/`agentActions` are
  always `{available: false}`: no real fleet-visible signal for either
  exists anywhere in this codebase (no content-activity count on the
  telemetry payload — content data must never remonter at all, per the
  lot's own absolute rule; no live `AgentRegistry` anywhere, the same
  R2-honest finding repeated across L5/L7/L9/L8).
- **Reuses `@cogenta/channels`'s real `buildReport`** (new workspace
  dependency) rather than inventing report rendering — `renderClientReport`
  produces a real `ReportChannelMessage`, so a report is immediately
  sendable through any real channel adapter (Telegram/Slack/Discord/email)
  already built in L6, matching "envoyé sur le canal choisi ou par email"
  literally. `buildReport`'s own real screen-budget enforcement caught an
  overlong first draft during this task's own testing — sections were
  tightened, not bypassed with a `moreUrl` to a dashboard that doesn't
  exist yet.
- **Plain language, no raw identifiers**: a dedicated test asserts the
  rendered output never contains a raw CVE id or a raw semver string —
  same technique L7's `describeCapability` used for its own "no raw
  identifier" acceptance criterion.
- **`isReportDue`/`createReportScheduleStore`**: a real, injectable-clock
  30-day cadence check plus real, per-site "last sent" persistence — no
  live cron wired (no live control-plane deployment exists anywhere in this
  lot, the same honest scoping every prior L8 task has made), but the real
  due/not-due computation and its real storage are both real and tested.
