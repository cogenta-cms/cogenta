import { describe, expect, it, vi } from 'vitest'
import { createMemoryApprovalQueue } from '../../src/autonomy/approval-queue.js'
import { withAutonomy } from '../../src/autonomy/with-autonomy.js'
import { createBudgetTracker } from '../../src/budget/tracker.js'
import type { BudgetTracker } from '../../src/budget/types.js'
import type { ChatRequest, ChatResponse, ProviderClient } from '../../src/providers/types.js'
import { runAgentLoop, runTool } from '../../src/runtime/loop.js'
import type { ExecutableTool } from '../../src/runtime/types.js'

function fakeClient(
  responses: readonly ChatResponse[],
): ProviderClient & { readonly calls: ChatRequest[] } {
  const calls: ChatRequest[] = []
  let index = 0
  return {
    name: 'fake',
    model: 'fake-model',
    calls,
    async chat(request) {
      calls.push(request)
      const response = responses[index]
      index += 1
      if (response === undefined) throw new Error('fakeClient: ran out of scripted responses')
      return response
    },
  }
}

const USAGE = { inputTokens: 10, outputTokens: 5 }

function textResponse(text: string): ChatResponse {
  return { content: text, toolCalls: [], stopReason: 'end_turn', usage: USAGE }
}

function toolCallResponse(
  name: string,
  input: Readonly<Record<string, unknown>>,
  id = 'call-1',
): ChatResponse {
  return { content: null, toolCalls: [{ id, name, input }], stopReason: 'tool_use', usage: USAGE }
}

