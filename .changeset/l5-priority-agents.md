---
'@cogenta/agents': minor
'@cogenta/agents-builtin': minor
'@cogenta/cli': minor
---

The seven agents of priority 2 and 3 (L5 task 10, contract C `tools@1.8`)

Média, Traduction, Modération, Analytics, Migration, Accessibilité and Conformité, all
specified in `docs/lots/L5-agents-priorite-2-3.md` and seeded **disabled by default**.
Each one reports what a pure function computed — `auditMediaLibrary`,
`findTranslationGaps`, `triageComments`, `readAudienceSignals`, `findMigrationResidue`,
`auditAccessibility`, `auditCompliance` — and asks a model only to order and word those
findings. None of them holds a publish or a delete tool: the runtime cannot grant what a
declaration does not list.

Contract C gains, by the bottom and without touching a single existing signature:
`media.list` (under the existing `media.read`), `comments.list`/`comments.decide` (new
`comments.moderate`) and `analytics.summary` (new `analytics.read`). `comments.decide`
never deletes — refusing a comment is a status, and its `revert` puts back the exact
status and note the comment had.
