import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { isCogentaError } from '@cogenta/core'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { AgentDeclarationInput, AgentDeclarationStore } from '../../src/agents/store.js'
import { createFileAgentDeclarationStore } from '../../src/agents/store.js'

let dir: string
let store: AgentDeclarationStore

const BASE_INPUT: AgentDeclarationInput = {
  name: 'Test Agent',
  identity: { role: 'A test agent.', objectives: ['Do the thing.'], style: 'Terse.' },
  model: { preferred: 'anthropic' },
  tools: ['content.read'],
}

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'cogenta-agents-store-'))
  store = createFileAgentDeclarationStore({ dir })
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('createFileAgentDeclarationStore', () => {
  it('starts empty', async () => {
    expect(await store.list()).toEqual([])
  })

  it('creates an agent and lists it back, enabled by default', async () => {
    const created = await store.create(BASE_INPUT)
    expect(created.name).toBe('Test Agent')
    expect(created.enabled).toBe(true)
    expect(created.builtin).toBe(false)
    expect(created.identity).toContain('test-agent')

    const listed = await store.list()
    expect(listed.map((a) => a.name)).toEqual(['Test Agent'])
  })

  it('round-trips the structured identity through the rendered markdown file', async () => {
    await store.create(BASE_INPUT)
    const identity = await store.readIdentity('Test Agent')
    expect(identity.role).toBe('A test agent.')
    expect(identity.objectives).toEqual(['Do the thing.'])
    expect(identity.style).toBe('Terse.')
  })

  it('refuses a duplicate name', async () => {
    await store.create(BASE_INPUT)
    await expect(store.create(BASE_INPUT)).rejects.toMatchObject({ code: 'AGENT_DUPLICATE' })
  })

  it('updates fields without disturbing the ones not patched', async () => {
    await store.create(BASE_INPUT)
    const updated = await store.update('Test Agent', { tools: ['content.read', 'media.read'] })
    expect(updated.tools).toEqual(['content.read', 'media.read'])
    expect(updated.model).toEqual({ preferred: 'anthropic' })
  })

  it('refuses to update an unknown agent', async () => {
    await expect(store.update('Ghost', { tools: [] })).rejects.toMatchObject({
      code: 'AGENT_UNKNOWN',
    })
  })

  it('toggles enabled independently of other fields', async () => {
    await store.create(BASE_INPUT)
    const disabled = await store.setEnabled('Test Agent', false)
    expect(disabled.enabled).toBe(false)
    const reEnabled = await store.setEnabled('Test Agent', true)
    expect(reEnabled.enabled).toBe(true)
  })

  it('removes a non-builtin agent', async () => {
    await store.create(BASE_INPUT)
    await store.remove('Test Agent')
    expect(await store.get('Test Agent')).toBeUndefined()
  })

  it('refuses to remove a builtin agent', async () => {
    await store.create(BASE_INPUT, true)
    try {
      await store.remove('Test Agent')
      expect.unreachable('should have thrown')
    } catch (error) {
      expect(isCogentaError(error)).toBe(true)
      if (isCogentaError(error)) expect(error.code).toBe('AGENT_BUILTIN_UNDELETABLE')
    }
    expect(await store.get('Test Agent')).toBeDefined()
  })

  it('slugifies names with accents and spaces into a stable id', async () => {
    const created = await store.create({ ...BASE_INPUT, name: 'Été Agent 42' })
    expect(created.id).toBe('ete-agent-42')
  })
})
