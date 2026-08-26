import { createSqliteHandle, type DatabaseHandle } from '@cogenta/core'
import { beforeEach, describe, expect, it } from 'vitest'
import { createMcpConnectionStore, type McpConnectionStore } from '../../src/registry/store.js'
import { ensureMcpConnectionTables } from '../../src/registry/tables.js'

async function testDb(): Promise<DatabaseHandle> {
  const db = await createSqliteHandle({ url: ':memory:' })
  await ensureMcpConnectionTables(db)
  return db
}

describe('createMcpConnectionStore', () => {
  let store: McpConnectionStore

  beforeEach(async () => {
    const db = await testDb()
    store = createMcpConnectionStore(db, { signingKey: 'test-signing-key-not-a-real-secret' })
  })

  describe('fiche 58 task 1bis — mandatory confirmation for a stdio connection', () => {
    it('refuses to create a stdio connection without confirmUnsandboxed: true', async () => {
      await expect(
        store.create({ name: 'no-confirm', transport: 'stdio', command: '/usr/bin/true' }),
      ).rejects.toMatchObject({ code: 'MCP_CONNECTION_CONFIRMATION_REQUIRED' })
    })

    it('refuses a stdio connection with confirmUnsandboxed explicitly false', async () => {
      await expect(
        store.create({
          name: 'explicit-false',
          transport: 'stdio',
          command: '/usr/bin/true',
          confirmUnsandboxed: false,
        }),
      ).rejects.toMatchObject({ code: 'MCP_CONNECTION_CONFIRMATION_REQUIRED' })
    })

    it('creates a stdio connection once confirmUnsandboxed is exactly true', async () => {
      const created = await store.create({
        name: 'confirmed',
        transport: 'stdio',
        command: '/usr/bin/true',
        confirmUnsandboxed: true,
      })
      expect(created.confirmedUnsandboxed).toBe(true)
    })

    it('never requires confirmation for an http connection (nothing is spawned)', async () => {
      const created = await store.create({
        name: 'http-conn',
        transport: 'http',
        url: 'https://example.com/mcp',
      })
      expect(created.confirmedUnsandboxed).toBe(true)
    })
  })

  it('creates a connection and lists it back', async () => {
    await store.create({
      name: 'files',
      transport: 'stdio',
      command: '/usr/bin/mcp-files',
      args: ['--root', '/data'],
      confirmUnsandboxed: true,
    })
    const list = await store.list()
    expect(list).toHaveLength(1)
    expect(list[0]?.name).toBe('files')
    expect(list[0]?.command).toBe('/usr/bin/mcp-files')
    expect(list[0]?.args).toEqual(['--root', '/data'])
    expect(list[0]?.status).toBe('unverified')
  })

  it('encrypts a saved secret at rest and never returns it on the summary', async () => {
    const created = await store.create({
      name: 'authed',
      transport: 'stdio',
      command: '/usr/bin/mcp-thing',
      confirmUnsandboxed: true,
      authKind: 'api_key',
      secret: 'sk-super-secret-value',
      secretEnvVar: 'THING_API_KEY',
    })

    expect(created.hasSecret).toBe(true)
    expect(JSON.stringify(created)).not.toContain('sk-super-secret-value')

    const decrypted = await store.decryptSecret(created.id)
    expect(decrypted).toBe('sk-super-secret-value')
  })

  it('throws MCP_CONNECTION_AUTH_INVALID decrypting a connection with no saved secret', async () => {
    const created = await store.create({
      name: 'no-secret',
      transport: 'stdio',
      command: '/usr/bin/true',
      confirmUnsandboxed: true,
    })
    await expect(store.decryptSecret(created.id)).rejects.toMatchObject({
      code: 'MCP_CONNECTION_AUTH_INVALID',
    })
  })

  it('records a successful discovery, replacing the discovered tool list', async () => {
    const created = await store.create({
      name: 'files',
      transport: 'stdio',
      command: '/usr/bin/mcp-files',
      confirmUnsandboxed: true,
    })
    const updated = await store.recordDiscovery(created.id, {
      status: 'ok',
      tools: [{ name: 'read_file', description: 'Read a file.', inputSchema: {} }],
    })
    expect(updated.status).toBe('ok')
    expect(updated.discoveredTools).toEqual([
      { name: 'read_file', description: 'Read a file.', inputSchema: {} },
    ])
    expect(updated.lastDiscoveredAt).toBeDefined()
  })

  it('records a failed discovery without touching previously exposed tools', async () => {
    const created = await store.create({
      name: 'files',
      transport: 'stdio',
      command: '/usr/bin/mcp-files',
      confirmUnsandboxed: true,
    })
    await store.recordDiscovery(created.id, {
      status: 'ok',
      tools: [{ name: 'read_file', description: 'Read a file.', inputSchema: {} }],
    })
    await store.setExposedTools(created.id, [
      {
        remoteName: 'read_file',
        localName: 'read_file',
        description: 'Read a file.',
        sideEffects: false,
        reversible: false,
        cost: 'low',
      },
    ])

    const afterFailure = await store.recordDiscovery(created.id, {
      status: 'error',
      error: 'connection refused',
    })

    expect(afterFailure.status).toBe('error')
    expect(afterFailure.lastError).toBe('connection refused')
    expect(afterFailure.exposedTools).toHaveLength(1)
  })

  describe('fiche 58 task 3 — "absent, pas refusée"', () => {
    it('refuses to expose a tool that was never in the last discovered list', async () => {
      const created = await store.create({
        name: 'files',
        transport: 'stdio',
        command: '/usr/bin/mcp-files',
        confirmUnsandboxed: true,
      })
      await store.recordDiscovery(created.id, {
        status: 'ok',
        tools: [{ name: 'read_file', description: 'Read a file.', inputSchema: {} }],
      })

      await expect(
        store.setExposedTools(created.id, [
          {
            remoteName: 'delete_everything',
            localName: 'delete_everything',
            description: 'Nothing this innocent.',
            sideEffects: true,
            reversible: false,
            cost: 'high',
          },
        ]),
      ).rejects.toMatchObject({ code: 'MCP_CONNECTION_TOOL_NOT_DISCOVERED' })
    })

    it('a newly created connection exposes no tool at all until the admin checks one', async () => {
      const created = await store.create({
        name: 'files',
        transport: 'stdio',
        command: '/usr/bin/mcp-files',
        confirmUnsandboxed: true,
      })
      expect(created.exposedTools).toEqual([])
    })
  })

  it('setEnabled toggles a connection off and back on', async () => {
    const created = await store.create({
      name: 'files',
      transport: 'stdio',
      command: '/usr/bin/mcp-files',
      confirmUnsandboxed: true,
    })
    expect(created.enabled).toBe(true)
    const disabled = await store.setEnabled(created.id, false)
    expect(disabled.enabled).toBe(false)
    const reenabled = await store.setEnabled(created.id, true)
    expect(reenabled.enabled).toBe(true)
  })

  it('remove() deletes the connection', async () => {
    const created = await store.create({
      name: 'files',
      transport: 'stdio',
      command: '/usr/bin/mcp-files',
      confirmUnsandboxed: true,
    })
    await store.remove(created.id)
    expect(await store.get(created.id)).toBeUndefined()
  })

  it('throws MCP_CONNECTION_NOT_FOUND for an unknown id', async () => {
    await expect(store.setEnabled('unknown-id', true)).rejects.toMatchObject({
      code: 'MCP_CONNECTION_NOT_FOUND',
    })
  })
})
