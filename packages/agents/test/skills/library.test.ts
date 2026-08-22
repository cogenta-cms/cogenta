import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
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

describe('portable SKILL.md import (L24 task 4)', () => {
  it('reads a real Claude Code SKILL.md (name + description only, no meta sidecar) dropped in by hand', async () => {
    // The exact scenario the lot's acceptance criterion describes: a
    // `SKILL.md` copied verbatim from this repo's own `.claude/skills/`
    // directory, with no `version` field and no `.meta.json` this store has
    // ever written — never created through `AgentSkillStore.create()`.
    const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..')
    const realSkillMd = await readFile(
      join(repoRoot, '.claude', 'skills', 'new-package', 'SKILL.md'),
      'utf8',
    )
    expect(realSkillMd).not.toContain('\nversion:')

    await mkdir(join(dir, 'new-package'), { recursive: true })
    await writeFile(join(dir, 'new-package', 'SKILL.md'), realSkillMd, 'utf8')

    const imported = await store.get('new-package')
    expect(imported?.name).toBe('new-package')
    expect(imported?.description).toContain('Use when creating a new @cogenta/* package')
    expect(imported?.instructions.length).toBeGreaterThan(0)
    // Never created through this store, so sensible defaults apply rather
    // than a crash on the missing `.meta.json`.
    expect(imported?.enabledByDefault).toBe(true)
    expect(imported?.builtin).toBe(false)

    expect((await store.list()).map((s) => s.id)).toContain('new-package')
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
