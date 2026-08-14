import { describe, expect, it } from 'vitest'
import { buildOpenAiRequest, parseOpenAiResponse } from '../../src/providers/openai.js'
import type { ChatRequest } from '../../src/providers/types.js'

describe('buildOpenAiRequest', () => {
  it('prepends a system message when request.system is set', () => {
    const request: ChatRequest = {
      model: 'gpt-5',
      system: 'Be concise.',
      messages: [{ role: 'user', content: 'Hello' }],
      maxTokens: 100,
    }

    expect(buildOpenAiRequest(request).messages).toEqual([
      { role: 'system', content: 'Be concise.' },
      { role: 'user', content: 'Hello' },
    ])
  })

  it('maps tool specs to a function wrapper and an assistant tool call to tool_calls', () => {
    const request: ChatRequest = {
      model: 'gpt-5',
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

    const built = buildOpenAiRequest(request)
    expect(built.tools).toEqual([
      {
        type: 'function',
        function: {
          name: 'content.publish',
          description: 'Publish content.',
          parameters: { type: 'object', properties: { id: { type: 'string' } } },
        },
      },
    ])
    expect(built.messages).toEqual([
      {
        role: 'assistant',
        content: null,
        tool_calls: [
          {
            id: 'call-1',
            type: 'function',
            function: { name: 'content.publish', arguments: '{"id":"e1"}' },
          },
        ],
      },
    ])
  })

  it('maps a tool-role message to role: tool with tool_call_id', () => {
    const request: ChatRequest = {
      model: 'gpt-5',
      messages: [{ role: 'tool', toolCallId: 'call-1', content: '{"ok":true}' }],
      maxTokens: 100,
    }

    expect(buildOpenAiRequest(request).messages).toEqual([
      { role: 'tool', content: '{"ok":true}', tool_call_id: 'call-1' },
    ])
  })

  it('throws PROVIDER_RESPONSE_INVALID when a tool message has no toolCallId', () => {
    const request: ChatRequest = {
      model: 'gpt-5',
      messages: [{ role: 'tool', content: 'result' }],
      maxTokens: 100,
    }

    expect(() => buildOpenAiRequest(request)).toThrowError(/toolCallId/)
  })
})

describe('parseOpenAiResponse', () => {
  it('extracts text content and maps finish_reason: stop to end_turn', () => {
    const parsed = parseOpenAiResponse({
      choices: [{ message: { content: 'Done.' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 12, completion_tokens: 4 },
    })

    expect(parsed).toEqual({
      content: 'Done.',
      toolCalls: [],
      stopReason: 'end_turn',
      usage: { inputTokens: 12, outputTokens: 4 },
    })
  })

  it('parses tool_calls arguments as JSON and maps finish_reason: tool_calls to tool_use', () => {
    const parsed = parseOpenAiResponse({
      choices: [
        {
          message: {
            content: null,
            tool_calls: [
              {
                id: 'call-1',
                type: 'function',
                function: { name: 'content.publish', arguments: '{"id":"e1"}' },
              },
            ],
          },
          finish_reason: 'tool_calls',
        },
      ],
      usage: { prompt_tokens: 30, completion_tokens: 10 },
    })

    expect(parsed.content).toBeNull()
    expect(parsed.stopReason).toBe('tool_use')
    expect(parsed.toolCalls).toEqual([
      { id: 'call-1', name: 'content.publish', input: { id: 'e1' } },
    ])
  })

  it('throws PROVIDER_RESPONSE_INVALID when tool call arguments are not valid JSON', () => {
    expect(() =>
      parseOpenAiResponse({
        choices: [
          {
            message: {
              content: null,
              tool_calls: [
                { id: 'call-1', type: 'function', function: { name: 'x', arguments: '{not json' } },
              ],
            },
            finish_reason: 'tool_calls',
          },
        ],
        usage: { prompt_tokens: 1, completion_tokens: 1 },
      }),
    ).toThrowError(/JSON/)
  })

  it('throws PROVIDER_RESPONSE_INVALID when there are no choices', () => {
    expect(() =>
      parseOpenAiResponse({ choices: [], usage: { prompt_tokens: 1, completion_tokens: 0 } }),
    ).toThrowError(/no choices/)
  })
})
