import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  builtinPromptTemplateSeeds,
  ensureBuiltinPromptTemplates,
} from '../../src/prompts/seeds.js'
import { createFilePromptTemplateStore } from '../../src/prompts/store.js'
import type { PromptTemplateStore } from '../../src/prompts/types.js'

/**
 * Fiche 45 §5: "suite de store identique à celle de `AgentSkillStore`" —
 * mirrors `test/skills/library.test.ts`'s shape (create/list/update,
 * duplicate refusal, builtin protection, seeding) even though what the two
 * stores hold differs.
 */

let dir: string
let store: PromptTemplateStore

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'cogenta-prompt-templates-'))
  store = createFilePromptTemplateStore({ dir })
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('createFilePromptTemplateStore', () => {
  it('creates, lists and updates a template', async () => {
    const created = await store.create({
      name: 'Greeting',
      description: 'Says hello.',
      category: 'text',
      template: 'Say hello to {{name}}.',
    })
    expect(created.builtin).toBe(false)
    expect(created.category).toBe('text')

    const updated = await store.update(created.id, { template: 'Say hi to {{name}}.' })
    expect(updated.template).toBe('Say hi to {{name}}.')
    expect((await store.list()).map((t) => t.name)).toEqual(['Greeting'])
  })

  it('refuses a duplicate name', async () => {
    await store.create({ name: 'Dup', description: '', category: 'text', template: '' })
    await expect(
      store.create({ name: 'Dup', description: '', category: 'text', template: '' }),
    ).rejects.toMatchObject({ code: 'PROMPT_TEMPLATE_DUPLICATE' })
  })

  it('refuses an unknown id on update', async () => {
    await expect(store.update('does-not-exist', { template: 'x' })).rejects.toMatchObject({
      code: 'PROMPT_TEMPLATE_UNKNOWN',
    })
  })

  it('refuses to remove a builtin template', async () => {
    const created = await store.create(
      { name: 'Builtin', description: '', category: 'text', template: '' },
      true,
    )
    await expect(store.remove(created.id)).rejects.toMatchObject({
      code: 'PROMPT_TEMPLATE_BUILTIN_UNDELETABLE',
    })
  })

  it('still allows editing a builtin template in place', async () => {
    const created = await store.create(
      { name: 'Builtin', description: '', category: 'text', template: 'original' },
      true,
    )
    const updated = await store.update(created.id, { template: 'edited' })
    expect(updated.template).toBe('edited')
    expect(updated.builtin).toBe(true)
  })

  it('removes a non-builtin template', async () => {
    const created = await store.create({
      name: 'Removable',
      description: '',
      category: 'text',
      template: '',
    })
    await store.remove(created.id)
    expect(await store.get(created.id)).toBeUndefined()
  })

  it('reads a template back by id across a fresh store instance pointed at the same directory', async () => {
    const created = await store.create({
      name: 'Persisted',
      description: '',
      category: 'text',
      template: 'x',
    })
    const secondInstance = createFilePromptTemplateStore({ dir })
    expect((await secondInstance.get(created.id))?.name).toBe('Persisted')
  })
})

describe('ensureBuiltinPromptTemplates', () => {
  // Fifteen sequential file creates under a slow shared disk can outrun
  // vitest's 5s default — the same family of environment slowness already
  // documented for `ensureBuiltinAgentSkills`'s own idempotency test, not a
  // correctness issue with either store.
  const SEED_TIMEOUT_MS = 20_000

  it(
    'seeds every documented builtin, marked builtin',
    async () => {
      await ensureBuiltinPromptTemplates(store)
      const all = await store.list()
      expect(all).toHaveLength(builtinPromptTemplateSeeds().length)
      for (const template of all) {
        expect(template.builtin).toBe(true)
      }
    },
    SEED_TIMEOUT_MS,
  )

  it(
    'is idempotent and preserves an edit made after the first seeding',
    async () => {
      await ensureBuiltinPromptTemplates(store)
      const [first] = await store.list()
      if (first === undefined) throw new Error('expected at least one seeded template')
      await store.update(first.id, { description: 'edited' })

      await ensureBuiltinPromptTemplates(store)

      const all = await store.list()
      expect(all).toHaveLength(builtinPromptTemplateSeeds().length)
      expect(all.find((t) => t.id === first.id)?.description).toBe('edited')
    },
    SEED_TIMEOUT_MS,
  )

  it(
    'seeds ids the assist tools resolve by (fiche 45 §4)',
    async () => {
      await ensureBuiltinPromptTemplates(store)
      for (const id of ['rewrite', 'proofread', 'translate', 'classify', 'content-chat']) {
        expect(await store.get(id)).toBeDefined()
      }
    },
    SEED_TIMEOUT_MS,
  )
})
