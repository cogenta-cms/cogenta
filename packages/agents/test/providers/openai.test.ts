import { describe, expect, it } from 'vitest'
import {
  buildOpenAiRequest,
  createOpenAiClient,
  parseOpenAiResponse,
} from '../../src/providers/openai.js'
import { createToolNameDecoder } from '../../src/providers/tool-names.js'
import type { ChatRequest } from '../../src/providers/types.js'
import { TEST_TUNING_DEFAULTS } from './test-tuning-defaults.js'

describe('buildOpenAiRequest', () => {
  it('sends max_tokens by default, unchanged from before useMaxCompletionTokens existed', () => {
    const request: ChatRequest = {
      model: 'gpt-5',
      messages: [{ role: 'user', content: 'Hi' }],
      maxTokens: 100,
    }

    const built = buildOpenAiRequest(request, 8000)
    expect(built.max_tokens).toBe(100)
    expect(built.max_completion_tokens).toBeUndefined()
  })

  // Fiche feedback, 2026-09-07: a real gpt-5-mini request carrying
  // max_tokens was rejected outright by OpenAI — confirmed live.
  it('sends max_completion_tokens instead of max_tokens when useMaxCompletionTokens is true', () => {
    const request: ChatRequest = {
      model: 'gpt-5-mini',
      messages: [{ role: 'user', content: 'Hi' }],
      maxTokens: 100,
    }

    const built = buildOpenAiRequest(request, 8000, true)
    expect(built.max_completion_tokens).toBe(100)
    expect(built.max_tokens).toBeUndefined()
  })

  it('prepends a system message when request.system is set', () => {
    const request: ChatRequest = {
      model: 'gpt-5',
      system: 'Be concise.',
      messages: [{ role: 'user', content: 'Hello' }],
      maxTokens: 100,
    }

    expect(buildOpenAiRequest(request, 8000).messages).toEqual([
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

    const built = buildOpenAiRequest(request, 8000)
    expect(built.tools).toEqual([
      {
        type: 'function',
        function: {
          name: 'content__publish',
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
            function: { name: 'content__publish', arguments: '{"id":"e1"}' },
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

    expect(buildOpenAiRequest(request, 8000).messages).toEqual([
      { role: 'tool', content: '{"ok":true}', tool_call_id: 'call-1' },
    ])
  })

  it('throws PROVIDER_RESPONSE_INVALID when a tool message has no toolCallId', () => {
    const request: ChatRequest = {
      model: 'gpt-5',
      messages: [{ role: 'tool', content: 'result' }],
      maxTokens: 100,
    }

    expect(() => buildOpenAiRequest(request, 8000)).toThrowError(/toolCallId/)
  })

  it('leaves a plain string message untouched — the byte-for-byte-identical path this adapter had before images', () => {
    const request: ChatRequest = {
      model: 'gpt-5',
      messages: [{ role: 'user', content: 'Describe this image.' }],
      maxTokens: 100,
    }

    expect(buildOpenAiRequest(request, 8000).messages).toEqual([
      { role: 'user', content: 'Describe this image.' },
    ])
  })

  it('maps a text-only content-part array to the OpenAI text content-part shape', () => {
    const request: ChatRequest = {
      model: 'gpt-5',
      messages: [{ role: 'user', content: [{ type: 'text', text: 'Describe this image.' }] }],
      maxTokens: 100,
    }

    expect(buildOpenAiRequest(request, 8000).messages).toEqual([
      { role: 'user', content: [{ type: 'text', text: 'Describe this image.' }] },
    ])
  })

  it('maps an image content part to an OpenAI image_url data URL alongside text', () => {
    const request: ChatRequest = {
      model: 'gpt-5',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'What is in this image?' },
            { type: 'image', mediaType: 'image/png', data: 'aGVsbG8=' },
          ],
        },
      ],
      maxTokens: 100,
    }

    expect(buildOpenAiRequest(request, 8000).messages).toEqual([
      {
        role: 'user',
        content: [
          { type: 'text', text: 'What is in this image?' },
          { type: 'image_url', image_url: { url: 'data:image/png;base64,aGVsbG8=' } },
        ],
      },
    ])
  })
})

describe('createOpenAiClient', () => {
  it('reports supportsVision: true — every openai-compatible vendor is assumed able to take an inline image, since which ones actually can changes on their own schedule', () => {
    const client = createOpenAiClient({
      apiKey: 'k',
      model: 'gpt-5',
      defaults: TEST_TUNING_DEFAULTS,
    })
    expect(client.supportsVision).toBe(true)
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
    const parsed = parseOpenAiResponse(
      {
        choices: [
          {
            message: {
              content: null,
              tool_calls: [
                {
                  id: 'call-1',
                  type: 'function',
                  function: { name: 'content__publish', arguments: '{"id":"e1"}' },
                },
              ],
            },
            finish_reason: 'tool_calls',
          },
        ],
        usage: { prompt_tokens: 30, completion_tokens: 10 },
      },
      createToolNameDecoder({
        model: 'm',
        maxTokens: 1,
        messages: [],
        tools: [{ name: 'content.publish', description: '', inputSchema: {} }],
      }),
    )

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
