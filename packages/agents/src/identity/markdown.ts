import type { AgentIdentity } from './context.js'

/**
 * `AgentDeclaration.identity` (contract C) is documented as "a path to the
 * agent's identity document (role, objectives, style)" — a plain markdown
 * file, the same shape the contract's own example (`./identities/security.md`)
 * implies. Custom agents created from the admin (L22 task 1) have no
 * hand-written file to point at, so the store that persists them
 * (`agents/store.ts`) writes one from structured fields on every
 * create/update, and this module is the one place that renders and parses
 * that fixed, small format — never a general-purpose markdown parser, just
 * enough structure to round-trip `{ role, objectives, style }` losslessly.
 */

export interface AgentIdentityFields {
  readonly role: string
  readonly objectives: readonly string[]
  readonly style?: string
}

const OBJECTIVES_HEADING = '## Objectives'
const STYLE_HEADING = '## Style'

export function renderIdentityMarkdown(name: string, fields: AgentIdentityFields): string {
  const lines = [
    `# ${name}`,
    '',
    fields.role,
    '',
    OBJECTIVES_HEADING,
    ...(fields.objectives.length === 0
      ? ['(none declared)']
      : fields.objectives.map((objective) => `- ${objective}`)),
  ]
  if (fields.style !== undefined && fields.style.trim().length > 0) {
    lines.push('', STYLE_HEADING, fields.style)
  }
  return `${lines.join('\n')}\n`
}

/**
 * The inverse of `renderIdentityMarkdown` — tolerant of a hand-edited file
 * (a real deployment may replace the generated file with prose of its own):
 * the first non-heading paragraph is the role, `## Objectives` is a bullet
 * list, `## Style` is free text. A file with none of these headings still
 * parses — its entire body becomes the role, with no objectives and no
 * style — rather than throwing over a document that simply is not shaped
 * this way.
 */
export function parseIdentityMarkdown(name: string, text: string): AgentIdentity {
  const lines = text.split('\n')
  let section: 'role' | 'objectives' | 'style' = 'role'
  const roleLines: string[] = []
  const objectives: string[] = []
  const styleLines: string[] = []

  for (const rawLine of lines) {
    const line = rawLine.trimEnd()
    if (/^#\s+/u.test(line)) continue // the "# <name>" title line
    if (line.trim() === OBJECTIVES_HEADING) {
      section = 'objectives'
      continue
    }
    if (line.trim() === STYLE_HEADING) {
      section = 'style'
      continue
    }
    if (section === 'role') {
      if (line.trim().length > 0) roleLines.push(line.trim())
    } else if (section === 'objectives') {
      const bullet = line.trim()
      if (bullet.startsWith('- ')) {
        const objective = bullet.slice(2).trim()
        if (objective.length > 0 && objective !== '(none declared)') objectives.push(objective)
      }
    } else {
      styleLines.push(line)
    }
  }

  const role = roleLines.join(' ').trim()
  const style = styleLines.join('\n').trim()

  return {
    name,
    role: role.length > 0 ? role : text.trim(),
    objectives,
    ...(style.length > 0 ? { style } : {}),
  }
}
