---
'@cogenta/fleet': minor
---

`@cogenta/fleet` gains the control-plane's ingestion boundary and per-site state model (`packages/fleet/src/control/`) — the receiving-side counterpart to task 2's site-side telemetry emission.

- `ingestTelemetry(signed, enrollmentStore, stateStore)` runs three independent checks, in order: (1) the claimed site is actually paired and not revoked (checked as its own condition, never folded into signature validity — a site paired before being revoked still holds a cryptographically valid keypair), (2) the signature genuinely verifies against that site's registered public key (task 1/2's Ed25519 primitive), (3) the payload is re-inspected on receipt with `assertNoForbiddenFields` — never trusted from the sender's own type system, since a compromised or buggy site is exactly the threat model this defends against. A rejection at any step never touches the state model — a partial, unverified update is worse than none. Returns a discriminated `IngestResult`, matching the `{ok:false, reason, ...}` shape this codebase has used consistently for every "here's exactly why" refusal this session (`@cogenta/channels`' link codes, `@cogenta/plugins`' registries).
- `createSiteStateStore` persists one row per verified telemetry snapshot, keyed strictly per site — no query shape anywhere in this module spans more than one site's rows, structurally, not by convention. Real, bounded retention (30 most-recent snapshots per site, enforced on every write) per the lot's own "## Pièges connus" warning about unbounded telemetry growth — a real, testable property (deliberately over-inserting proves the oldest rows are genuinely pruned, not just excluded from a query), scoped per site so a busy site's volume never prunes a quiet site's history.

No new `@cogenta/core` error codes — `ingestTelemetry`'s rejections are a typed discriminated result, not thrown errors, since a control plane needs to render "why" without parsing a message.
