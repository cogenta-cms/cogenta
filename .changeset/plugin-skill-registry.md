---
'@cogenta/plugins': minor
---

`@cogenta/plugins` gains a skills registry (`createSkillRegistry`,
`packages/plugins/src/registries/skills.ts`), the second of the four
registries named in the lot's own "## Registres" table — and the first with
a genuinely different gate from the skins gallery (L7 task 10): "Revue de
contenu" (content review), not automatic-only validation.

- Reuses `@cogenta/agents`'s real `parseSkillFile` (new workspace
  dependency) as a necessary-but-not-sufficient automatic pre-check: a
  submission that doesn't even parse as a valid skill file is rejected
  immediately, with the real parse error, and never reaches `pending`.
  A submission that DOES parse still requires a real human decision
  (`review(id, 'accept' | 'reject', reviewerUserId, notes?)`) before it can
  be listed — unlike skins, there is no fully-automatic accept path.
- Re-reviewing an already-decided submission returns a discriminated
  `{ok:false, reason:'already_decided', entry}` result carrying the prior
  decision rather than a raw error or a silent overwrite.
- Persisted via `ensureRegistryTables` (extended, same `create table if not
  exists` pattern as the skins gallery — one migration-free function now
  owns both registry tables).
- A shared `Registry<T>` abstraction was deliberately not built: the two
  registries' state machines are genuinely different shapes (skins: single
  automatic verdict; skills: automatic pre-check then a separate human
  decision), and forcing them into one generic type would cost more
  clarity than the small amount of duplicated submit/list/get shape saves.
  Revisit once the themes/plugins registries (tasks 12-13) exist.
