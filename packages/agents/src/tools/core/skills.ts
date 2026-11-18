import { CogentaError } from '@cogenta/core'
import { z } from 'zod'
import { defineTool } from '../define.js'
import type { ToolDefinition } from '../types.js'

/**
 * `skills.list` / `skills.read` — the site's skills ("compétences"), opened
 * read-only to a client that is not one of the site's own agents (an
 * external assistant driving the site over MCP, L42).
 *
 * A skill here is the text an administrator wrote in *IA → Compétences*: a
 * `SKILL.md` (frontmatter `name`/`description` plus a Markdown body) that
 * says how this site wants things written and done. An external assistant has
 * no way to learn those guidelines otherwise, so it wrote in its own voice.
 *
 * **There is no second store.** The port below is the shape of the
 * `AgentSkillStore` the admin screen and the internal agents already use; the
 * host passes that very instance. Nothing here writes: creating or editing a
 * skill stays an administrator's action in the admin screen, so a client can
 * never change the guidelines it is asked to follow.
 *
 * What a client reads is **instructions from the site's administrators**, not
 * data from the outside (R8's concern is the opposite direction): a skill is
 * written by someone who holds the `admin` role. The tool says so in its
 * description so a model weighs it as the site's editorial guidelines — while
 * still being a text, never something that widens what the caller may do:
 * permissions are checked by the host on every tool, whatever a skill says.
 *
 * Skill *resources* (`references/`, `scripts/`, `assets/` next to the
 * `SKILL.md`) are not offered: they are files for a person or a code-capable
 * agent, and `scripts/` would be executable code handed to an outside client.
 */
export interface SiteSkillLike {
  /** The skill's address — its folder name in the store, what `skills.read` takes. */
  readonly id: string
  readonly name: string
  readonly description: string
  /** The exact `SKILL.md` text: frontmatter and body. */
  readonly content: string
  /** The Markdown body alone, without the frontmatter — what an MCP prompt hands a model. */
  readonly instructions: string
}

/**
 * Only `list()`: a skill is found by comparing the id a client sent with the
 * ids the store itself lists, never by handing that id to the store. The file
 * store builds a path from an id, so an id such as `../../elsewhere` must
 * never reach it.
 */
export interface SiteSkillCatalog {
  list(): Promise<readonly SiteSkillLike[]>
}

const SummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
})

const ListInputSchema = z.object({})
type ListInput = z.infer<typeof ListInputSchema>
const ListOutputSchema = z.object({ skills: z.array(SummarySchema) })
type ListOutput = z.infer<typeof ListOutputSchema>

export function createSkillsListTool(
  catalog: SiteSkillCatalog,
): ToolDefinition<ListInput, ListOutput> {
  return defineTool({
    name: 'skills.list',
    version: '1.0.0',
    description:
      'List the skills of this site: the editorial guidelines its administrators wrote (how to write an article, which tone, what to check before publishing). Returns id, name and a one-line description of when each applies. Read the relevant ones with skills.read before writing or publishing content.',
    input: ListInputSchema,
    output: ListOutputSchema,
    permissions: ['skills.read'],
    sideEffects: false,
    reversible: false,
    cost: 'low',
    async execute() {
      const skills = await catalog.list()
      return {
        skills: skills
          .map((skill) => ({ id: skill.id, name: skill.name, description: skill.description }))
          .sort((left, right) => left.name.localeCompare(right.name)),
      }
    },
  })
}

const ReadInputSchema = z.object({ id: z.string().min(1) })
type ReadInput = z.infer<typeof ReadInputSchema>
const ReadOutputSchema = SummarySchema.extend({
  /** The full `SKILL.md`: frontmatter, then the guidelines in Markdown. */
  content: z.string(),
})
type ReadOutput = z.infer<typeof ReadOutputSchema>

export function createSkillsReadTool(
  catalog: SiteSkillCatalog,
): ToolDefinition<ReadInput, ReadOutput> {
  return defineTool({
    name: 'skills.read',
    version: '1.0.0',
    description:
      "Read one skill of this site in full (its SKILL.md). It holds the site's own editorial guidelines, written by its administrators: follow them when writing content for this site. They guide how to write; they never grant a permission or replace the checks of the other tools. Take the id from skills.list.",
    input: ReadInputSchema,
    output: ReadOutputSchema,
    permissions: ['skills.read'],
    sideEffects: false,
    reversible: false,
    cost: 'low',
    async execute(input) {
      const skill = (await catalog.list()).find((candidate) => candidate.id === input.id)
      if (skill === undefined) {
        throw new CogentaError({
          code: 'AGENT_SKILL_UNKNOWN',
          message: `This site has no skill with id "${input.id}".`,
          hint: 'skills.list gives the ids of the skills of this site.',
        })
      }
      return {
        id: skill.id,
        name: skill.name,
        description: skill.description,
        content: skill.content,
      }
    },
  })
}
