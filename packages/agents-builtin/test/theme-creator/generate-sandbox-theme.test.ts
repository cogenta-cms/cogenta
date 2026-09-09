import type { ChatRequest, ChatResponse, ProviderClient } from '@cogenta/agents'
import { describe, expect, it } from 'vitest'
import { generateSandboxTheme } from '../../src/theme-creator/generate-sandbox-theme.js'

const USAGE = { inputTokens: 10, outputTokens: 5 }

function toolCallResponse(input: Readonly<Record<string, unknown>>, id: string): ChatResponse {
  return {
    content: null,
    toolCalls: [{ id, name: 'theme.write_sandbox_file', input }],
    stopReason: 'tool_use',
    usage: USAGE,
  }
}

function textResponse(text: string): ChatResponse {
  return { content: text, toolCalls: [], stopReason: 'end_turn', usage: USAGE }
}

function fakeClient(
  responses: readonly ChatResponse[],
): ProviderClient & { readonly requests: ChatRequest[] } {
  const requests: ChatRequest[] = []
  let index = 0
  return {
    name: 'fake',
    model: 'fake-model',
    maxOutputTokens: 8000,
    requestTimeoutMs: 180_000,
    maxCorrectionAttempts: 3,
    requests,
    async chat(request) {
      requests.push(request)
      const response = responses[index]
      index += 1
      if (response === undefined) throw new Error('fakeClient: ran out of scripted responses')
      return response
    },
  }
}

describe('generateSandboxTheme', () => {
  it('writes every file the model asks for, in order, and reports them back', async () => {
    const written: { path: string; content: string }[] = []
    const client = fakeClient([
      toolCallResponse(
        { sandboxId: 'ai-theme-1', path: 'theme.config.mjs', content: 'export default {}' },
        'call-1',
      ),
      toolCallResponse(
        {
          sandboxId: 'ai-theme-1',
          path: 'theme.render.mjs',
          content: 'export function renderPage(){}',
        },
        'call-2',
      ),
      toolCallResponse(
        { sandboxId: 'ai-theme-1', path: 'style.css', content: '.cg-main{color:red}' },
        'call-3',
      ),
      textResponse('The theme is complete: manifest, render module and one stylesheet.'),
    ])

    const result = await generateSandboxTheme({
      client,
      model: 'fake-model',
      description: 'A magazine-style layout with a full-bleed banner',
      siteName: 'Acme',
      sandboxId: 'ai-theme-1',
      writeFile: async (input) => {
        written.push({ path: input.path, content: input.content })
        return { path: input.path }
      },
      deleteFile: async () => undefined,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.sandboxId).toBe('ai-theme-1')
    expect(result.filesWritten).toEqual(['theme.config.mjs', 'theme.render.mjs', 'style.css'])
    expect(result.rationale).toContain('manifest')
    expect(written).toHaveLength(3)
  })

  it('reports failure when the model never writes any file', async () => {
    const client = fakeClient([textResponse('I could not do this.')])

    const result = await generateSandboxTheme({
      client,
      model: 'fake-model',
      description: 'Something',
      siteName: 'Acme',
      sandboxId: 'ai-theme-2',
      writeFile: async (input) => ({ path: input.path }),
      deleteFile: async () => undefined,
    })

    expect(result.ok).toBe(false)
  })

  it('feeds a rejected write back to the model as a tool error, and still succeeds once the model corrects it', async () => {
    let attempt = 0
    const client = fakeClient([
      toolCallResponse(
        { sandboxId: 'ai-theme-3', path: 'theme.config.mjs', content: 'not a real manifest' },
        'call-1',
      ),
      toolCallResponse(
        { sandboxId: 'ai-theme-3', path: 'theme.config.mjs', content: 'export default {}' },
        'call-2',
      ),
      textResponse('Fixed.'),
    ])

    const result = await generateSandboxTheme({
      client,
      model: 'fake-model',
      description: 'Something',
      siteName: 'Acme',
      sandboxId: 'ai-theme-3',
      writeFile: async (input) => {
        attempt += 1
        if (attempt === 1) throw new Error('theme.config.mjs failed to load: not a real manifest')
        return { path: input.path }
      },
      deleteFile: async () => undefined,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.filesWritten).toEqual(['theme.config.mjs'])
    // The model's second attempt followed a tool-result error message, not a fresh unrelated prompt.
    const secondRequestMessages = client.requests[1]?.messages ?? []
    const hasErrorFeedback = secondRequestMessages.some(
      (message) =>
        message.role === 'tool' &&
        typeof message.content === 'string' &&
        message.content.includes('not a real manifest'),
    )
    expect(hasErrorFeedback).toBe(true)
  })
})
