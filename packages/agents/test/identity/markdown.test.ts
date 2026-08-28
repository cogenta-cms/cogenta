import { describe, expect, it } from 'vitest'
import { parseIdentityMarkdown, renderIdentityMarkdown } from '../../src/identity/markdown.js'

describe('renderIdentityMarkdown / parseIdentityMarkdown', () => {
  it('round-trips role, objectives, style and system prompt losslessly', () => {
    const fields = {
      role: 'A test agent.',
      objectives: ['Do the thing.', 'Never do the other thing.'],
      style: 'Terse.',
      systemPrompt: 'Always reply in valid JSON. Never invent a fact.',
    }
    const markdown = renderIdentityMarkdown('Test Agent', fields)
    const parsed = parseIdentityMarkdown('Test Agent', markdown)

    expect(parsed.role).toBe(fields.role)
    expect(parsed.objectives).toEqual(fields.objectives)
    expect(parsed.style).toBe(fields.style)
    expect(parsed.systemPrompt).toBe(fields.systemPrompt)
  })

  it('writes a fourth "## System prompt" section, after "## Style"', () => {
    const markdown = renderIdentityMarkdown('Test Agent', {
      role: 'role',
      objectives: [],
      style: 'terse',
      systemPrompt: 'always cite sources',
    })
    const styleIndex = markdown.indexOf('## Style')
    const systemPromptIndex = markdown.indexOf('## System prompt')

    expect(styleIndex).toBeGreaterThanOrEqual(0)
    expect(systemPromptIndex).toBeGreaterThan(styleIndex)
    expect(markdown).toContain('always cite sources')
  })

  it('omits the "## System prompt" section entirely when absent', () => {
    const markdown = renderIdentityMarkdown('Test Agent', { role: 'role', objectives: [] })
    expect(markdown).not.toContain('## System prompt')
  })

  it('parses a pre-fiche-55 document (no "## System prompt" heading) without error, systemPrompt undefined', () => {
    const legacyMarkdown = [
      '# Test Agent',
      '',
      'A test agent.',
      '',
      '## Objectives',
      '- Do the thing.',
      '',
      '## Style',
      'Terse.',
      '',
    ].join('\n')

    const parsed = parseIdentityMarkdown('Test Agent', legacyMarkdown)

    expect(parsed.role).toBe('A test agent.')
    expect(parsed.objectives).toEqual(['Do the thing.'])
    expect(parsed.style).toBe('Terse.')
    expect(parsed.systemPrompt).toBeUndefined()
  })

  it('omits systemPrompt from the parsed result when blank', () => {
    const parsed = parseIdentityMarkdown('Test Agent', 'role\n\n## Objectives\n(none declared)')
    expect(parsed.systemPrompt).toBeUndefined()
  })
})
