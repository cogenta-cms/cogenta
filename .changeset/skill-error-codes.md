---
'@cogenta/core': minor
---

Add two error codes for L4's skills layer:
`SKILL_UNKNOWN` (loading a skill name that was never installed) and
`SKILL_DEFINITION_INVALID` (a `SKILL.md` has no frontmatter block, or is
missing `name`/`version`/`description`).
