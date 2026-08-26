#!/usr/bin/env node
// A real, minimal MCP server over stdio — JSON-RPC one request per line,
// exactly the protocol `@cogenta/mcp`'s `createMcpStdioClient` speaks.
// Used by `packages/cli/test/serve-mcp-connections.test.ts` as a genuine
// spawned process (not a mock): this is the fiche 58 end-to-end proof that
// a connection created through the admin API, tested, exposed, and then
// called by a real agent run actually reaches a real external process.
//
// One tool, "greet": echoes `{ greeting: "Hello, <name>!" }`. Also prints
// one line to stderr on startup, so the sandboxing test can assert it was
// captured rather than inherited.

import { createInterface } from 'node:readline'

process.stderr.write('fake-mcp-server: started\n')

const rl = createInterface({ input: process.stdin })

function send(id, result) {
  process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id, result })}\n`)
}

rl.on('line', (line) => {
  const trimmed = line.trim()
  if (trimmed === '') return
  let request
  try {
    request = JSON.parse(trimmed)
  } catch {
    return
  }

  if (request.method === 'initialize') {
    send(request.id, {
      protocolVersion: '2025-06-18',
      serverInfo: { name: 'fake-mcp-server', version: '1.0.0' },
      capabilities: { tools: {} },
    })
    return
  }

  if (request.method === 'tools/list') {
    send(request.id, {
      tools: [
        {
          name: 'greet',
          description: 'Greets a person by name.',
          inputSchema: {
            type: 'object',
            properties: { name: { type: 'string' } },
            required: ['name'],
          },
        },
      ],
    })
    return
  }

  if (request.method === 'tools/call') {
    const args = request.params?.arguments ?? {}
    if (request.params?.name !== 'greet') {
      send(request.id, {
        content: [{ type: 'text', text: `No tool named "${request.params?.name}".` }],
        isError: true,
      })
      return
    }
    // Also proves this process received no host environment variables
    // unless explicitly configured: echoes back whatever ONLY_THIS_ENV_VAR
    // holds (or "unset"), which the test asserts against.
    const text = JSON.stringify({
      greeting: `Hello, ${args.name}!`,
      onlyThisEnvVar: process.env.ONLY_THIS_ENV_VAR ?? 'unset',
      // The one secret this project cares about most (CLAUDE.md/AGENTS.md):
      // proves a `stdio` MCP connection never inherits the host's real
      // environment, not just that some arbitrary variable is absent.
      canSeeAuthSigningKey: typeof process.env.COGENTA_AUTH_SIGNING_KEY !== 'undefined',
    })
    send(request.id, { content: [{ type: 'text', text }], isError: false })
  }
})
