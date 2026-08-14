import { describe, expect, it } from 'vitest'
import { buildGoogleRequest, parseGoogleResponse } from '../../src/providers/google.js'
import type { ChatRequest } from '../../src/providers/types.js'

describe('buildGoogleRequest', () => {
  it('maps system to systemInstruction and assistant to role: model', () => {
    const request: ChatRequest = {
      model: 'gemini-3-pro',
      system: 'Be concise.',
      messages: [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi.' },
      ],
      maxTokens: 100,
    }

    const built = buildGoogleRequest(request)
    expect(built.systemInstruction).toEqual({ parts: [{ text: 'Be concise.' }] })
    expect(built.contents).toEqual([
      { role: 'user', parts: [{ text: 'Hello' }] },
      { role: 'model', parts: [{ text: 'Hi.' }] },
    ])
    expect(built.generationConfig).toEqual({ maxOutputTokens: 100 })
  })

  it('maps tool specs to functionDeclarations and an assistant tool call to a functionCall part', () => {
    const request: ChatRequest = {
      model: 'gemini-3-pro',
      messages: [
        {
          role: 'assistant',
          toolCalls: [{ id: 'content.publish', name: 'content.publish', input: { id: 'e1' } }],
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

    const built = buildGoogleRequest(request)
    expect(built.tools).toEqual([
      {
        functionDeclarations: [
          {
            name: 'content.publish',
            description: 'Publish content.',
            parameters: { type: 'object', properties: { id: { type: 'string' } } },
          },
        ],
      },
    ])
    expect(built.contents).toEqual([
      { role: 'model', parts: [{ functionCall: { name: 'content.publish', args: { id: 'e1' } } }] },
    ])
  })

  it('maps a tool-role message to a user turn carrying a functionResponse part, keyed by toolName', () => {
    const request: ChatRequest = {
      model: 'gemini-3-pro',
      messages: [{ role: 'tool', toolName: 'content.publish', content: '{"ok":true}' }],
      maxTokens: 100,
    }

    expect(buildGoogleRequest(request).contents).toEqual([
      {
        role: 'user',
        parts: [
          { functionResponse: { name: 'content.publish', response: { result: '{"ok":true}' } } },
        ],
      },
    ])
  })

  it('throws PROVIDER_RESPONSE_INVALID when a tool message has neither toolName nor toolCallId', () => {
    const request: ChatRequest = {
      model: 'gemini-3-pro',
      messages: [{ role: 'tool', content: 'result' }],
      maxTokens: 100,
    }

    expect(() => buildGoogleRequest(request)).toThrowError(/toolName/)
  })
})

describe('parseGoogleResponse', () => {
  it('extracts text parts and maps finishReason: STOP to end_turn', () => {
    const parsed = parseGoogleResponse({
      candidates: [{ content: { parts: [{ text: 'Done.' }] }, finishReason: 'STOP' }],
      usageMetadata: { promptTokenCount: 12, candidatesTokenCount: 4 },
    })

    expect(parsed).toEqual({
      content: 'Done.',
      toolCalls: [],
      stopReason: 'end_turn',
      usage: { inputTokens: 12, outputTokens: 4 },
    })
  })

  it('extracts functionCall parts as tool calls, synthesising the id from the name', () => {
    const parsed = parseGoogleResponse({
      candidates: [
        {
          content: {
            parts: [{ functionCall: { name: 'content.publish', args: { id: 'e1' } } }],
          },
          finishReason: 'STOP',
        },
      ],
      usageMetadata: { promptTokenCount: 30, candidatesTokenCount: 10 },
    })

    expect(parsed.content).toBeNull()
    expect(parsed.toolCalls).toEqual([
      { id: 'content.publish', name: 'content.publish', input: { id: 'e1' } },
    ])
  })

  it('throws PROVIDER_RESPONSE_INVALID when there are no candidates', () => {
    expect(() =>
      parseGoogleResponse({
        candidates: [],
        usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 0 },
      }),
    ).toThrowError(/no candidates/)
  })
})
