import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import type { McpClient } from '../../src/client/types.js'
import { wrapMcpTool } from '../../src/client/wrap-tool.js'

function fakeClient(callTool: McpClient['callTool']): McpClient {
  return {
    initialize: async () => ({ name: 'remote', version: '1.0.0' }),
    listTools: async () => [],
    callTool,
    close: () => undefined,
  }
}

describe('wrapMcpTool', () => {
  it('declares permissions/sideEffects/reversible/cost itself, not from the remote server', () => {
    const client = fakeClient(async () => ({ content: [], isError: false }))
    const tool = wrapMcpTool({
      client,
      remoteName: 'remote-echo',
      name: 'third_party.echo',
      version: '1.0.0',
      description: 'Echo via a third-party MCP server.',
      input: z.object({ text: z.string() }),
      output: z.object({ text: z.string() }),
      permissions: ['content.read'],
      sideEffects: false,
      reversible: false,
      cost: 'low',
    })

    expect(tool.permissions).toEqual(['content.read'])
    expect(tool.sideEffects).toBe(false)
    expect(tool.name).toBe('third_party.echo')
  })

  it('calls the remote tool with the input and parses a JSON result', async () => {
    const callTool = vi.fn(async () => ({
      content: [{ type: 'text', text: JSON.stringify({ text: 'hi' }) }],
      isError: false,
    }))
    const client = fakeClient(callTool)
    const tool = wrapMcpTool({
      client,
      remoteName: 'remote-echo',
      name: 'third_party.echo',
      version: '1.0.0',
      description: 'Echo.',
      input: z.object({ text: z.string() }),
      output: z.object({ text: z.string() }),
      permissions: ['content.read'],
      sideEffects: false,
      reversible: false,
      cost: 'low',
    })

    const result = await tool.execute(
      { text: 'hi' },
      {
        site: { name: 'acme', locales: ['en'], defaultLocale: 'en' },
        actor: { id: null, roles: [] },
        logger: { info: () => undefined, warn: () => undefined, error: () => undefined },
        signal: new AbortController().signal,
      },
    )

    expect(result).toEqual({ text: 'hi' })
    expect(callTool).toHaveBeenCalledWith('remote-echo', { text: 'hi' })
  })

  it('returns the raw text when the remote result is not valid JSON', async () => {
    const client = fakeClient(async () => ({
      content: [{ type: 'text', text: 'plain text result' }],
      isError: false,
    }))
    const tool = wrapMcpTool({
      client,
      remoteName: 'remote-summarize',
      name: 'third_party.summarize',
      version: '1.0.0',
      description: 'Summarize.',
      input: z.object({}),
      output: z.string(),
      permissions: ['content.read'],
      sideEffects: false,
      reversible: false,
      cost: 'low',
    })

    const result = await tool.execute(
      {},
      {
        site: { name: 'acme', locales: ['en'], defaultLocale: 'en' },
        actor: { id: null, roles: [] },
        logger: { info: () => undefined, warn: () => undefined, error: () => undefined },
        signal: new AbortController().signal,
      },
    )

    expect(result).toBe('plain text result')
  })

  it('throws MCP_CLIENT_TOOL_FAILED when the remote tool reports isError', async () => {
    const client = fakeClient(async () => ({
      content: [{ type: 'text', text: 'remote failure detail' }],
      isError: true,
    }))
    const tool = wrapMcpTool({
      client,
      remoteName: 'remote-fail',
      name: 'third_party.fail',
      version: '1.0.0',
      description: 'Fails.',
      input: z.object({}),
      output: z.string(),
      permissions: ['content.read'],
      sideEffects: false,
      reversible: false,
      cost: 'low',
    })

    await expect(
      tool.execute(
        {},
        {
          site: { name: 'acme', locales: ['en'], defaultLocale: 'en' },
          actor: { id: null, roles: [] },
          logger: { info: () => undefined, warn: () => undefined, error: () => undefined },
          signal: new AbortController().signal,
        },
      ),
    ).rejects.toThrowError(/remote failure detail/)
  })
})