describe('runAgentLoop', () => {
  it('stops at end_turn on the first response with no tool calls', async () => {
    const client = fakeClient([textResponse('Done.')])

    const result = await runAgentLoop({
      client,
      messages: [{ role: 'user', content: 'hi' }],
      maxTokens: 100,
    })

    expect(result.stopReason).toBe('end_turn')
    expect(result.finalText).toBe('Done.')
    expect(result.usage).toEqual(USAGE)
    expect(client.calls).toHaveLength(1)
  })

  it('dispatches a tool call, feeds the result back, and finishes on the next end_turn', async () => {
    const client = fakeClient([
      toolCallResponse('content.publish', { id: 'e1' }),
      textResponse('Published.'),
    ])
    const publish: ExecutableTool = {
      spec: { name: 'content.publish', description: 'Publish.', inputSchema: {} },
      execute: async (input) => ({ url: `/entries/${input.id as string}` }),
    }

    const result = await runAgentLoop({
      client,
      messages: [{ role: 'user', content: 'publish e1' }],
      tools: [publish],
      maxTokens: 100,
    })

    expect(result.stopReason).toBe('end_turn')
    expect(result.finalText).toBe('Published.')
    expect(result.usage).toEqual({ inputTokens: 20, outputTokens: 10 })
    // The second model call must have seen the tool's result as a `tool` message.
    expect(client.calls[1]?.messages.at(-1)).toEqual({
      role: 'tool',
      toolCallId: 'call-1',
      toolName: 'content.publish',
      content: '{"url":"/entries/e1"}',
    })
  })

  it('reports an unknown tool as a failed outcome instead of throwing', async () => {
    const client = fakeClient([toolCallResponse('nonexistent.tool', {}), textResponse('ok')])

    const result = await runAgentLoop({
      client,
      messages: [{ role: 'user', content: 'hi' }],
      maxTokens: 100,
    })

    expect(result.steps[0]?.toolOutcomes).toEqual([
      {
        call: { id: 'call-1', name: 'nonexistent.tool', input: {} },
        ok: false,
        error: expect.stringContaining('No tool named'),
      },
    ])
  })

  it('reports a throwing tool as a failed outcome, and still continues the run', async () => {
    const client = fakeClient([toolCallResponse('boom', {}), textResponse('recovered')])
    const boom: ExecutableTool = {
      spec: { name: 'boom', description: 'Always fails.', inputSchema: {} },
      execute: async () => {
        throw new Error('kaboom')
      },
    }

    const result = await runAgentLoop({
      client,
      messages: [{ role: 'user', content: 'hi' }],
      tools: [boom],
      maxTokens: 100,
    })

    expect(result.stopReason).toBe('end_turn')
    expect(result.steps[0]?.toolOutcomes[0]).toEqual({
      call: { id: 'call-1', name: 'boom', input: {} },
      ok: false,
      error: 'kaboom',
    })
  })

  it('stops at max_steps rather than looping forever', async () => {
    const responses = Array.from({ length: 10 }, (_unused, i) =>
      toolCallResponse('x', { i }, `call-${i}`),
    )
    const client = fakeClient(responses)
    const x: ExecutableTool = {
      spec: { name: 'x', description: 'x', inputSchema: {} },
      execute: async () => 'ok',
    }

    const result = await runAgentLoop({
      client,
      messages: [{ role: 'user', content: 'hi' }],
      tools: [x],
      maxTokens: 100,
      maxSteps: 3,
    })

    expect(result.stopReason).toBe('max_steps')
    expect(result.steps).toHaveLength(3)
  })

  it('stops on repetition_detected before executing the (maxRepeats + 1)th identical call', async () => {
    const responses = Array.from({ length: 10 }, (_unused, i) =>
      toolCallResponse('x', { same: true }, `call-${i}`),
    )
    const client = fakeClient(responses)
    let executions = 0
    const x: ExecutableTool = {
      spec: { name: 'x', description: 'x', inputSchema: {} },
      execute: async () => {
        executions += 1
        return 'ok'
      },
    }

    const result = await runAgentLoop({
      client,
      messages: [{ role: 'user', content: 'hi' }],
      tools: [x],
      maxTokens: 100,
      maxRepeats: 2,
    })

    expect(result.stopReason).toBe('repetition_detected')
    // Two identical calls execute; the third is caught before it runs.
    expect(executions).toBe(2)
  })

  it('stops immediately with cancelled when the signal is already aborted', async () => {
    const client = fakeClient([textResponse('should not be reached')])
    const controller = new AbortController()
    controller.abort()

    const result = await runAgentLoop({
      client,
      messages: [{ role: 'user', content: 'hi' }],
      maxTokens: 100,
      signal: controller.signal,
    })

    expect(result.stopReason).toBe('cancelled')
    expect(client.calls).toHaveLength(0)
  })

  it('includes tools in every request when any are configured', async () => {
    const client = fakeClient([textResponse('ok')])
    const tool: ExecutableTool = {
      spec: { name: 'x', description: 'x', inputSchema: { type: 'object' } },
      execute: async () => 'ok',
    }

    await runAgentLoop({
      client,
      messages: [{ role: 'user', content: 'hi' }],
      tools: [tool],
      maxTokens: 100,
    })

    expect(client.calls[0]?.tools).toEqual([
      { name: 'x', description: 'x', inputSchema: { type: 'object' } },
    ])
  })

  it('stops immediately with killed when the kill switch is already active', async () => {
    const client = fakeClient([textResponse('should not be reached')])

    const result = await runAgentLoop({
      client,
      messages: [{ role: 'user', content: 'hi' }],
      maxTokens: 100,
      killSwitch: { isActive: () => true },
    })

    expect(result.stopReason).toBe('killed')
    expect(client.calls).toHaveLength(0)
  })

  it('stops with budget_exceeded before the call the budget would refuse, and alerts once with the reason', async () => {
    const client = fakeClient([textResponse('should not be reached')])
    const budget: BudgetTracker = {
      checkCall: () => ({ allowed: false, reason: 'tokensPerDay' }),
      recordCall: vi.fn(),
      usage: () => ({ tokensToday: 0, eurThisMonth: 0, callsThisHour: 0 }),
    }
    const onBudgetExceeded = vi.fn()

    const result = await runAgentLoop({
      client,
      messages: [{ role: 'user', content: 'hi' }],
      maxTokens: 100,
      budget,
      onBudgetExceeded,
    })

    expect(result.stopReason).toBe('budget_exceeded')
    expect(client.calls).toHaveLength(0)
    expect(onBudgetExceeded).toHaveBeenCalledExactlyOnceWith('tokensPerDay')
  })

  it('records real usage into a live budget tracker after each call, so a later step can be refused', async () => {
    const client = fakeClient([
      toolCallResponse('x', {}),
      toolCallResponse('x', { retry: true }),
      textResponse('should not be reached'),
    ])
    const x: ExecutableTool = {
      spec: { name: 'x', description: 'x', inputSchema: {} },
      execute: async () => 'ok',
    }
    // USAGE is 15 tokens/call; the third call would push past 30.
    const budget = createBudgetTracker({ limits: { tokensPerDay: 30 } })

    const result = await runAgentLoop({
      client,
      messages: [{ role: 'user', content: 'hi' }],
      tools: [x],
      maxTokens: 100,
      budget,
    })

    expect(result.stopReason).toBe('budget_exceeded')
    expect(client.calls).toHaveLength(2)
  })

  it('stops with max_duration once the wall-clock ceiling is reached, using the injected clock', async () => {
    const client = fakeClient([
      toolCallResponse('x', {}),
      toolCallResponse('x', { i: 2 }, 'call-2'),
    ])
    const x: ExecutableTool = {
      spec: { name: 'x', description: 'x', inputSchema: {} },
      execute: async () => 'ok',
    }
    let clock = 0
    const result = await runAgentLoop({
      client,
      messages: [{ role: 'user', content: 'hi' }],
      tools: [x],
      maxTokens: 100,
      maxRunDurationMs: 100,
      now: () => {
        clock += 60
        return clock
      },
    })

    expect(result.stopReason).toBe('max_duration')
    expect(client.calls).toHaveLength(1)
  })

  it('throws PRIVACY_NO_DATA_LEAVES_VIOLATION before the first model call when the client is outside the allowlist', async () => {
    const client = fakeClient([textResponse('should never be reached')])

    await expect(
      runAgentLoop({
        client,
        messages: [{ role: 'user', content: 'hi' }],
        maxTokens: 100,
        privacyPolicy: { enabled: true, localProviderNames: ['ollama'] },
      }),
    ).rejects.toThrowError(/"fake" is not in the local provider allowlist/)
    expect(client.calls).toHaveLength(0)
  })

  it('never checks the privacy policy when it is not set at all', async () => {
    const client = fakeClient([textResponse('fine')])

    const result = await runAgentLoop({
      client,
      messages: [{ role: 'user', content: 'hi' }],
      maxTokens: 100,
    })

    expect(result.stopReason).toBe('end_turn')
  })
})

