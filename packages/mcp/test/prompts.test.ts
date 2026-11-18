import { CogentaError } from '@cogenta/core'
import { describe, expect, it } from 'vitest'
import { JsonRpcErrorCode } from '../src/jsonrpc.js'
import { createMcpServer, type McpPromptSource } from '../src/server.js'

function promptSource(): McpPromptSource {
  return {
    list: async () => [
      { name: 'ton-editorial', title: 'Ton éditorial', description: 'How to write here.' },
      { name: 'checklist' },
    ],
    get: async (name) =>
      name === 'ton-editorial'
        ? {
            description: 'How to write here.',
            messages: [
              { role: 'user', content: { type: 'text', text: 'Write short, in French.' } },
            ],
          }
        : undefined,
  }
}

function init(prompts?: McpPromptSource) {
  return createMcpServer({
    name: 'cogenta',
    version: '1.0.0',
    tools: [],
    ...(prompts === undefined ? {} : { prompts }),
  })
}

function revoked(): CogentaError {
  return new CogentaError({
    code: 'MCP_ACTOR_API_KEY_INVALID',
    message: 'This API key was revoked.',
    hint: 'Create a new one.',
  })
}

describe('MCP prompts', () => {
  it('advertises the prompts capability only when a prompt source is given', async () => {
    const message = { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }
    const without = await init().handle(message)
    const withSource = await init(promptSource()).handle(message)

    expect(without).toMatchObject({ result: { capabilities: { tools: { listChanged: false } } } })
    expect(JSON.stringify(without)).not.toContain('"prompts"')
    expect(withSource).toMatchObject({
      result: { capabilities: { tools: { listChanged: false }, prompts: { listChanged: false } } },
    })
  })

  it('does not know prompts/list nor prompts/get without a source', async () => {
    const server = init()

    const list = await server.handle({ jsonrpc: '2.0', id: 2, method: 'prompts/list' })
    const get = await server.handle({
      jsonrpc: '2.0',
      id: 3,
      method: 'prompts/get',
      params: { name: 'x' },
    })

    expect(list).toMatchObject({ error: { code: JsonRpcErrorCode.METHOD_NOT_FOUND } })
    expect(get).toMatchObject({ error: { code: JsonRpcErrorCode.METHOD_NOT_FOUND } })
  })

  it('lists each prompt with its name, title and description', async () => {
    const response = await init(promptSource()).handle({
      jsonrpc: '2.0',
      id: 4,
      method: 'prompts/list',
    })

    expect(response).toEqual({
      jsonrpc: '2.0',
      id: 4,
      result: {
        prompts: [
          { name: 'ton-editorial', title: 'Ton éditorial', description: 'How to write here.' },
          { name: 'checklist' },
        ],
      },
    })
  })

  it('returns the prompt messages for a known name', async () => {
    const response = await init(promptSource()).handle({
      jsonrpc: '2.0',
      id: 5,
      method: 'prompts/get',
      params: { name: 'ton-editorial' },
    })

    expect(response).toEqual({
      jsonrpc: '2.0',
      id: 5,
      result: {
        description: 'How to write here.',
        messages: [{ role: 'user', content: { type: 'text', text: 'Write short, in French.' } }],
      },
    })
  })

  it('answers an unknown prompt with the invalid-params JSON-RPC error, not a result', async () => {
    const response = await init(promptSource()).handle({
      jsonrpc: '2.0',
      id: 6,
      method: 'prompts/get',
      params: { name: 'nope' },
    })

    expect(response).toMatchObject({
      id: 6,
      error: { code: JsonRpcErrorCode.INVALID_PARAMS, message: expect.stringContaining('nope') },
    })
  })

  it('refuses a prompts/get without a name', async () => {
    const response = await init(promptSource()).handle({
      jsonrpc: '2.0',
      id: 7,
      method: 'prompts/get',
      params: {},
    })

    expect(response).toMatchObject({ error: { code: JsonRpcErrorCode.INVALID_PARAMS } })
  })

  it('answers with the authentication refusal when the source refuses its caller (revoked key)', async () => {
    const server = init({
      list: async () => {
        throw revoked()
      },
      get: async () => {
        throw revoked()
      },
    })

    const list = await server.handle({ jsonrpc: '2.0', id: 8, method: 'prompts/list' })
    const get = await server.handle({
      jsonrpc: '2.0',
      id: 9,
      method: 'prompts/get',
      params: { name: 'x' },
    })

    expect(list).toMatchObject({ error: { code: JsonRpcErrorCode.UNAUTHORIZED } })
    expect(get).toMatchObject({ error: { code: JsonRpcErrorCode.UNAUTHORIZED } })
  })
})
