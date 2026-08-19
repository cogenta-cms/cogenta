---
"@cogenta/core": minor
"@cogenta/auth": minor
"@cogenta/api": minor
"@cogenta/agents": minor
"@cogenta/cli": minor
---

Fiche 21: the audit log gains what the state-of-the-art comparison named as
missing — a real entry detail, filters that reach a date range, an export,
an actually-scheduled integrity check, and a way to tell a human's action
from an agent's.

**Task 1 — detail.** `GET /api/audit/{id}` (`@cogenta/api`'s `audit-router.ts`)
answers with the entry, its resolved actor kind and label (an email, or an
API key's name), and — for a `content.create`/`update`/`restore` action — the
same structural diff `GET /{collection}/{id}/diff` already computes, called
through rather than recomputed (the fiche's own warning against duplicating
it). This needed a place to keep which content version an action produced:
`RecordAuditInput`/`AuditEntry` gain `version`, stored in a new nullable
`cogenta_audit_log.version` column added with a `try`/`catch` `alter table`
(no portable `add column if not exists` across SQLite/Postgres/MySQL) — and
**deliberately excluded from the hash `computeHash` chains together**. Adding
a field to that canonical list would change what every already-recorded hash
means, and every site's existing chain would fail `verify()` the moment this
code ran. The fields that matter for accountability — who, when, what
action, on what — are untouched; `version` is UI-convenience metadata, not
inside the tamper-evidence boundary. A permission refusal on the diff's own
collection (an admin who was never granted an authoring role there) degrades
to `diffUnavailable`, not a 403 for the whole entry.

**Task 2 — dates, export, pagination.** `since`/`until`/`actorKind` filters
on `GET /api/audit`, and `GET /api/audit/export?format=csv|json` (bounded to
10,000 entries) for the filtered view. The export is itself an audit-worthy
event — a personal-data extraction, per the fiche — recorded as
`audit.export` (format and count only, never the exported rows) at the same
transport-boundary layer `cogenta serve` already records every other
mutation at.

**Task 3 — scheduled integrity, for real.** `@cogenta/auth` gains
`AuditLog.verifyRange`/`get` (a bounded, checkpoint-resuming form of
`verify()`) and `createAuditIntegrityStore`, which persists the last
check's outcome across a restart. `cogenta serve` runs it once at startup
and then on its own `setInterval` (daily by default,
`ServeOptions.auditIntegrityTickMs` overridable for tests) — the same
accepted trade-off as the scheduled-publication tick. Most runs are
incremental (only entries after the last checkpoint); a full replay runs
weekly on its own as the backstop the fiche asks for, since an incremental
check cannot see tampering in already-checkpointed history. A break sends
one signed channel alert (`security.audit_integrity_broken`, only on the run
that first finds it — never once per tick) and a non-dismissible, danger-
severity admin notice that clears itself once a forced full check reports
the chain intact again. `GET`/`POST /api/audit/integrity` expose the status
and the "verify now" that persists its result, alongside the untouched,
stateless `GET /api/audit/verify`.

**Task 4 — distinguishing actors.** `classifyAuditActor` (`@cogenta/auth`)
reads signals the log already carried — `actorId === null` is `system`, the
`apikey:` prefix `resolveActor` has minted since L13 is `api_key`, the
`agent.tool.` prefix `withAudit` has minted since L4 is `agent`, everything
else is `human` — no schema change needed. `withAudit` (`@cogenta/agents`)
gains optional `model`/`autonomyLevel`, carried into the recorded diff when
a caller tracks them. `?actorKind=` filters `GET /api/audit`.

**Task 5 — retention, honestly.** No purge is wired into a schedule in this
pass — `AuditLog.prune(olderThan)` exists, tested, and safe (it refuses to
purge a segment that does not itself verify first, and records a genesis
anchor so the surviving chain keeps verifying from a documented truncation
point rather than silently going quiet about it), but nothing calls it
automatically yet. The admin screen says so plainly: this journal keeps
every entry and grows without limit until an operator acts.

None of this is a breaking change: `AuditLog.verify()`'s signature and every
existing route's response shape are unchanged, and the new column/tables
are additive (a fresh `ensureAuthTables` run tolerates them being already
there, an existing install picks them up the same way).
