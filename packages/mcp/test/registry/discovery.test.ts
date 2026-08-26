import { createSqliteHandle, type DatabaseHandle } from '@cogenta/core'
import { describe, expect, it } from 'vitest'
import { discoverMcpConnection } from '../../src/registry/discovery.js'
import { createMcpConnectionStore, type McpConnectionStore } from '../../src/registry/store.js'
import { ensureMcpConnectionTables } from '../../src/registry/tables.js'
import { fakeMcpServer } from '../helpers/fake-server.js'

async function testStore(): Promise<McpConnectionStore> {
  const db: DatabaseHandle = await createSqliteHandle({ url: ':memory:' })
  await ensureMcpConnectionTables(db)
  return createMcpConnectionStore(db, { signingKey: 'test-signing-key-not-a-real-secret' })
}

describe('discoverMcpConnection', () => {
  it('returns the real tools/list result on success', async () => {
    const store = await testStore()
    const connection = await store.create({
      name: 'files',
      transport: 'stdio',
      command: '/usr/bin/mcp-files',
      confirmUnsandboxed: true,
    })
    const { child } = fakeMcpServer({
      initialize: () => ({ serverInfo: { name: 'files-server', version: '1.0.0' } }),
      'tools/list': () => ({
        tools: [
          { name: 'read_file', description: 'Read a file.', inputSchema: { type: 'object' } },
        ],
      }),
    })

    const result = await discoverMcpConnection({ connection, spawnFn: () => child })

    expect(result).toEqual({
      status: 'ok',
      tools: [{ name: 'read_file', description: 'Read a file.', inputSchema: { type: 'object' } }],
    })
  })

  it('reports a failure instead of throwing when the server never responds', async () => {
    const store = await testStore()
    const connection = await store.create({
      name: 'hung',
      transport: 'stdio',
      command: '/usr/bin/mcp-hung',
      confirmUnsandboxed: true,
    })
    const { child } = fakeMcpServer({})

    const result = await discoverMcpConnection({
      connection,
      spawnFn: () => child,
      callTimeoutMs: 30,
    })

    expect(result.status).toBe('error')
  })

  it('refuses an http connection honestly rather than pretending to test it', async () => {
    const store = await testStore()
    const connection = await store.create({
      name: 'remote-http',
      transport: 'http',
      url: 'https://example.com/mcp',
    })

    const result = await discoverMcpConnection({ connection })

    expect(result.status).toBe('error')
    if (result.status === 'error') {
      expect(result.error).toMatch(/not implemented/i)
    }
  })

  it('injects the decrypted secret into the configured environment variable, never in the clear env otherwise', async () => {
    const store = await testStore()
    const connection = await store.create({
      name: 'authed',
      transport: 'stdio',
      command: '/usr/bin/mcp-authed',
      confirmUnsandboxed: true,
      authKind: 'api_key',
      secret: 'sk-live-value',
      secretEnvVar: 'THING_API_KEY',
    })
    const secret = await store.decryptSecret(connection.id)
    const { child } = fakeMcpServer({
      initialize: () => ({ serverInfo: { name: 'authed', version: '1.0.0' } }),
      'tools/list': () => ({ tools: [] }),
    })
    let seenEnv: Readonly<Record<string, string>> | undefined
    const spawnFn = (
      _command: string,
      _args: readonly string[],
      spawnOptions: { readonly env: Readonly<Record<string, string>> },
    ) => {
      seenEnv = spawnOptions.env
      return child
    }

    await discoverMcpConnection({ connection, secret, spawnFn })

    expect(seenEnv).toEqual({ THING_API_KEY: 'sk-live-value' })
  })
})
