import { CogentaError } from '@cogenta/core'
import type { SkillMetadata } from './types.js'

const REQUIRED_FIELDS = ['name', 'description'] as const

/**
 * Deliberately not a YAML parser (R9: no new dependency for a handful of flat
 * string fields) — `---\nkey: value\n---\nbody`, one `key: value` per line,
 * nothing nested.
 *
 * `version` is deliberately **not** required (L24 task 4): a real
 * Claude Code/Codex `SKILL.md` — see any `SKILL.md` under this very repo's
 * `.claude/skills/` directory — only ever carries `name` and `description`.
 * Requiring a third field
 * this format doesn't have would refuse the exact copy-paste this task exists
 * to support. `file-store.ts`'s marketplace registry (L7) still writes a
 * `version` (it needs one, to compare installed-vs-available), so this parser
 * keeps reading it when present — it is just never demanded.
 */
export function parseSkillFile(
  path: string,
  raw: string,
): { readonly metadata: SkillMetadata; readonly instructions: string } {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(raw)
  if (match === null) {
    throw new CogentaError({
      code: 'SKILL_DEFINITION_INVALID',
      message: `"${path}" has no --- frontmatter block.`,
      hint: 'Start the file with --- \\n name: ... \\n description: ... \\n ---',
    })
  }
  const [, frontmatter = '', body = ''] = match

  const fields: Record<string, string> = {}
  for (const line of frontmatter.split('\n')) {
    if (line.trim() === '') continue
    const separatorIndex = line.indexOf(':')
    if (separatorIndex === -1) continue
    const key = line.slice(0, separatorIndex).trim()
    const value = line.slice(separatorIndex + 1).trim()
    fields[key] = value
  }

  const missing = REQUIRED_FIELDS.filter((field) => fields[field] === undefined)
  if (missing.length > 0) {
    throw new CogentaError({
      code: 'SKILL_DEFINITION_INVALID',
      message: `"${path}" is missing required frontmatter field(s): ${missing.join(', ')}.`,
      hint: 'A skill needs at least name and description in its frontmatter.',
    })
  }

  return {
    metadata: {
      name: fields.name as string,
      description: fields.description as string,
      ...(fields.version === undefined ? {} : { version: fields.version }),
    },
    instructions: body.trim(),
  }
}

/**
 * The inverse of `parseSkillFile` — renders a skill back to `SKILL.md` text.
 * Used by `library.ts` to write the canonical on-disk form of a skill edited
 * through the structured `AgentSkillStore` contract. Field order (`name`,
 * `description`, then `version` only if present) matches every real
 * Claude Code/Codex skill this project has seen, so a file this function
 * writes reads exactly like one a human would have written by hand.
 */
export function renderSkillFile(metadata: SkillMetadata, instructions: string): string {
  const lines = [`name: ${metadata.name}`, `description: ${metadata.description}`]
  if (metadata.version !== undefined) lines.splice(1, 0, `version: ${metadata.version}`)
  const body = instructions.trim()
  return `---\n${lines.join('\n')}\n---\n\n${body}\n`
}
