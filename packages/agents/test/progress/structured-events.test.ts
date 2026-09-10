import { describe, expect, it } from 'vitest'
import { createProgressJobStore } from '../../src/progress/job-store.js'
import type { ChatResponse, ProviderClient } from '../../src/providers/types.js'
import { runAgentLoop } from '../../src/runtime/loop.js'
import type { ExecutableTool } from '../../src/runtime/types.js'

/**
 * A progress line now says what it *is*, not only what it reads like.
 *
 * The admin was deciding whether a line meant "thinking", "a tool ran" or "a
 * tool failed" by running regular expressions over English prose produced in
 * another package — a UI guessing at a string it does not own, which breaks
 * the first time a message is reworded or translated. These tests pin the
 * structured half down end to end: the runtime labels the line, the job
 * store carries the label through, and a reporter that supplies none still
 * works exactly as before.
 */

const USAGE = { inputTokens: 1, outputTokens: 1 }

function client(responses: readonly ChatResponse[]): ProviderClient {
  let index = 0
  return {
    name: 'fake',
    model: 'fake',
    maxOutputTokens: 1000,
    requestTimeoutMs: 10_000,
    maxCorrectionAttempts: 1,
    async chat() {
      const response = responses[index]
      index += 1
      if (response === undefined) throw new Error('out of scripted responses')
      return response
    },
  }
}

function tool(name: string, behaviour: 'ok' | 'throw'): ExecutableTool {
  return {
    spec: {
      name,
      description: 'fixture',
      inputSchema: { type: 'object', properties: {} },
    },
    execute: async () => {
      if (behaviour === 'throw') throw new Error('fixture tool failure')
      return { done: true }
    },
  } as unknown as ExecutableTool
}

describe('progress lines carry their own kind', () => {
  it('labels thinking, a tool call and its success without anyone reading the wording', async () => {
    const seen: { message: string; kind?: string; tool?: string }[] = []

    await runAgentLoop({
      client: client([
        {
          content: null,
          toolCalls: [{ id: '1', name: 'demo.act', input: {} }],
          stopReason: 'tool_use',
          usage: USAGE,
        },
        { content: 'finished', toolCalls: [], stopReason: 'end_turn', usage: USAGE },
      ]),
      messages: [{ role: 'user', content: 'go' }],
      tools: [tool('demo.act', 'ok')],
      onProgress: {
        report(message, detail) {
          seen.push({
            message,
            ...(detail === undefined ? {} : { kind: detail.kind }),
            ...(detail?.tool === undefined ? {} : { tool: detail.tool }),
          })
        },
      },
    })

    expect(seen.map((entry) => entry.kind)).toEqual([
      'thinking',
      'tool-call',
      'tool-ok',
      'thinking',
    ])
    expect(seen.filter((entry) => entry.tool === 'demo.act')).toHaveLength(2)
  })

  it('labels a failing tool as failed rather than leaving it to look like any other line', async () => {
    const kinds: (string | undefined)[] = []

    await runAgentLoop({
      client: client([
        {
          content: null,
          toolCalls: [{ id: '1', name: 'demo.act', input: {} }],
          stopReason: 'tool_use',
          usage: USAGE,
        },
        { content: 'gave up', toolCalls: [], stopReason: 'end_turn', usage: USAGE },
      ]),
      messages: [{ role: 'user', content: 'go' }],
      tools: [tool('demo.act', 'throw')],
      onProgress: {
        report(_message, detail) {
          kinds.push(detail?.kind)
        },
      },
    })

    expect(kinds).toContain('tool-failed')
    expect(kinds).not.toContain('tool-ok')
  })

  it('carries the label through the job store a polling client actually reads', async () => {
    const store = createProgressJobStore<string>()
    const id = store.start(async (reporter) => {
      reporter.report('Thinking…', { kind: 'thinking' })
      reporter.report('Calling tool "theme.write_sandbox_file"…', {
        kind: 'tool-call',
        tool: 'theme.write_sandbox_file',
      })
      reporter.report('an untyped line')
      return 'done'
    })

    await Promise.resolve()
    await Promise.resolve()

    const events = store.get(id)?.events ?? []
    expect(events[0]?.kind).toBe('thinking')
    expect(events[1]?.tool).toBe('theme.write_sandbox_file')
    // A reporter that classifies nothing is still valid — the consumer falls
    // back to reading the message, exactly as it did before.
    expect(events[2]?.kind).toBeUndefined()
    expect(events[2]?.message).toBe('an untyped line')
  })
})
