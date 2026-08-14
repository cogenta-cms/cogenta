import { describe, expect, it } from 'vitest'
import { parseSkillFile } from '../../src/skills/frontmatter.js'

describe('parseSkillFile', () => {
  it('parses name, version and description, and trims the body', () => {
    const raw = [
      '---',
      'name: cve-triage',
      'version: 1.0.0',
      'description: Triages a CVE against the site’s dependency graph.',
      '---',
      '',
      '# Instructions',
      '',
      'Do the thing.',
      '',
    ].join('\n')

    const result = parseSkillFile('cve-triage/SKILL.md', raw)

    expect(result.metadata).toEqual({
      name: 'cve-triage',
      version: '1.0.0',
      description: 'Triages a CVE against the site’s dependency graph.',
    })
    expect(result.instructions).toBe('# Instructions\n\nDo the thing.')
  })

  it('throws SKILL_DEFINITION_INVALID when there is no frontmatter block', () => {
    expect(() => parseSkillFile('bad/SKILL.md', 'just some text')).toThrowError(
      /no --- frontmatter block/,
    )
  })

  it('throws SKILL_DEFINITION_INVALID when a required field is missing', () => {
    const raw = '---\nname: cve-triage\nversion: 1.0.0\n---\nbody'
    expect(() => parseSkillFile('bad/SKILL.md', raw)).toThrowError(/description/)
  })
})
