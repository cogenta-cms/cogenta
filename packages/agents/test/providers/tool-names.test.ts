import { describe, expect, it } from 'vitest'
import { createToolNameDecoder, encodeToolName } from '../../src/providers/tool-names.js'
import type { ChatRequest } from '../../src/providers/types.js'

/**
 * Found live (2026-09-02): DeepSeek refused every agent run with
 * `400 Invalid 'tools[0].function.name': string does not match pattern`
 * because contract C names carry a dot. The vendors all enforce
 * `^[a-zA-Z0-9_-]+$`; these tests pin the encoding both ways.
 */

const WIRE_PATTERN = /^[a-zA-Z0-9_-]+$/u

function request(toolNames: readonly string[], historyCalls: readonly string[] = []): ChatRequest {
  return {
    model: 'm',
    maxTokens: 1,
    messages: historyCalls.map((name) => ({
      role: 'assistant' as const,
      toolCalls: [{ id: 'c', name, input: {} }],
    })),
    tools: toolNames.map((name) => ({ name, description: '', inputSchema: {} })),
  }
}

describe('encodeToolName', () => {
  it('turns every contract C tool name into one the wire formats accept', () => {
    for (const name of [
      'content.read',
      'redirects.create',
      'code.propose_patch',
      'assist.find_duplicates',
    ]) {
      expect(encodeToolName(name)).toMatch(WIRE_PATTERN)
    }
    expect(encodeToolName('content.read')).toBe('content__read')
  })

  it('leaves an already-safe name untouched, so encoding is idempotent', () => {
    expect(encodeToolName('content__read')).toBe('content__read')
    expect(encodeToolName(encodeToolName('a.b'))).toBe(encodeToolName('a.b'))
  })
})

describe('createToolNameDecoder', () => {
  it('maps a wire name back to the declared tool, including one only seen in history', () => {
    const decode = createToolNameDecoder(request(['content.read'], ['redirects.create']))
    expect(decode('content__read')).toBe('content.read')
    expect(decode('redirects__create')).toBe('redirects.create')
  })

  it('returns an unknown wire name unchanged, for the runtime registry to refuse', () => {
    const decode = createToolNameDecoder(request(['content.read']))
    expect(decode('made_up_tool')).toBe('made_up_tool')
  })

  it('refuses two tools that would become the same wire name', () => {
    expect(() => createToolNameDecoder(request(['a.b', 'a__b']))).toThrowError(/indistinguishable/u)
  })
})
