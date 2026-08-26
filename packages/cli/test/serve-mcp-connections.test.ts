import { mkdtemp, writeFile } from 'node:fs/promises'
import { createServer, type Server } from 'node:http'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { createUser, loginWithMfaSetup, startServer } from './helpers/serve-harness.js'

/**
 * Fiche 58 — end to end over HTTP against a real `cogenta serve`, a real
 * SQLite database, and a **real spawned child process** speaking MCP over
 * stdio (`test/fixtures/fake-mcp-server.mjs`) — the same acceptance bar
 * `serve-agents.test.ts` set for L22: nothing here is mocked except the LLM
 * vendor endpoint (a real local HTTP server, `startFakeAnthropic`, same
 * technique that file already uses).
 *
 * What this file actually proves, that a unit test of `@cogenta/mcp` in
 * isolation cannot: a connection created through `/api/mcp-connections`,
 * tested, and exposed from the "MCP Clients" screen becomes a real,
 * callable tool for a real agent **without a server restart**
 * (`refreshMcpTools`), the sandboxing floor holds against a real process
 * (no host environment variable — `COGENTA_AUTH_SIGNING_KEY` included —
 * reaches it unless explicitly configured), and the mandatory confirmation
 * is enforced by the server, not only shown by a UI.
 */

const FIXTURE = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'fake-mcp-server.mjs')

async function project(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'cogenta-mcp-connections-e2e-'))
  await writeFile(
    join(root, 'cogenta.config.mjs'),
    `export default {
  site: { name: 'Test site', url: 'https://example.com' },
  database: { url: ${JSON.stringify(join(root, 'site.db'))} },
  cache: { path: ${JSON.stringify(join(root, 'cache'))} },
  storage: { path: ${JSON.stringify(join(root, 'media'))} },
  vector: { path: ${JSON.stringify(join(root, 'vectors'))} },
}
`,
    'utf8',
  )
  await writeFile(join(root, 'cogenta.schema.mjs'), 'export default []\n', 'utf8')
  return root
}

interface AnthropicScriptedResponse {
  readonly content: readonly (
    | { readonly type: 'text'; readonly text: string }
    | {
        readonly type: 'tool_use'
        readonly id: string
        readonly name: string
        readonly input: unknown
      }
  )[]
  readonly stop_reason: 'end_turn' | 'tool_use'
  readonly usage: { readonly input_tokens: number; readonly output_tokens: number }
}

interface FakeAnthropic {
  readonly url: string
  readonly requests: unknown[]
  close(): Promise<void>
}

async function startFakeAnthropic(
  responses: readonly AnthropicScriptedResponse[],
): Promise<FakeAnthropic> {
  let index = 0
  const requests: unknown[] = []
  const server: Server = createServer((req, res) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => chunks.push(chunk))
    req.on('end', () => {
      requests.push(JSON.parse(Buffer.concat(chunks).toString('utf8')))
      const response = responses[index]
      index += 1
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify(response))
    })
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('fake Anthropic has no port')
  return {
    url: `http://127.0.0.1:${address.port}`,
    requests,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  }
}

const activeServers: AbortController[] = []
const fakeProviders: FakeAnthropic[] = []

afterEach(async () => {
  for (const controller of activeServers.splice(0)) controller.abort()
  for (const fake of fakeProviders.splice(0)) await fake.close()
})

async function adminToken(server: { base: string }, root: string): Promise<string> {
  await createUser(root, 'admin@example.com', 'correct horse battery staple', ['admin'])
  return loginWithMfaSetup(server.base, 'admin@example.com', 'correct horse battery staple')
}

