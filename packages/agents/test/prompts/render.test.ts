import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { renderPromptTemplate, resolveInstruction } from '../../src/prompts/render.js'
import { createFilePromptTemplateStore } from '../../src/prompts/store.js'
import type { PromptTemplateStore } from '../../src/prompts/types.js'

describe('renderPromptTemplate', () => {
  it('substitutes every placeholder it is given a value for', () => {
    expect(
      renderPromptTemplate('Hello {{name}}, you are {{age}}.', { name: 'Ada', age: '36' }),
    ).toBe('Hello Ada, you are 36.')
  })

  it('leaves text with no placeholder untouched', () => {
    expect(renderPromptTemplate('Plain text.', {})).toBe('Plain text.')
  })

  it("throws explicitly on a placeholder no value was supplied for, per the fiche's known pitfall", () => {
    expect(() => renderPromptTemplate('Hello {{name}}.', {})).toThrow()
    try {
      renderPromptTemplate('Hello {{name}}.', {})
      expect.unreachable()
    } catch (error) {
      expect(error).toMatchObject({ code: 'PROMPT_TEMPLATE_PLACEHOLDER_UNRESOLVED' })
    }
  })

  it('allows an explicitly empty value, distinct from an absent one', () => {
    expect(renderPromptTemplate('[{{empty}}]', { empty: '' })).toBe('[]')
  })
})

describe('resolveInstruction', () => {
  let dir: string
  let store: PromptTemplateStore

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'cogenta-resolve-instruction-'))
    store = createFilePromptTemplateStore({ dir })
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it("falls back to the tool's own text on a site with no store at all (R2/fiche 45 §4)", async () => {
    const result = await resolveInstruction({
      store: undefined,
      id: 'rewrite',
      fallback: () => 'the original hard-coded instruction',
      vars: {},
    })
    expect(result).toBe('the original hard-coded instruction')
  })

  it('falls back when the store exists but was never seeded for this id', async () => {
    const result = await resolveInstruction({
      store,
      id: 'rewrite',
      fallback: () => 'the original hard-coded instruction',
      vars: {},
    })
    expect(result).toBe('the original hard-coded instruction')
  })

  it('reads and renders the stored template once one exists, and the fallback stops mattering', async () => {
    await store.create({
      name: 'Rewrite',
      description: '',
      category: 'text',
      template: 'A custom instruction for {{who}}.',
    })
    const result = await resolveInstruction({
      store,
      id: 'rewrite',
      fallback: () => 'never used',
      vars: { who: 'the editor' },
    })
    expect(result).toBe('A custom instruction for the editor.')
  })

  it('changes behaviour the moment an admin edits the template — no restart, no redeploy', async () => {
    const created = await store.create({
      name: 'Rewrite',
      description: '',
      category: 'text',
      template: 'First version.',
    })
    const before = await resolveInstruction({ store, id: created.id, fallback: () => '', vars: {} })
    expect(before).toBe('First version.')

    await store.update(created.id, { template: 'Edited version.' })

    const after = await resolveInstruction({ store, id: created.id, fallback: () => '', vars: {} })
    expect(after).toBe('Edited version.')
  })
})
