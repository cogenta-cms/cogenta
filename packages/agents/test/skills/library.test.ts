import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { AgentSkillStore } from '../../src/skills/library.js'
import {
  builtinAgentSkillSeeds,
  createFileAgentSkillStore,
  ensureBuiltinAgentSkills,
} from '../../src/skills/library.js'

let dir: string
let store: AgentSkillStore

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'cogenta-agent-skills-'))
  store = createFileAgentSkillStore({ dir })
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('createFileAgentSkillStore', () => {
  it('creates, lists and updates a skill', async () => {
    const created = await store.create({
      name: 'Style guide',
      description: 'House style.',
      instructions: 'Use British spelling.',
    })
    expect(created.enabledByDefault).toBe(true)
    expect(created.builtin).toBe(false)

    const updated = await store.update(created.id, { instructions: 'Use American spelling.' })
    expect(updated.instructions).toBe('Use American spelling.')
    expect((await store.list()).map((s) => s.name)).toEqual(['Style guide'])
  })

  it('refuses a duplicate name', async () => {
    await store.create({ name: 'Dup', description: '', instructions: '' })
    await expect(
      store.create({ name: 'Dup', description: '', instructions: '' }),
    ).rejects.toMatchObject({ code: 'AGENT_SKILL_DUPLICATE' })
  })

  it('refuses to remove a builtin skill', async () => {
    const created = await store.create({ name: 'Builtin', description: '', instructions: '' }, true)
    await expect(store.remove(created.id)).rejects.toMatchObject({
      code: 'AGENT_SKILL_BUILTIN_UNDELETABLE',
    })
  })

  it('removes a non-builtin skill', async () => {
    const created = await store.create({ name: 'Removable', description: '', instructions: '' })
    await store.remove(created.id)
    expect(await store.get(created.id)).toBeUndefined()
  })
})

describe('ensureBuiltinAgentSkills', () => {
  it('seeds exactly the three documented defaults, enabled by default', async () => {
    await ensureBuiltinAgentSkills(store)
    const all = await store.list()
    expect(all).toHaveLength(builtinAgentSkillSeeds().length)
    expect(all.length).toBeGreaterThanOrEqual(3)
    for (const skill of all) {
      expect(skill.enabledByDefault).toBe(true)
      expect(skill.builtin).toBe(true)
    }
  })

  it('is idempotent and preserves an edit made after the first seeding', async () => {
    await ensureBuiltinAgentSkills(store)
    const [first] = await store.list()
    if (first === undefined) throw new Error('expected at least one seeded skill')
    await store.update(first.id, { enabledByDefault: false })

    await ensureBuiltinAgentSkills(store)

    const all = await store.list()
    expect(all).toHaveLength(builtinAgentSkillSeeds().length)
    expect(all.find((s) => s.id === first.id)?.enabledByDefault).toBe(false)
  })
})
