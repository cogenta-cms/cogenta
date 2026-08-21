import { describe, expect, it } from 'vitest'
import type { ChatResponse, ProviderClient } from '../../../src/providers/types.js'
import type { ExecutableTool } from '../../../src/runtime/types.js'
import {
  agentDelegateToolName,
  createAgentDelegateTool,
} from '../../../src/tools/core/agent-delegate.js'
import type { ToolContext } from '../../../src/tools/types.js'

describe('agentDelegateToolName', () => {
  it('gives two different sub-agents two different tool names, so an orchestrator can offer both at once without a collision', () => {
    expect(agentDelegateToolName('Security Scanner')).toBe('agent.delegate.security-scanner')
    expect(agentDelegateToolName('Content Watch')).toBe('agent.delegate.content-watch')
    expect(agentDelegateToolName('Security Scanner')).not.toBe(
      agentDelegateToolName('Content Watch'),
    )
  })

  it('the constructed tool carries the taxonomy-fixed agent.delegate permission regardless of name', () => {
    const tool = createAgentDelegateTool({
      subagentName: 'Dependency Analyst',
      client: {
        name: 'fake',
        model: 'fake',
        async chat() {
          return {
            content: 'ok',
            toolCalls: [],
            stopReason: 'end_turn' as const,
            usage: { inputTokens: 0, outputTokens: 0 },
          }
        },
      },
      tools: [],
      maxTokens: 10,
    })
    expect(tool.name).toBe('agent.delegate.dependency-analyst')
    expect(tool.permissions).toEqual(['agent.delegate'])
  })
})

const USAGE = { inputTokens: 10, outputTokens: 5 }

const CTX: ToolContext = {
  site: { name: 'acme-blog', locales: ['en'], defaultLocale: 'en' },
  actor: { id: 'agent:security', roles: ['agent'] },
  logger: { info: () => undefined, warn: () => undefined, error: () => undefined },
  signal: new AbortController().signal,
}

function fakeClient(responses: readonly ChatResponse[]): ProviderClient {
  let index = 0
  return {
    name: 'fake',
    model: 'fake-model',
    async chat() {
      const response = responses[index]
      index += 1
      if (response === undefined) throw new Error('fakeClient: ran out of scripted responses')
      return response
    },
  }
}

describe('agent.delegate', () => {
  it('delegates the task and returns the sub-agent’s final text', async () => {
    const client = fakeClient([
      { content: 'Found 2 CVEs.', toolCalls: [], stopReason: 'end_turn', usage: USAGE },
    ])
    const tool = createAgentDelegateTool({
      subagentName: 'dependency-analyst',
      client,
      tools: [],
      maxTokens: 100,
    })

    const output = await tool.execute({ task: 'scan for CVEs' }, CTX)

    expect(output).toEqual({ finalText: 'Found 2 CVEs.', stopReason: 'end_turn' })
  })

  it('reports a sub-agent crash as data, not as a thrown error out of the tool', async () => {
    const client: ProviderClient = {
      name: 'fake',
      model: 'fake-model',
      async chat() {
        throw new Error('provider is down')
      },
    }
    const tool = createAgentDelegateTool({
      subagentName: 'dependency-analyst',
      client,
      tools: [],
      maxTokens: 100,
    })

    const output = await tool.execute({ task: 'scan for CVEs' }, CTX)

    expect(output).toEqual({ finalText: null, stopReason: 'errored' })
  })

  it('gives the sub-agent only the tools it was constructed with', async () => {
    let seenToolNames: readonly string[] = []
    const client: ProviderClient = {
      name: 'fake',
      model: 'fake-model',
      async chat(request) {
        seenToolNames = (request.tools ?? []).map((t) => t.name)
        return { content: 'ok', toolCalls: [], stopReason: 'end_turn', usage: USAGE }
      },
    }
    const subagentTool: ExecutableTool = {
      spec: { name: 'deps.scan', description: 'Scan.', inputSchema: {} },
      execute: async () => ({}),
    }
    const tool = createAgentDelegateTool({
      subagentName: 'dependency-analyst',
      client,
      tools: [subagentTool],
      maxTokens: 100,
    })

    await tool.execute({ task: 'scan' }, CTX)

    expect(seenToolNames).toEqual(['deps.scan'])
  })
})
