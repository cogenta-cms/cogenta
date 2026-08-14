import type { ChatMessage, ProviderToolCall, TokenUsage } from '../providers/types.js'
import { RepetitionGuard } from './repetition.js'
import { retryModelCall, withTimeout } from './retry.js'
import type {
  ExecutableTool,
  RunAgentLoopInput,
  RunResult,
  StepRecord,
  ToolCallOutcome,
} from './types.js'

const DEFAULT_MAX_STEPS = 25
const DEFAULT_MAX_ATTEMPTS = 3
const DEFAULT_TIMEOUT_MS = 60_000
const DEFAULT_MAX_REPEATS = 2

function addUsage(a: TokenUsage, b: TokenUsage): TokenUsage {
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
  }
}

function toolByName(tools: readonly ExecutableTool[]): ReadonlyMap<string, ExecutableTool> {
  return new Map(tools.map((tool) => [tool.spec.name, tool]))
}

async function runTool(
  tool: ExecutableTool | undefined,
  call: ProviderToolCall,
  signal: AbortSignal,
): Promise<ToolCallOutcome> {
  if (tool === undefined) {
    return { call, ok: false, error: `No tool named "${call.name}" is available in this run.` }
  }
  try {
    const result = await tool.execute(call.input, { signal })
    return { call, ok: true, output: result === undefined ? '' : JSON.stringify(result) }
  } catch (error) {
    return { call, ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

/**
 * L4 task 2: one model call, tool dispatch, repeat — with the three guards
 * the lot's own "pièges connus" call out by name: a step ceiling, repetition
 * detection, and per-call cost (usage) measured from the first line rather
 * than discovered later. Permission checking (task 4) and budgets (task 8)
 * wrap this from the outside; this loop only knows how to hold a
 * conversation with a model and the tools it was handed.
 */
export async function runAgentLoop(input: RunAgentLoopInput): Promise<RunResult> {
  const maxSteps = input.maxSteps ?? DEFAULT_MAX_STEPS
  const maxAttempts = input.maxAttempts ?? DEFAULT_MAX_ATTEMPTS
  const timeoutMs = input.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const tools = input.tools ?? []
  const toolIndex = toolByName(tools)
  const toolSpecs = tools.length === 0 ? undefined : tools.map((tool) => tool.spec)
  const repetitionGuard = new RepetitionGuard(input.maxRepeats ?? DEFAULT_MAX_REPEATS)

  const messages: ChatMessage[] = [...input.messages]
  const steps: StepRecord[] = []
  let totalUsage: TokenUsage = { inputTokens: 0, outputTokens: 0 }
  let finalText: string | null = null

  for (let step = 0; step < maxSteps; step++) {
    if (input.signal?.aborted === true) {
      return { messages, steps, finalText, stopReason: 'cancelled', usage: totalUsage }
    }

    const response = await retryModelCall(
      () =>
        withTimeout(
          (signal) =>
            input.client.chat(
              {
                model: input.client.model,
                ...(input.system === undefined ? {} : { system: input.system }),
                messages: [...messages],
                ...(toolSpecs === undefined ? {} : { tools: toolSpecs }),
                maxTokens: input.maxTokens,
                ...(input.temperature === undefined ? {} : { temperature: input.temperature }),
              },
              { signal },
            ),
          timeoutMs,
          input.signal,
        ),
      { maxAttempts },
    )

    totalUsage = addUsage(totalUsage, response.usage)

    const assistantMessage: ChatMessage = {
      role: 'assistant',
      ...(response.content === null ? {} : { content: response.content }),
      ...(response.toolCalls.length === 0 ? {} : { toolCalls: response.toolCalls }),
    }
    messages.push(assistantMessage)
    if (response.content !== null) finalText = response.content

    if (response.toolCalls.length === 0) {
      steps.push({ response: assistantMessage, usage: response.usage, toolOutcomes: [] })
      const stopReason = response.stopReason === 'max_tokens' ? 'max_tokens' : 'end_turn'
      return { messages, steps, finalText, stopReason, usage: totalUsage }
    }

    if (response.toolCalls.some((call) => repetitionGuard.wouldRepeat(call))) {
      steps.push({ response: assistantMessage, usage: response.usage, toolOutcomes: [] })
      return { messages, steps, finalText, stopReason: 'repetition_detected', usage: totalUsage }
    }
    for (const call of response.toolCalls) repetitionGuard.record(call)

    const toolOutcomes: ToolCallOutcome[] = []
    for (const call of response.toolCalls) {
      const outcome = await runTool(
        toolIndex.get(call.name),
        call,
        input.signal ?? new AbortController().signal,
      )
      toolOutcomes.push(outcome)
      messages.push({
        role: 'tool',
        toolCallId: call.id,
        toolName: call.name,
        content: outcome.ok ? (outcome.output ?? '') : `Error: ${outcome.error ?? 'unknown error'}`,
      })
    }
    steps.push({ response: assistantMessage, usage: response.usage, toolOutcomes })
  }

  return { messages, steps, finalText, stopReason: 'max_steps', usage: totalUsage }
}
