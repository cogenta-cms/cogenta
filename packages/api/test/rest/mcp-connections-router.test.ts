import { createSqliteHandle, type DatabaseHandle } from '@cogenta/core'
import type { DiscoverMcpConnectionResult, McpConnectionStore } from '@cogenta/mcp'
import { createMcpConnectionStore, ensureMcpConnectionTables } from '@cogenta/mcp'
import { describe, expect, it } from 'vitest'
import { createMcpConnectionsRouter } from '../../src/rest/mcp-connections-router.js'
import { ANONYMOUS } from '../../src/types.js'

const ADMIN = { id: 'user-admin', roles: ['admin'] }
const EDITOR = { id: 'user-editor', roles: ['editor'] }

async function testStore(): Promise<McpConnectionStore> {
  const db: DatabaseHandle = await createSqliteHandle({ url: ':memory:' })
  await ensureMcpConnectionTables(db)
  return createMcpConnectionStore(db, { signingKey: 'test-signing-key-not-a-real-secret' })
}

describe('mcp-connections-router', () => {
  it('refuses a non-admin actor', async () => {
    const router = createMcpConnectionsRouter({ connections: await testStore() })
    const response = await router.handle(
      { method: 'GET', path: '/api/mcp-connections', query: {} },
      EDITOR,
    )
    expect(response.status).toBe(403)
  })

  it('refuses an anonymous actor', async () => {
    const router = createMcpConnectionsRouter({ connections: await testStore() })
    const response = await router.handle(
      { method: 'GET', path: '/api/mcp-connections', query: {} },
      ANONYMOUS,
    )
    expect(response.status).toBe(403)
  })

  it('lists connections for an admin', async () => {
    const connections = await testStore()
    await connections.create({
      name: 'files',
      transport: 'stdio',
      command: '/usr/bin/mcp-files',
      confirmUnsandboxed: true,
    })
    const router = createMcpConnectionsRouter({ connections })

    const response = await router.handle(
      { method: 'GET', path: '/api/mcp-connections', query: {} },
      ADMIN,
    )

    expect(response.status).toBe(200)
    const body = response.body as { data: readonly { name: string }[] }
    expect(body.data).toHaveLength(1)
    expect(body.data[0]?.name).toBe('files')
  })

  it('refuses to create a stdio connection without explicit confirmation (fiche 58 task 1bis)', async () => {
    const router = createMcpConnectionsRouter({ connections: await testStore() })

    const response = await router.handle(
      {
        method: 'POST',
        path: '/api/mcp-connections',
        query: {},
        body: { name: 'files', transport: 'stdio', command: '/usr/bin/mcp-files' },
      },
      ADMIN,
    )

    expect(response.status).toBe(400)
    const body = response.body as { error: { code: string } }
    expect(body.error.code).toBe('MCP_CONNECTION_CONFIRMATION_REQUIRED')
  })

  it('refuses a stdio connection with no command', async () => {
    const router = createMcpConnectionsRouter({ connections: await testStore() })

    const response = await router.handle(
      {
        method: 'POST',
        path: '/api/mcp-connections',
        query: {},
        body: { name: 'files', transport: 'stdio', confirmUnsandboxed: true },
      },
      ADMIN,
    )

    expect(response.status).toBe(400)
    expect((response.body as { error: { code: string } }).error.code).toBe('MCP_CONNECTION_INVALID')
  })

  it('refuses an http connection with no url', async () => {
    const router = createMcpConnectionsRouter({ connections: await testStore() })

    const response = await router.handle(
      {
        method: 'POST',
        path: '/api/mcp-connections',
        query: {},
        body: { name: 'x', transport: 'http' },
      },
      ADMIN,
    )

    expect(response.status).toBe(400)
    expect((response.body as { error: { code: string } }).error.code).toBe('MCP_CONNECTION_INVALID')
  })

  it('creates a stdio connection when confirmUnsandboxed is true, and never echoes a secret back', async () => {
    const router = createMcpConnectionsRouter({ connections: await testStore() })

    const response = await router.handle(
      {
        method: 'POST',
        path: '/api/mcp-connections',
        query: {},
        body: {
          name: 'files',
          transport: 'stdio',
          command: '/usr/bin/mcp-files',
          confirmUnsandboxed: true,
          authKind: 'api_key',
          secret: 'sk-live-super-secret',
          secretEnvVar: 'THING_API_KEY',
        },
      },
      ADMIN,
    )

    expect(response.status).toBe(201)
    expect(JSON.stringify(response.body)).not.toContain('sk-live-super-secret')
    const body = response.body as { data: { hasSecret: boolean } }
    expect(body.data.hasSecret).toBe(true)
  })

  it('POST .../test runs a real discovery probe and records the result', async () => {
    const connections = await testStore()
    const created = await connections.create({
      name: 'files',
      transport: 'stdio',
      command: '/usr/bin/mcp-files',
      confirmUnsandboxed: true,
    })
    const fakeResult: DiscoverMcpConnectionResult = {
      status: 'ok',
      tools: [{ name: 'read_file', description: 'Read a file.', inputSchema: {} }],
    }
    const router = createMcpConnectionsRouter({
      connections,
      discover: async () => fakeResult,
    })

    const response = await router.handle(
      { method: 'POST', path: `/api/mcp-connections/${created.id}/test`, query: {} },
      ADMIN,
    )

    expect(response.status).toBe(200)
    const body = response.body as { data: { status: string; discoveredTools: readonly unknown[] } }
    expect(body.data.status).toBe('ok')
    expect(body.data.discoveredTools).toHaveLength(1)
  })

  it('PUT .../exposed-tools refuses a tool never discovered on the wire ("absent, pas refusée")', async () => {
    const connections = await testStore()
    const created = await connections.create({
      name: 'files',
      transport: 'stdio',
      command: '/usr/bin/mcp-files',
      confirmUnsandboxed: true,
    })
    const router = createMcpConnectionsRouter({ connections })

    const response = await router.handle(
      {
        method: 'PUT',
        path: `/api/mcp-connections/${created.id}/exposed-tools`,
        query: {},
        body: {
          tools: [
            {
              remoteName: 'delete_everything',
              sideEffects: true,
              reversible: false,
              cost: 'high',
            },
          ],
        },
      },
      ADMIN,
    )

    expect(response.status).toBe(400)
    const body = response.body as { error: { code: string } }
    expect(body.error.code).toBe('MCP_CONNECTION_TOOL_NOT_DISCOVERED')
  })

  it('PUT .../exposed-tools requires explicit sideEffects/reversible, never inherited from the remote server', async () => {
    const connections = await testStore()
    const created = await connections.create({
      name: 'files',
      transport: 'stdio',
      command: '/usr/bin/mcp-files',
      confirmUnsandboxed: true,
    })
    await connections.recordDiscovery(created.id, {
      status: 'ok',
      tools: [{ name: 'read_file', description: 'Read a file.', inputSchema: {} }],
    })
    const router = createMcpConnectionsRouter({ connections })

    const response = await router.handle(
      {
        method: 'PUT',
        path: `/api/mcp-connections/${created.id}/exposed-tools`,
        query: {},
        body: { tools: [{ remoteName: 'read_file', cost: 'low' }] },
      },
      ADMIN,
    )

    expect(response.status).toBe(400)
  })

  it('exposes a discovered tool once explicitly checked, end to end through the router', async () => {
    const connections = await testStore()
    const created = await connections.create({
      name: 'files',
      transport: 'stdio',
      command: '/usr/bin/mcp-files',
      confirmUnsandboxed: true,
    })
    await connections.recordDiscovery(created.id, {
      status: 'ok',
      tools: [{ name: 'read_file', description: 'Read a file.', inputSchema: {} }],
    })
    const router = createMcpConnectionsRouter({ connections })

    const response = await router.handle(
      {
        method: 'PUT',
        path: `/api/mcp-connections/${created.id}/exposed-tools`,
        query: {},
        body: {
          tools: [{ remoteName: 'read_file', sideEffects: false, reversible: false, cost: 'low' }],
        },
      },
      ADMIN,
    )

    expect(response.status).toBe(200)
    const body = response.body as { data: { exposedTools: readonly { remoteName: string }[] } }
    expect(body.data.exposedTools).toEqual([
      {
        remoteName: 'read_file',
        localName: 'read_file',
        description: 'Read a file.',
        sideEffects: false,
        reversible: false,
        cost: 'low',
      },
    ])
  })

  it('PATCH toggles enabled and DELETE removes a connection', async () => {
    const connections = await testStore()
    const created = await connections.create({
      name: 'files',
      transport: 'stdio',
      command: '/usr/bin/mcp-files',
      confirmUnsandboxed: true,
    })
    const router = createMcpConnectionsRouter({ connections })

    const patched = await router.handle(
      {
        method: 'PATCH',
        path: `/api/mcp-connections/${created.id}`,
        query: {},
        body: { enabled: false },
      },
      ADMIN,
    )
    expect(patched.status).toBe(200)
    expect((patched.body as { data: { enabled: boolean } }).data.enabled).toBe(false)

    const deleted = await router.handle(
      { method: 'DELETE', path: `/api/mcp-connections/${created.id}`, query: {} },
      ADMIN,
    )
    expect(deleted.status).toBe(200)
    expect(await connections.get(created.id)).toBeUndefined()
  })

  it('404s a route naming an unknown connection id', async () => {
    const router = createMcpConnectionsRouter({ connections: await testStore() })
    const response = await router.handle(
      { method: 'GET', path: '/api/mcp-connections/does-not-exist', query: {} },
      ADMIN,
    )
    expect(response.status).toBe(404)
  })
})
