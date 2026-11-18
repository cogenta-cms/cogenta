import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { isCogentaError } from '@cogenta/core'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { type AgentSkillStore, createFileAgentSkillStore } from '../../../src/skills/library.js'
import { createSkillsListTool, createSkillsReadTool } from '../../../src/tools/core/skills.js'
import type { ToolContext } from '../../../src/tools/types.js'

const CTX: ToolContext = {
  site: { name: 'news', locales: ['en', 'fr'], defaultLocale: 'en' },
  actor: { id: 'apikey:k1', roles: ['editor'] },
  logger: { info: () => undefined, warn: () => undefined, error: () => undefined },
  signal: new AbortController().signal,
}

let dir: string
let store: AgentSkillStore

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'cogenta-skills-tool-'))
  // The very store the admin screen writes: no second one for the tools.
  store = createFileAgentSkillStore({ dir })
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('skills.list', () => {
  it('lists id, name and description of every skill, sorted by name, without the bodies', async () => {
    await store.create({
      name: 'Zeta tone',
      description: 'When writing a headline.',
      instructions: 'Keep it short.',
    })
    await store.create({
      name: 'Alpha checklist',
      description: 'Before publishing.',
      instructions: 'Check the links.',
    })

    const result = await createSkillsListTool(store).execute({}, CTX)

    expect(result.skills).toEqual([
      { id: 'alpha-checklist', name: 'Alpha checklist', description: 'Before publishing.' },
      { id: 'zeta-tone', name: 'Zeta tone', description: 'When writing a headline.' },
    ])
    expect(JSON.stringify(result)).not.toContain('Check the links')
  })

  it('lists nothing for a site without skills', async () => {
    expect(await createSkillsListTool(store).execute({}, CTX)).toEqual({ skills: [] })
  })

  it('is a read-only tool behind the skills.read permission', () => {
    const tool = createSkillsListTool(store)
    expect(tool.permissions).toEqual(['skills.read'])
    expect(tool.sideEffects).toBe(false)
  })
})

describe('skills.read', () => {
  it('returns the full SKILL.md of one skill, frontmatter included', async () => {
    const skill = await store.create({
      name: 'Article voice',
      description: 'How to write an article.',
      instructions: 'Write in the second person.\n\nNever promise a date.',
    })

    const result = await createSkillsReadTool(store).execute({ id: skill.id }, CTX)

    expect(result).toEqual({
      id: 'article-voice',
      name: 'Article voice',
      description: 'How to write an article.',
      content: skill.content,
    })
    expect(result.content).toContain('name: Article voice')
    expect(result.content).toContain('Never promise a date.')
  })

  it('reflects an edit made in the admin on the next read', async () => {
    const skill = await store.create({
      name: 'Article voice',
      description: 'How to write an article.',
      instructions: 'First version.',
    })
    await store.update(skill.id, { instructions: 'Second version.' })

    const result = await createSkillsReadTool(store).execute({ id: skill.id }, CTX)

    expect(result.content).toContain('Second version.')
    expect(result.content).not.toContain('First version.')
  })

  it('names the way out when the id is unknown', async () => {
    const attempt = createSkillsReadTool(store).execute({ id: 'ghost' }, CTX)

    await expect(attempt).rejects.toSatisfy(
      (error) =>
        isCogentaError(error) &&
        error.code === 'AGENT_SKILL_UNKNOWN' &&
        (error.hint ?? '').includes('skills.list'),
    )
  })

  it('never reads a path outside the store: an id is a folder name, not a path', async () => {
    const attempt = createSkillsReadTool(store).execute({ id: '../../etc/passwd' }, CTX)

    await expect(attempt).rejects.toSatisfy(
      (error) => isCogentaError(error) && error.code === 'AGENT_SKILL_UNKNOWN',
    )
  })

  it('is a read-only tool behind the skills.read permission', () => {
    const tool = createSkillsReadTool(store)
    expect(tool.permissions).toEqual(['skills.read'])
    expect(tool.sideEffects).toBe(false)
  })
})