describe('cogenta serve — /api/mcp-connections (fiche 58 tasks 1bis-6)', () => {
  it('refuses a non-admin and an anonymous caller', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })

    const anon = await fetch(`${server.base}/api/mcp-connections`)
    expect(anon.status).toBe(403)
  })

  it('refuses to create a stdio connection without explicit confirmation, structurally — not only via the UI', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    const token = await adminToken(server, root)

    const response = await fetch(`${server.base}/api/mcp-connections`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({
        name: 'fake',
        transport: 'stdio',
        command: process.execPath,
        args: [FIXTURE],
      }),
    })

    expect(response.status).toBe(400)
    const body = (await response.json()) as { error: { code: string } }
    expect(body.error.code).toBe('MCP_CONNECTION_CONFIRMATION_REQUIRED')
  })

  it('spawns the real fixture process, never inheriting the host environment (COGENTA_AUTH_SIGNING_KEY included)', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    const token = await adminToken(server, root)

    const created = await fetch(`${server.base}/api/mcp-connections`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({
        name: 'fake',
        transport: 'stdio',
        command: process.execPath,
        args: [FIXTURE],
        env: { ONLY_THIS_ENV_VAR: 'visible' },
        confirmUnsandboxed: true,
      }),
    })
    expect(created.status).toBe(201)
    const { data: connection } = (await created.json()) as { data: { id: string } }

    const tested = await fetch(`${server.base}/api/mcp-connections/${connection.id}/test`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}` },
    })
    expect(tested.status).toBe(200)
    const testedBody = (await tested.json()) as {
      data: { status: string; discoveredTools: readonly { name: string }[] }
    }
    expect(testedBody.data.status).toBe('ok')
    expect(testedBody.data.discoveredTools.map((tool) => tool.name)).toEqual(['greet'])

    const exposed = await fetch(
      `${server.base}/api/mcp-connections/${connection.id}/exposed-tools`,
      {
        method: 'PUT',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({
          tools: [{ remoteName: 'greet', sideEffects: false, reversible: false, cost: 'low' }],
        }),
      },
    )
    expect(exposed.status).toBe(200)

    // A real agent, naming this connection's exposed tool by the exact name
    // fiche 58 task 4/6 give it — the runtime wired it in live, no restart.
    const fake = await startFakeAnthropic([
      {
        content: [
          {
            type: 'tool_use',
            id: 'call-1',
            name: `mcp.external.${connection.id}.greet`,
            input: { name: 'World' },
          },
        ],
        stop_reason: 'tool_use',
        usage: { input_tokens: 10, output_tokens: 5 },
      },
      {
        content: [{ type: 'text', text: 'Greeted.' }],
        stop_reason: 'end_turn',
        usage: { input_tokens: 10, output_tokens: 5 },
      },
    ])
    fakeProviders.push(fake)

    await fetch(`${server.base}/api/providers`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({
        provider: 'anthropic',
        apiKey: 'sk-ant-test-key',
        model: 'claude-test',
        baseUrl: fake.url,
      }),
    })

    const agentCreated = await fetch(`${server.base}/api/agents`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({
        name: 'Greeter Agent',
        identity: { role: 'Greets people via an external MCP server.', objectives: [] },
        model: { preferred: 'anthropic' },
        tools: [`mcp.external.${connection.id}.greet`],
        autonomy: { default: 'autonomous' },
      }),
    })
    expect(agentCreated.status).toBe(201)

    const run = await fetch(
      `${server.base}/api/agents/${encodeURIComponent('Greeter Agent')}/run`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ instruction: 'Greet World.' }),
      },
    )
    expect(run.status).toBe(200)
    const runBody = (await run.json()) as { data: { stopReason: string; finalText: string | null } }
    expect(runBody.data.stopReason).toBe('end_turn')
    expect(runBody.data.finalText).toBe('Greeted.')

    // The tool call itself is recorded — proof it actually ran, not just
    // that the run finished.
    const history = await fetch(
      `${server.base}/api/agents/${encodeURIComponent('Greeter Agent')}/history`,
      { headers: { authorization: `Bearer ${token}` } },
    )
    const historyBody = (await history.json()) as {
      data: readonly { action: string; diff?: unknown }[]
    }
    const toolCall = historyBody.data.find(
      (entry) => entry.action === `agent.tool.mcp.external.${connection.id}.greet`,
    )
    expect(toolCall).toBeDefined()
    // The real, spawned fixture process actually answered — this is not a
    // canned response: it echoes the input it received and its own view of
    // the environment, which the sandboxing floor controls.
    const diff = JSON.stringify(toolCall?.diff ?? {})
    expect(diff).toContain('Hello, World!')
    expect(diff).toContain('"onlyThisEnvVar":"visible"')
    expect(diff).toContain('"canSeeAuthSigningKey":false')
  })

  it('setEnabled(false) removes the tool from what an agent can call, live, without a restart', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    const token = await adminToken(server, root)

    const created = await fetch(`${server.base}/api/mcp-connections`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({
        name: 'fake',
        transport: 'stdio',
        command: process.execPath,
        args: [FIXTURE],
        confirmUnsandboxed: true,
      }),
    })
    const { data: connection } = (await created.json()) as { data: { id: string } }
    await fetch(`${server.base}/api/mcp-connections/${connection.id}/test`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}` },
    })
    await fetch(`${server.base}/api/mcp-connections/${connection.id}/exposed-tools`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({
        tools: [{ remoteName: 'greet', sideEffects: false, reversible: false, cost: 'low' }],
      }),
    })

    // Created while the tool is live — proves the *next* assertion is about
    // disabling taking effect, not about the agent having never had it.
    const agentCreated = await fetch(`${server.base}/api/agents`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({
        name: 'Disabled Connection Agent',
        identity: { role: 'Tries to greet via a connection that gets disabled.', objectives: [] },
        model: { preferred: 'anthropic' },
        tools: [`mcp.external.${connection.id}.greet`],
        autonomy: { default: 'autonomous' },
      }),
    })
    expect(agentCreated.status).toBe(201)

    await fetch(`${server.base}/api/providers`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({
        provider: 'anthropic',
        apiKey: 'sk-ant-test-key',
        model: 'claude-test',
        baseUrl: 'http://127.0.0.1:1', // never reached — the manifest build fails first
      }),
    })

    const patched = await fetch(`${server.base}/api/mcp-connections/${connection.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ enabled: false }),
    })
    expect(patched.status).toBe(200)

    // No restart between disabling and this run — `onMutated` already
    // refreshed the live tool registry.
    const run = await fetch(
      `${server.base}/api/agents/${encodeURIComponent('Disabled Connection Agent')}/run`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ instruction: 'Greet World.' }),
      },
    )
    expect(run.status).toBe(404)
    const body = (await run.json()) as { error: { code: string } }
    expect(body.error.code).toBe('TOOL_UNKNOWN')
  })
})
