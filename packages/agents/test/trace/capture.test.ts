import { describe, expect, it, vi } from 'vitest'
import type { RunResult } from '../../src/runtime/types.js'
import { captureTrace } from '../../src/trace/capture.js'
import { createMemoryTraceStore } from '../../src/trace/memory-store.js'

const RESULT: RunResult = {
  messages: [{ role: 'assistant', content: 'Done.' }],
  steps: [],
  finalText: 'Done.',
  stopReason: 'end_turn',
  usage: { inputTokens: 10, outputTokens: 5 },
}

describe('captureTrace', () => {
  it('returns the run result unchanged', async () => {
    const store = createMemoryTraceStore()
    const result = await captureTrace(async () => RESULT, { agentName: 'security', store })
    expect(result).toBe(RESULT)
  })

  it('saves a trace built from the result, by default (sampleRate 1)', async () => {
    const store = createMemoryTraceStore()

    await captureTrace(async () => RESULT, {
      agentName: 'security',
      store,
      newId: () => 'trace-1',
      now: () => new Date('2026-01-01T00:00:00.000Z').getTime(),
    })

    const saved = await store.get('trace-1')
    expect(saved).toEqual({
      id: 'trace-1',
      agentName: 'security',
      startedAt: '2026-01-01T00:00:00.000Z',
      finishedAt: '2026-01-01T00:00:00.000Z',
      stopReason: 'end_turn',
      usage: { inputTokens: 10, outputTokens: 5 },
      steps: [],
      messages: [{ role: 'assistant', content: 'Done.' }],
    })
  })

  it('skips saving when random() lands above sampleRate', async () => {
    const store = createMemoryTraceStore()
    const save = vi.spyOn(store, 'save')

    await captureTrace(async () => RESULT, {
      agentName: 'security',
      store,
      sampleRate: 0.1,
      random: () => 0.5,
    })

    expect(save).not.toHaveBeenCalled()
  })

  it('saves when random() lands below sampleRate', async () => {
    const store = createMemoryTraceStore()
    const save = vi.spyOn(store, 'save')

    await captureTrace(async () => RESULT, {
      agentName: 'security',
      store,
      sampleRate: 0.9,
      random: () => 0.1,
    })

    expect(save).toHaveBeenCalledTimes(1)
  })

  it('propagates a rejection from the run without saving a trace', async () => {
    const store = createMemoryTraceStore()
    const save = vi.spyOn(store, 'save')

    await expect(
      captureTrace(
        async () => {
          throw new Error('run failed')
        },
        { agentName: 'security', store },
      ),
    ).rejects.toThrowError('run failed')
    expect(save).not.toHaveBeenCalled()
  })
})
