---
"@cogenta/core": minor
"@cogenta/agents": minor
"@cogenta/api": minor
"@cogenta/cli": patch
---

Fiche 57 (Compétences : dossiers de référence standard) — a skill's
`references/`, `scripts/` and `assets/` sub-folders, the standard layout a
real Claude Code/Anthropic skill uses, are now created automatically and
manageable from the admin. No contract A/B/C/D touched; no ADR required
(that would only apply to a future `skill.read_resource` tool, which this
fiche deliberately does not add).

**`@cogenta/agents`**: `AgentSkillStore` gains `listResources`,
`addResource` and `removeResource`, plus the exported `SKILL_RESOURCE_DIRS`
constant and `SkillResource`/`SkillResourceDir` types.
`createFileAgentSkillStore`'s `create()` now also creates the three standard
sub-folders, empty, alongside `SKILL.md`/`.meta.json`. Writing or removing a
path outside `references/`, `scripts/` or `assets/` — or one that tries to
escape the skill's own directory — is refused
(`AGENT_SKILL_RESOURCE_INVALID`); a skill created before this fiche, with no
sub-folders on disk, lists an empty resource set rather than erroring.

**`@cogenta/core`**: two new error codes, `AGENT_SKILL_RESOURCE_INVALID` and
`AGENT_SKILL_RESOURCE_UNKNOWN`.

**`@cogenta/api`**: `agent-skills-router.ts` gains `GET`/`POST
/api/agent-skills/:id/resources` and `DELETE
/api/agent-skills/:id/resources/<path>`, all admin-only like the rest of the
router. An upload accepts either a real `multipart/form-data` body (`path`
field, `file` part — no base64 inflation for a binary asset) or a JSON body
`{ path, content }` with `content` as plain UTF-8 text.
`AgentSkillRegistryLike` gains the three matching methods; any other
implementer of this interface needs to add them.

**`@cogenta/cli`**: `agent-runtime.ts`'s `createSkillRegistryAdapter` wires
the three new methods straight through to `AgentSkillStore` — no new CLI
command or flag.

**Admin** (not published, `@cogenta/admin`): the Compétences screen's edit
row gains a "Fichiers de référence" panel — three lists (Références,
Scripts, Gabarits) with upload and remove, using `FormData` uploads directly
rather than the `fileToBase64` path `media-client.ts` still uses, since a
resource file (an asset image, in particular) should not pay a ~33% base64
inflation when a real `multipart/form-data` transport is already wired on
the server side.

Nothing here is loaded into an agent's context automatically — deliberately
so, per the fiche's own warning against uncontrolled context growth (R7).
