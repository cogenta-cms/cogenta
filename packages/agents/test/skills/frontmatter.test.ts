import { describe, expect, it } from 'vitest'
import { parseSkillFile, renderSkillFile } from '../../src/skills/frontmatter.js'

describe('parseSkillFile', () => {
  it('parses name and description with no version field — a real Claude Code/Codex SKILL.md', () => {
    const raw = [
      '---',
      'name: new-package',
      'description: Use when creating a new @cogenta/* package in the monorepo.',
      '---',
      '',
      'Body text.',
      '',
    ].join('\n')

    const result = parseSkillFile('new-package/SKILL.md', raw)

    expect(result.metadata).toEqual({
      name: 'new-package',
      description: 'Use when creating a new @cogenta/* package in the monorepo.',
    })
    expect(result.metadata.version).toBeUndefined()
    expect(result.instructions).toBe('Body text.')
  })

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

  it('still requires name even though version is optional', () => {
    const raw = '---\ndescription: Missing a name.\n---\nbody'
    expect(() => parseSkillFile('bad/SKILL.md', raw)).toThrowError(/name/)
  })
})

describe('renderSkillFile', () => {
  it('round-trips through parseSkillFile with no version', () => {
    const rendered = renderSkillFile(
      { name: 'style-guide', description: 'House style.' },
      'Use British spelling.',
    )
    expect(rendered).not.toContain('version:')

    const parsed = parseSkillFile('style-guide/SKILL.md', rendered)
    expect(parsed.metadata).toEqual({ name: 'style-guide', description: 'House style.' })
    expect(parsed.instructions).toBe('Use British spelling.')
  })

  it('keeps version when present', () => {
    const rendered = renderSkillFile(
      { name: 'cve-triage', version: '1.0.0', description: 'Triage a CVE.' },
      'Do the thing.',
    )
    const parsed = parseSkillFile('cve-triage/SKILL.md', rendered)
    expect(parsed.metadata).toEqual({
      name: 'cve-triage',
      version: '1.0.0',
      description: 'Triage a CVE.',
    })
  })
})
