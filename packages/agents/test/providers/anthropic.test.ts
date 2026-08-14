import { describe, expect, it } from 'vitest'
import { buildAnthropicRequest, parseAnthropicResponse } from '../../src/providers/anthropic.js'
import type { ChatRequest } from '../../src/providers/types.js'

describe('buildAnthropicRequest', () => {
  it('maps a plain text turn to a string content message', () => {
    const request: ChatRequest = {
      model: 'claude-sonnet-5',
      system: 'Be concise.',
      messages: [{ role: 'user', content: 'Hello' }],
      maxTokens: 100,
    }

    expect(buildAnthropicRequest(request)).toEqual({
      model: 'claude-sonnet-5',
      max_tokens: 100,
      system: 'Be concise.',
      messages: [{ role: 'user', content: 'Hello' }],
    })
  })

  it('maps tool specs to input_schema and an assistant tool call to a tool_use block', () => {
    const request: ChatRequest = {
      model: 'claude-sonnet-5',
      messages: [
        {
          role: 'assistant',
          toolCalls: [{ id: 'call-1', name: 'content.publish', input: { id: 'e1' } }],
        },
      ],
      tools: [
        {
          name: 'content.publish',
          description: 'Publish content.',
          inputSchema: { type: 'object', properties: { id: { type: 'string' } } },
        },
      ],
      maxTokens: 100,
    }

    const built = buildAnthropicRequest(request)
    expect(built.tools).toEqual([
      {
        name: 'content.publish',
        description: 'Publish content.',
        input_schema: { type: 'object', properties: { id: { type: 'string' } } },
      },
    ])
    expect(built.messages).toEqual([
      {
        role: 'assistant',
        content: [{ type: 'tool_use', id: 'call-1', name: 'content.publish', input: { id: 'e1' } }],
      },
    ])
  })

  it('maps a tool-role message to a user turn carrying a tool_result block', () => {
    const request: ChatRequest = {
      model: 'claude-sonnet-5',
      messages: [{ role: 'tool', toolCallId: 'call-1', content: '{"ok":true}' }],
      maxTokens: 100,
    }

    expect(buildAnthropicRequest(request).messages).toEqual([
      {
        role: 'user',
        content: [{ type: 'tool_result', tool_use_id: 'call-1', content: '{"ok":true}' }],
      },
    ])
  })

  it('throws PROVIDER_RESPONSE_INVALID when a tool message has no toolCallId', () => {
    const request: ChatRequest = {
      model: 'claude-sonnet-5',
      messages: [{ role: 'tool', content: 'result' }],
      maxTokens: 100,
    }

    expect(() => buildAnthropicRequest(request)).toThrowError(/toolCallId/)
  })
})

describe('parseAnthropicResponse', () => {
  it('extracts text content and reports end_turn', () => {
    const parsed = parseAnthropicResponse({
      content: [{ type: 'text', text: 'Done.' }],
      stop_reason: 'end_turn',
      usage: { input_tokens: 12, output_tokens: 4 },
    })

    expect(parsed).toEqual({
      content: 'Done.',
      toolCalls: [],
      stopReason: 'end_turn',
      usage: { inputTokens: 12, outputTokens: 4 },
    })
  })

  it('extracts tool_use blocks and reports tool_use, with null content when no text', () => {
    const parsed = parseAnthropicResponse({
      content: [{ type: 'tool_use', id: 'call-1', name: 'content.publish', input: { id: 'e1' } }],
      stop_reason: 'tool_use',
      usage: { input_tokens: 30, output_tokens: 10 },
    })

    expect(parsed.content).toBeNull()
    expect(parsed.stopReason).toBe('tool_use')
    expect(parsed.toolCalls).toEqual([
      { id: 'call-1', name: 'content.publish', input: { id: 'e1' } },
    ])
  })
})
