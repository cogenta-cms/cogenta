import { CogentaError } from '@cogenta/core'
import type { SkillMetadata } from './types.js'

const REQUIRED_FIELDS = ['name', 'version', 'description'] as const

/**
 * Deliberately not a YAML parser (R9: no new dependency for three flat
 * string fields) — `---\nkey: value\n---\nbody`, one `key: value` per line,
 * nothing nested.
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
      hint: 'Start the file with --- \\n name: ... \\n version: ... \\n description: ... \\n ---',
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
      hint: 'A skill needs name, version and description in its frontmatter.',
    })
  }

  return {
    metadata: {
      name: fields.name as string,
      version: fields.version as string,
      description: fields.description as string,
    },
    instructions: body.trim(),
  }
}
