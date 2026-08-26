import { PassThrough } from 'node:stream'
import { createSqliteHandle, type DatabaseHandle } from '@cogenta/core'
import { describe, expect, it } from 'vitest'
import type { ChildProcessLike } from '../../src/client/types.js'
import { createMcpConnectionStore, type McpConnectionStore } from '../../src/registry/store.js'
import { ensureMcpConnectionTables } from '../../src/registry/tables.js'
import { buildMcpToolDefinitions } from '../../src/registry/tool-definitions.js'
import { fakeMcpServer } from '../helpers/fake-server.js'

async function testStore(): Promise<McpConnectionStore> {
  const db: DatabaseHandle = await createSqliteHandle({ url: ':memory:' })
  await ensureMcpConnectionTables(db)
  return createMcpConnectionStore(db, { signingKey: 'test-signing-key-not-a-real-secret' })
}

describe('buildMcpToolDefinitions', () => {
  it('wires no tool at all for a connection with nothing exposed yet', async () => {
    const store = await testStore()
    await store.create({
      name: 'files',
      transport: 'stdio',
      command: '/usr/bin/mcp-files',
      confirmUnsandboxed: true,
    })

    const assembly = await buildMcpToolDefinitions({ store })

    expect(assembly.definitions).toEqual([])
    await assembly.dispose()
  })

  it('wires exactly the checked tools, one ToolDefinition per exposed remote tool', async () => {
    const store = await testStore()
    const connection = await store.create({
      name: 'files',
      transport: 'stdio',
      command: '/usr/bin/mcp-files',
      confirmUnsandboxed: true,
    })
    await store.recordDiscovery(connection.id, {
      status: 'ok',
      tools: [
        { name: 'read_file', description: 'Read a file.', inputSchema: {} },
        { name: 'write_file', description: 'Write a file.', inputSchema: {} },
      ],
    })
    await store.setExposedTools(connection.id, [
      {
        remoteName: 'read_file',
        localName: 'read_file',
        description: 'Read a file.',
        sideEffects: false,
        reversible: false,
        cost: 'low',
      },
    ])
    const { child } = fakeMcpServer({
      initialize: () => ({ serverInfo: { name: 'files', version: '1.0.0' } }),
    })
    const spawnFn = () => child

    const assembly = await buildMcpToolDefinitions({ store, spawnFn })

    expect(assembly.definitions).toHaveLength(1)
    expect(assembly.definitions[0]?.permissions).toEqual([
      `mcp.external:${connection.id}.read_file`,
    ])
    await assembly.dispose()
  })

  it('shares one client per connection across all of its exposed tools, never one process per tool', async () => {
    const store = await testStore()
    const connection = await store.create({
      name: 'files',
      transport: 'stdio',
      command: '/usr/bin/mcp-files',
      confirmUnsandboxed: true,
    })
    await store.recordDiscovery(connection.id, {
      status: 'ok',
      tools: [
        { name: 'read_file', description: 'Read.', inputSchema: {} },
        { name: 'write_file', description: 'Write.', inputSchema: {} },
      ],
    })
    await store.setExposedTools(connection.id, [
      {
        remoteName: 'read_file',
        localName: 'read_file',
        description: 'Read.',
        sideEffects: false,
        reversible: false,
        cost: 'low',
      },
      {
        remoteName: 'write_file',
        localName: 'write_file',
        description: 'Write.',
        sideEffects: true,
        reversible: false,
        cost: 'low',
      },
    ])
    let spawnCount = 0
    const { child } = fakeMcpServer({
      initialize: () => ({ serverInfo: { name: 'files', version: '1.0.0' } }),
    })
    const spawnFn = () => {
      spawnCount += 1
      return child
    }

    const assembly = await buildMcpToolDefinitions({ store, spawnFn })

    expect(assembly.definitions).toHaveLength(2)
    expect(spawnCount).toBe(1)
    await assembly.dispose()
  })

  it('skips a connection that fails to initialize instead of throwing', async () => {
    const store = await testStore()
    const failing = await store.create({
      name: 'broken',
      transport: 'stdio',
      command: '/usr/bin/mcp-broken',
      confirmUnsandboxed: true,
    })
    await store.recordDiscovery(failing.id, {
      status: 'ok',
      tools: [{ name: 'do_thing', description: 'Does a thing.', inputSchema: {} }],
    })
    await store.setExposedTools(failing.id, [
      {
        remoteName: 'do_thing',
        localName: 'do_thing',
        description: 'Does a thing.',
        sideEffects: false,
        reversible: false,
        cost: 'low',
      },
    ])
    // A child that never responds — `initialize()` times out and this
    // connection is skipped, same as a genuinely broken/hung server.
    const brokenChild: ChildProcessLike = {
      stdin: new PassThrough(),
      stdout: new PassThrough(),
      kill: () => undefined,
    }

    const assembly = await buildMcpToolDefinitions({
      store,
      spawnFn: () => brokenChild,
      callTimeoutMs: 30,
    })

    expect(assembly.definitions).toEqual([])
    await assembly.dispose()
  })

  it('never wires a disabled connection even if it has exposed tools', async () => {
    const store = await testStore()
    const connection = await store.create({
      name: 'files',
      transport: 'stdio',
      command: '/usr/bin/mcp-files',
      confirmUnsandboxed: true,
    })
    await store.recordDiscovery(connection.id, {
      status: 'ok',
      tools: [{ name: 'read_file', description: 'Read.', inputSchema: {} }],
    })
    await store.setExposedTools(connection.id, [
      {
        remoteName: 'read_file',
        localName: 'read_file',
        description: 'Read.',
        sideEffects: false,
        reversible: false,
        cost: 'low',
      },
    ])
    await store.setEnabled(connection.id, false)
    const { child } = fakeMcpServer({
      initialize: () => ({ serverInfo: { name: 'x', version: '1' } }),
    })

    const assembly = await buildMcpToolDefinitions({ store, spawnFn: () => child })

    expect(assembly.definitions).toEqual([])
    await assembly.dispose()
  })

  it('a wired tool actually calls the remote server end to end', async () => {
    const store = await testStore()
    const connection = await store.create({
      name: 'files',
      transport: 'stdio',
      command: '/usr/bin/mcp-files',
      confirmUnsandboxed: true,
    })
    await store.recordDiscovery(connection.id, {
      status: 'ok',
      tools: [{ name: 'echo', description: 'Echo.', inputSchema: {} }],
    })
    await store.setExposedTools(connection.id, [
      {
        remoteName: 'echo',
        localName: 'echo',
        description: 'Echo.',
        sideEffects: false,
        reversible: false,
        cost: 'low',
      },
    ])
    const { child } = fakeMcpServer({
      initialize: () => ({ serverInfo: { name: 'files', version: '1.0.0' } }),
      'tools/call': (params) => ({
        content: [{ type: 'text', text: JSON.stringify({ echoed: params }) }],
        isError: false,
      }),
    })

    const assembly = await buildMcpToolDefinitions({ store, spawnFn: () => child })
    const tool = assembly.definitions[0]
    expect(tool).toBeDefined()
    const result = await tool?.execute(
      { hello: 'world' },
      {
        site: { name: 'acme', locales: ['en'], defaultLocale: 'en' },
        actor: { id: null, roles: [] },
        logger: { info: () => undefined, warn: () => undefined, error: () => undefined },
        signal: new AbortController().signal,
      },
    )

    expect(result).toEqual({ echoed: { name: 'echo', arguments: { hello: 'world' } } })
    await assembly.dispose()
  })
})
