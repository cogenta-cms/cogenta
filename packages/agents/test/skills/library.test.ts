import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
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

describe('reference-folder resources (fiche 57)', () => {
  it('creates the three standard sub-folders empty at create()', async () => {
    const created = await store.create({ name: 'Layout check', description: '', instructions: '' })
    expect(await store.listResources(created.id)).toEqual([])
    for (const resourceDir of ['references', 'scripts', 'assets']) {
      const info = await stat(join(dir, created.id, resourceDir))
      expect(info.isDirectory()).toBe(true)
    }
  })

  it('adds and lists a resource under each standard folder', async () => {
    const created = await store.create({ name: 'Docs', description: '', instructions: '' })
    await store.addResource(created.id, 'references/style-guide.md', '# Style guide')
    await store.addResource(created.id, 'scripts/lint.sh', '#!/bin/sh\necho ok')
    await store.addResource(created.id, 'assets/logo.svg', new Uint8Array([1, 2, 3]))

    const resources = await store.listResources(created.id)
    expect(resources.map((r) => r.path).sort()).toEqual([
      'assets/logo.svg',
      'references/style-guide.md',
      'scripts/lint.sh',
    ])
    for (const resource of resources) {
      expect(resource.size).toBeGreaterThan(0)
      expect(resource.updatedAt.length).toBeGreaterThan(0)
    }
  })

  it('overwrites a resource written twice at the same path', async () => {
    const created = await store.create({ name: 'Overwrite', description: '', instructions: '' })
    await store.addResource(created.id, 'references/note.md', 'first')
    await store.addResource(created.id, 'references/note.md', 'second, longer body')
    const resources = await store.listResources(created.id)
    expect(resources).toHaveLength(1)
    expect(resources[0]?.size).toBe(Buffer.byteLength('second, longer body'))
  })

  it('removes a resource', async () => {
    const created = await store.create({
      name: 'Removable resource',
      description: '',
      instructions: '',
    })
    await store.addResource(created.id, 'assets/template.txt', 'hello')
    await store.removeResource(created.id, 'assets/template.txt')
    expect(await store.listResources(created.id)).toEqual([])
  })

  it('refuses to remove a resource that does not exist', async () => {
    const created = await store.create({
      name: 'Missing resource',
      description: '',
      instructions: '',
    })
    await expect(store.removeResource(created.id, 'assets/ghost.txt')).rejects.toMatchObject({
      code: 'AGENT_SKILL_RESOURCE_UNKNOWN',
    })
  })

  it('refuses to write outside the three standard folders', async () => {
    const created = await store.create({ name: 'Guarded', description: '', instructions: '' })
    await expect(store.addResource(created.id, 'notes.md', 'x')).rejects.toMatchObject({
      code: 'AGENT_SKILL_RESOURCE_INVALID',
    })
    await expect(store.addResource(created.id, 'other/notes.md', 'x')).rejects.toMatchObject({
      code: 'AGENT_SKILL_RESOURCE_INVALID',
    })
  })

  it('refuses a path that tries to escape the skill directory', async () => {
    const created = await store.create({ name: 'Escape check', description: '', instructions: '' })
    await expect(
      store.addResource(created.id, 'references/../../../etc/passwd', 'x'),
    ).rejects.toMatchObject({ code: 'AGENT_SKILL_RESOURCE_INVALID' })
    await expect(store.removeResource(created.id, 'assets/../../secret.txt')).rejects.toMatchObject(
      { code: 'AGENT_SKILL_RESOURCE_INVALID' },
    )
  })

  it('refuses a bare folder with no file segment', async () => {
    const created = await store.create({ name: 'Bare folder', description: '', instructions: '' })
    await expect(store.addResource(created.id, 'references', 'x')).rejects.toMatchObject({
      code: 'AGENT_SKILL_RESOURCE_INVALID',
    })
    await expect(store.addResource(created.id, 'references/', 'x')).rejects.toMatchObject({
      code: 'AGENT_SKILL_RESOURCE_INVALID',
    })
  })

  it('throws AGENT_SKILL_UNKNOWN for resource operations on an unknown skill', async () => {
    await expect(store.listResources('ghost')).rejects.toMatchObject({
      code: 'AGENT_SKILL_UNKNOWN',
    })
    await expect(store.addResource('ghost', 'references/x.md', 'x')).rejects.toMatchObject({
      code: 'AGENT_SKILL_UNKNOWN',
    })
    await expect(store.removeResource('ghost', 'references/x.md')).rejects.toMatchObject({
      code: 'AGENT_SKILL_UNKNOWN',
    })
  })

  it('lists an empty resource set for a skill created before this fiche (no sub-folders on disk)', async () => {
    // Exactly the contract test the fiche's own acceptance criteria name: a
    // skill directory that only has SKILL.md/.meta.json — never touched by
    // this fiche's create() — must not error on listResources().
    await mkdir(join(dir, 'legacy-skill'), { recursive: true })
    await writeFile(
      join(dir, 'legacy-skill', 'SKILL.md'),
      '---\nname: legacy-skill\ndescription: Pre-existing skill.\n---\n\nBody.\n',
      'utf8',
    )
    expect(await store.listResources('legacy-skill')).toEqual([])
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
