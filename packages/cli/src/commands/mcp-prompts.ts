import type { SiteSkillCatalog } from '@cogenta/agents'
import type { McpPromptSource } from '@cogenta/mcp'
import type { McpIdentity } from './mcp-tools.js'

/**
 * The site's skills as MCP prompts (`prompts/list`, `prompts/get`), for the
 * clients that show a prompt picker — Claude Desktop's "attach from server"
 * menu among them. Same source as the `skills.*` tools: the administrator's
 * *IA → Compétences* store, never a copy; one prompt per skill, named by the
 * skill's id (its slug), whose single message is the skill's Markdown body.
 *
 * The caller is re-resolved on every request, like a tool call: a revoked key
 * lists nothing and gets the same "no longer authenticates" refusal. An
 * identity that is not authenticated (the anonymous default of `cogenta mcp`
 * without `--api-key`) is offered no prompt — skills are for a caller the
 * administrators have chosen to hand a key to.
 */
export function createSkillPromptSource(
  catalog: SiteSkillCatalog,
  resolveIdentity: () => Promise<McpIdentity>,
): McpPromptSource {
  return {
    async list() {
      const identity = await resolveIdentity()
      if (!identity.authenticated) return []
      const skills = await catalog.list()
      return skills
        .map((skill) => ({
          name: skill.id,
          title: skill.name,
          description: skill.description,
        }))
        .sort((left, right) => left.title.localeCompare(right.title))
    },
    async get(name) {
      const identity = await resolveIdentity()
      if (!identity.authenticated) return undefined
      // Found among the ids the store lists, never by handing `name` to it:
      // the file store builds a path from an id.
      const skill = (await catalog.list()).find((candidate) => candidate.id === name)
      if (skill === undefined) return undefined
      return {
        description: skill.description,
        messages: [{ role: 'user', content: { type: 'text', text: skill.instructions } }],
      }
    },
  }
}
