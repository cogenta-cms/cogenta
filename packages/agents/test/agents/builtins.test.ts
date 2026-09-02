import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  CONTENT_WATCH_AGENT_NAME,
  ensureBuiltinAgents,
  SECURITY_AGENT_NAME,
  SITE_MONITOR_AGENT_NAME,
  SUPERAGENT_NAME,
} from '../../src/agents/builtins.js'
import type { AgentDeclarationStore } from '../../src/agents/store.js'
import { createFileAgentDeclarationStore } from '../../src/agents/store.js'

let dir: string
let store: AgentDeclarationStore

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'cogenta-agents-builtins-'))
  store = createFileAgentDeclarationStore({ dir })
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('ensureBuiltinAgents', () => {
  it('seeds the superagent enabled, and the three examples disabled', async () => {
    await ensureBuiltinAgents(store)
    const byName = new Map((await store.list()).map((agent) => [agent.name, agent]))

    expect(byName.get(SUPERAGENT_NAME)?.enabled).toBe(true)
    expect(byName.get(SUPERAGENT_NAME)?.builtin).toBe(true)
    expect(byName.get(SECURITY_AGENT_NAME)?.enabled).toBe(false)
    expect(byName.get(SECURITY_AGENT_NAME)?.builtin).toBe(true)
    expect(byName.get(CONTENT_WATCH_AGENT_NAME)?.enabled).toBe(false)
    expect(byName.get(CONTENT_WATCH_AGENT_NAME)?.builtin).toBe(true)
    expect(byName.get(SITE_MONITOR_AGENT_NAME)?.enabled).toBe(false)
    expect(byName.get(SITE_MONITOR_AGENT_NAME)?.builtin).toBe(true)
    expect(byName.get(SITE_MONITOR_AGENT_NAME)?.tools).toEqual([
      'logs.read_not_found',
      'content.collections',
      'content.list',
      'redirects.create',
    ])
  })

  it('is idempotent — does not duplicate or reset an already-seeded, edited agent', async () => {
    await ensureBuiltinAgents(store)
    await store.setEnabled(SECURITY_AGENT_NAME, true)
    await store.update(SECURITY_AGENT_NAME, { tools: ['deps.scan'] })

    await ensureBuiltinAgents(store)

    const all = await store.list()
    expect(all.filter((agent) => agent.name === SECURITY_AGENT_NAME)).toHaveLength(1)
    const security = all.find((agent) => agent.name === SECURITY_AGENT_NAME)
    expect(security?.enabled).toBe(true) // the edit survived re-seeding
    expect(security?.tools).toEqual(['deps.scan'])
  })

  it('grants the read-only browse tools to a site seeded before they existed, and to nothing else', async () => {
    await ensureBuiltinAgents(store)
    // A superagent as it shipped before `content.collections`/`content.list`/
    // `content.schema` were added to the seed — the real state of any site
    // upgraded from that version, since re-seeding never rewrites an
    // existing agent.
    await store.update(SUPERAGENT_NAME, {
      tools: ['content.read', 'content.write_draft', 'media.read'],
    })
    // An operator who removed `content.read` on purpose is left alone.
    await store.update(SECURITY_AGENT_NAME, { tools: ['deps.scan'] })

    await ensureBuiltinAgents(store)

    const all = await store.list()
    expect(all.find((agent) => agent.name === SUPERAGENT_NAME)?.tools).toEqual([
      'content.read',
      'content.write_draft',
      'media.read',
      'content.collections',
      'content.list',
      'content.schema',
    ])
    expect(all.find((agent) => agent.name === SECURITY_AGENT_NAME)?.tools).toEqual(['deps.scan'])
  })

  it('only ever seeds exactly four agents', async () => {
    await ensureBuiltinAgents(store)
    expect(await store.list()).toHaveLength(4)
  })
})
