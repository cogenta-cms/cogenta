import type { ChatRequest, ChatResponse, ProviderClient } from '@cogenta/agents'
import { createAssistToolset } from '@cogenta/agents'
import type { CollectionDefinition } from '@cogenta/schema'
import { describe, expect, it } from 'vitest'
import { createPermissionLayer } from '../../src/access/index.js'
import {
  type AssistantRouter,
  type AssistToolsetLike,
  createAssistantRouter,
} from '../../src/rest/assistant-router.js'
import type { RestRequest, RestResponse } from '../../src/rest/http.js'
import type { AccessContext } from '../../src/types.js'
import { ANONYMOUS } from '../../src/types.js'

/**
 * Real toolset from `@cogenta/agents`, real permission layer, real collection
 * definitions. What is faked is exactly one thing — the vendor's HTTP endpoint
 * — because it is the only part that cannot run locally.
 */

const ARTICLE: CollectionDefinition = {
  name: 'article',
  labels: { singular: 'Article', plural: 'Articles' },
  versioning: { drafts: true, history: true },
  fields: { title: { kind: 'text', required: true, options: { max: 200 } } },
  permissions: {
    read: ['public'],
    create: ['editor'],
    update: ['editor'],
    publish: ['editor'],
  },
}

const SITE = { name: 'Test Site', locales: ['en', 'fr'], defaultLocale: 'en' }

function provider(reply: string): ProviderClient {
  return {
    name: 'fake',
    model: 'fake-1',
    chat: async (_request: ChatRequest): Promise<ChatResponse> => ({
      content: reply,
      toolCalls: [],
      stopReason: 'end_turn',
      usage: { inputTokens: 1, outputTokens: 1 },
    }),
  }
}

function routerWith(toolset: AssistToolsetLike): AssistantRouter {
  return createAssistantRouter({
    toolset,
    collections: [ARTICLE],
    permissions: createPermissionLayer({ collections: [ARTICLE] }),
    site: SITE,
  })
}

function configured(reply = 'a rewritten sentence'): AssistantRouter {
  return routerWith(
    createAssistToolset({
      provider: provider(reply),
      site: { name: SITE.name, locales: SITE.locales },
    }) as AssistToolsetLike,
  )
}

function unconfigured(): AssistantRouter {
  return routerWith(
    createAssistToolset({ site: { name: SITE.name, locales: SITE.locales } }) as AssistToolsetLike,
  )
}

const EDITOR: AccessContext = { actor: { id: 'u1', roles: ['editor'] } }
const VIEWER: AccessContext = { actor: { id: 'u2', roles: ['public'] } }

function get(path = '/api/assistant'): RestRequest {
  return { method: 'GET', path, query: {} }
}

function post(body: unknown): RestRequest {
  return { method: 'POST', path: '/api/assistant/run', query: {}, body }
}

function data(response: RestResponse): Record<string, unknown> {
  return (response.body as { data: Record<string, unknown> }).data
}

function errorCode(response: RestResponse): string {
  return (response.body as { error: { code: string } }).error.code
}

describe('GET /api/assistant on a site with no AI provider', () => {
  it('answers 200 and says the assistant is off, so the admin can just render nothing', async () => {
    const response = await unconfigured().handle(get(), EDITOR)

    expect(response.status).toBe(200)
    expect(data(response)).toMatchObject({ available: false, tools: [] })
    expect(String(data(response)['reason'])).toContain('No AI provider is configured')
  })

  it('refuses to run a tool with a code a client can branch on, not a 500', async () => {
    const response = await unconfigured().handle(
      post({ tool: 'assist.rewrite', input: { text: 'x' } }),
      EDITOR,
    )

    expect(response.status).toBe(503)
    expect(errorCode(response)).toBe('ASSIST_UNAVAILABLE')
  })
})

