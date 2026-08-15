---
'@cogenta/fleet': patch
---

Add cross-site isolation tests (L8 task 11, the lot's own last task): a
dedicated adversarial suite that turns "always scoped to exactly one
siteId" — documented on every per-site store since the task that first
built it — into a checked fact rather than an assumption. Covers
`SiteStateStore`, `CommandQueueStore`, `AlertConditionStore`,
`ReportScheduleStore` and `RolloutCampaignStore.getSiteRolloutRecords`, plus
the ingestion boundary's real cross-site impersonation attempt: a genuinely
paired site's own valid signature over a payload claiming another site's
identity is refused, because verification checks the CLAIMED site's
registered public key, never the actual signer's. A 100-site load test
(`## Tests exigés`'s "100 sites simulés") re-proves the same zero-contamination
property at the lot's real target fleet scale through the real signed
ingestion path.

`@cogenta/agents`'s `MemoryStore` site isolation is deliberately not
duplicated here — its own contract test already proves it where the memory
actually lives, and `@cogenta/fleet` has no reachable path to agent memory
today (no live `AgentRegistry` exists anywhere in this codebase).

No production code changed — this closes L8's last task, and with it the
entire planned lot roadmap.