/**
 * L24 task 1's own acceptance criterion: prove, not assume, that R4 ("un
 * outil déclare ses permissions ; le runtime les vérifie — jamais un
 * contrôle d'accès à l'intérieur d'un outil") still holds now that the loop
 * runs as a LangGraph `StateGraph`. `runTool` (exported from `runtime/loop.js`)
 * is exactly the function the graph's `tools` node calls for every tool call
 * — there is no other code path a node could take to reach a tool's
 * `execute`. It contains zero autonomy logic of its own (no `if
 * (autonomyLevel === ...)` anywhere in it), which this suite verifies two
 * ways: by showing it happily executes a raw tool's real side effect (proof
 * that the *node* itself supplies no gate — if it did, this call would be
 * blocked too), and by showing that the exact same function, given the
 * *same* tool `withAutonomy`-wrapped the way `agents/orchestrator.ts`
 * actually wraps every tool it ever hands to `runAgentLoop`, never reaches
 * that side effect at all. The gate lives entirely in the tool object handed
 * in — there is no seam inside the graph for a node (compromised, buggy, or
 * otherwise) to reach around it, because the graph is never given a raw tool
 * to begin with.
 */
describe('R4 survives the LangGraph migration: the graph node has no permission logic of its own', () => {
  function sideEffectingTool(counter: { count: number }): ExecutableTool {
    return {
      spec: { name: 'content.write_draft', description: 'Write a draft.', inputSchema: {} },
      sideEffects: true,
      reversible: true, // avoids contract C's separate forced-approval rule, isolating the autonomy *level* branch under test
      async execute() {
        counter.count += 1
        return { ok: true }
      },
      async revert() {
        counter.count -= 1
      },
    }
  }

  it('runTool (the graph tools node’s own primitive) has no gate: called with a raw tool, the real side effect happens', async () => {
    const counter = { count: 0 }
    const raw = sideEffectingTool(counter)

    const outcome = await runTool(
      raw,
      { id: 'call-1', name: 'content.write_draft', input: {} },
      new AbortController().signal,
    )

    expect(outcome.ok).toBe(true)
    // This is the point: nothing about `runTool`/the tools node itself
    // stopped the side effect — a raw tool always runs. The gate has to
    // come from somewhere else.
    expect(counter.count).toBe(1)
  })

  it('the same primitive, given the withAutonomy-wrapped tool orchestrator.ts actually builds, never reaches the side effect at "observe"', async () => {
    const counter = { count: 0 }
    const raw = sideEffectingTool(counter)
    const wrapped = withAutonomy(raw, {
      agentName: 'Watcher',
      autonomy: { default: 'observe' },
      approvalQueue: createMemoryApprovalQueue(),
    })

    const outcome = await runTool(
      wrapped,
      { id: 'call-1', name: 'content.write_draft', input: {} },
      new AbortController().signal,
    )

    expect(outcome.ok).toBe(true)
    expect(outcome.output).toContain('"observed":true')
    expect(counter.count).toBe(0)
  })

  it('end-to-end through the compiled graph: a model that keeps asking for the tool across several turns never once triggers the real side effect', async () => {
    const counter = { count: 0 }
    const raw = sideEffectingTool(counter)
    const wrapped = withAutonomy(raw, {
      agentName: 'Watcher',
      autonomy: { default: 'observe' },
      approvalQueue: createMemoryApprovalQueue(),
    })
    // The model asks for the same "dangerous" tool three turns in a row —
    // an attempt, from inside the conversation the graph is driving, to get
    // the side effect to slip through on some turn.
    const client = fakeClient([
      toolCallResponse('content.write_draft', { attempt: 1 }, 'call-1'),
      toolCallResponse('content.write_draft', { attempt: 2 }, 'call-2'),
      toolCallResponse('content.write_draft', { attempt: 3 }, 'call-3'),
      textResponse('gave up'),
    ])

    const result = await runAgentLoop({
      client,
      messages: [{ role: 'user', content: 'write it anyway' }],
      tools: [wrapped],
      maxTokens: 100,
    })

    expect(result.stopReason).toBe('end_turn')
    expect(counter.count).toBe(0)
    expect(result.steps.every((step) => step.toolOutcomes.every((o) => o.ok))).toBe(true)
  })
})