describe('GET /api/assistant on a configured site', () => {
  it('lists the tools with the labels the admin renders', async () => {
    const response = await configured().handle(get(), EDITOR)

    expect(response.status).toBe(200)
    expect(data(response)['available']).toBe(true)
    const tools = data(response)['tools'] as { tool: string; label: string }[]
    expect(tools.map((entry) => entry.tool)).toContain('assist.rewrite')
    expect(tools.find((entry) => entry.tool === 'assist.translate')?.label).toBe('Translate')
  })

  it('refuses GET from an anonymous caller before any provider is contacted', async () => {
    const response = await configured().handle(get(), { actor: ANONYMOUS })

    expect(response.status).toBe(401)
    expect(errorCode(response)).toBe('UNAUTHENTICATED')
  })

  it('refuses a signed-in reader who may not edit anything', async () => {
    const response = await configured().handle(get(), VIEWER)

    expect(response.status).toBe(403)
    expect(errorCode(response)).toBe('FORBIDDEN')
  })

  it('rejects a method the route does not answer', async () => {
    const response = await configured().handle(
      { method: 'DELETE', path: '/api/assistant', query: {} },
      EDITOR,
    )

    expect(response.status).toBe(405)
    expect(response.headers['allow']).toBe('GET')
  })
})

describe('POST /api/assistant/run', () => {
  it('returns the suggestion, marked as not applied', async () => {
    const response = await configured('A clearer sentence.').handle(
      post({ tool: 'assist.rewrite', input: { text: 'a sentence' } }),
      EDITOR,
    )

    expect(response.status).toBe(200)
    expect(data(response)).toEqual({ suggestions: ['A clearer sentence.'], applied: false })
  })

  it('never spends the site AI budget for an anonymous caller', async () => {
    let called = 0
    const counting: ProviderClient = {
      name: 'counting',
      model: 'm',
      chat: async () => {
        called += 1
        return {
          content: 'x',
          toolCalls: [],
          stopReason: 'end_turn' as const,
          usage: { inputTokens: 1, outputTokens: 1 },
        }
      },
    }
    const router = routerWith(
      createAssistToolset({
        provider: counting,
        site: { name: SITE.name, locales: SITE.locales },
      }) as AssistToolsetLike,
    )

    const response = await router.handle(post({ tool: 'assist.rewrite', input: { text: 'x' } }), {
      actor: ANONYMOUS,
    })

    expect(response.status).toBe(401)
    expect(called).toBe(0)
  })

  it('refuses a tool this site does not have', async () => {
    const response = await configured().handle(post({ tool: 'assist.nonexistent' }), EDITOR)

    expect(response.status).toBe(404)
    expect(errorCode(response)).toBe('TOOL_UNKNOWN')
  })

  it('refuses input the tool cannot use, without echoing what was sent', async () => {
    const response = await configured().handle(
      post({ tool: 'assist.rewrite', input: { text: '' } }),
      EDITOR,
    )

    expect(response.status).toBe(400)
    expect(errorCode(response)).toBe('TOOL_INPUT_INVALID')
    expect(JSON.stringify(response.body)).not.toContain('"text"')
  })

  it('refuses a body that is not an object', async () => {
    const response = await configured().handle(post('assist.rewrite'), EDITOR)

    expect(response.status).toBe(400)
    expect(errorCode(response)).toBe('QUERY_INVALID')
  })

  it('refuses any tool that declares a side effect, whatever the toolset offers (R6)', async () => {
    const writing: AssistToolsetLike = {
      available: true,
      tools: [
        {
          name: 'evil.write',
          description: 'writes',
          sideEffects: true,
          input: { safeParse: () => ({ success: true, data: {} }) },
          execute: async () => {
            throw new Error('this must never run')
          },
        },
      ],
      capabilities: [
        {
          tool: 'evil.write',
          label: 'Evil',
          description: 'writes',
          cost: 'low',
          needs: [],
        },
      ],
    }

    const response = await routerWith(writing).handle(post({ tool: 'evil.write' }), EDITOR)

    expect(response.status).toBe(403)
    expect(errorCode(response)).toBe('TOOL_CALL_REJECTED')
  })

  it('reports a malformed model answer as an upstream failure, not the caller mistake', async () => {
    const response = await configured('not the JSON this tool asked for').handle(
      post({ tool: 'assist.proofread', input: { text: 'x' } }),
      EDITOR,
    )

    expect(response.status).toBe(502)
    expect(errorCode(response)).toBe('ASSIST_RESPONSE_INVALID')
  })

  it('404s a path under the mount that is not a route', async () => {
    const response = await configured().handle(
      { method: 'POST', path: '/api/assistant/anything', query: {}, body: {} },
      EDITOR,
    )

    expect(response.status).toBe(404)
  })
})
