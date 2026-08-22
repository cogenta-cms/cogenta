import { CogentaError } from '@cogenta/core'
import { Annotation, END, GraphRecursionError, START, StateGraph } from '@langchain/langgraph'
import { assertProviderAllowed } from '../privacy/assert-provider-allowed.js'
import type { ChatMessage, ProviderToolCall, TokenUsage } from '../providers/types.js'
import { RepetitionGuard } from './repetition.js'
import { retryModelCall, withTimeout } from './retry.js'
import type {
  ExecutableTool,
  RunAgentLoopInput,
  RunResult,
  RunStopReason,
  StepRecord,
  ToolCallOutcome,
} from './types.js'

const DEFAULT_MAX_STEPS = 25
const DEFAULT_MAX_ATTEMPTS = 3
const DEFAULT_TIMEOUT_MS = 60_000
const DEFAULT_MAX_REPEATS = 2
const ZERO_USAGE: TokenUsage = { inputTokens: 0, outputTokens: 0 }

function addUsage(a: TokenUsage, b: TokenUsage): TokenUsage {
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
  }
}

function toolByName(tools: readonly ExecutableTool[]): ReadonlyMap<string, ExecutableTool> {
  return new Map(tools.map((tool) => [tool.spec.name, tool]))
}

/**
 * L24 task 1's whole point, made concrete: this function knows nothing about
 * autonomy, approval, or audit. It is handed whatever `ExecutableTool` its
 * caller built, and calls `.execute()` on it — nothing more. Contract C's R4
 * ("un outil déclare ses permissions ; le runtime les vérifie — jamais un
 * contrôle d'accès à l'intérieur d'un outil") extends unchanged to the graph
 * era this way: the *tools* node below (the graph's own "inside a node" —
 * see the task's own wording) is exactly this function wired to LangGraph,
 * so it inherits the same "zero permission logic" property by construction.
 * `packages/agents/test/runtime/loop.test.ts`'s "the graph node has no gate
 * of its own" test calls this directly, once with a tool `withAutonomy`
 * never touched (to show it *would* run unguarded) and once with the same
 * tool wrapped (to show the run this package actually produces never can) —
 * proving the gate lives in the tool object handed in, not in this function.
 */
export async function runTool(
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
 * The graph's state. Every field uses LangGraph's default `LastValue`
 * channel (no reducer) — a node's returned value simply replaces the
 * previous one, the same "whole new value each time" style the pre-L24
 * hand-written loop used for its local variables. `pending*` fields are the
 * only thing carried from the `agent` node to the `tools` node — they hold
 * exactly what the old loop kept on the stack between "got a response with
 * tool calls" and "finished executing them".
 */
const AgentGraphState = Annotation.Root({
  messages: Annotation<ChatMessage[]>(),
  steps: Annotation<StepRecord[]>(),
  usage: Annotation<TokenUsage>(),
  finalText: Annotation<string | null>(),
  stopReason: Annotation<RunStopReason | null>(),
  stepIndex: Annotation<number>(),
  pendingAssistant: Annotation<ChatMessage | null>(),
  pendingToolCalls: Annotation<readonly ProviderToolCall[]>(),
  pendingUsage: Annotation<TokenUsage | null>(),
})

type GraphState = typeof AgentGraphState.State
type GraphUpdate = typeof AgentGraphState.Update

/**
 * Builds (and compiles) a fresh two-node graph for one `runAgentLoop` call:
 * `agent` (one model turn — every guard the old loop checked before calling
 * the model, then the call itself) and `tools` (executes whatever tool calls
 * the `agent` node decided to make, via `runTool` above). `agent` is the only
 * node with an edge back to itself (through `tools`), so "one iteration" of
 * the old `for` loop is exactly one `agent → tools → agent` cycle here — the
 * per-iteration guard order (privacy, signal, kill switch, duration, budget,
 * then the model call) is preserved byte-for-byte because it is still one
 * function, just called by LangGraph instead of by a `for`.
 *
 * Nothing here decides whether a tool call is *allowed* — that decision was
 * already made (or not) before this function ever sees `input.tools`, by
 * whoever built that array (`withAutonomyForManifest` in
 * `agents/orchestrator.ts` for every real caller). The `tools` node below
 * has no branch for "is this tool allowed" — it cannot have one, because it
 * never sees a raw tool to begin with.
 */
function buildAgentGraph(input: RunAgentLoopInput) {
  const maxSteps = input.maxSteps ?? DEFAULT_MAX_STEPS
  const maxAttempts = input.maxAttempts ?? DEFAULT_MAX_ATTEMPTS
  const timeoutMs = input.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const now = input.now ?? Date.now
  const tools = input.tools ?? []
  const toolIndex = toolByName(tools)
  const toolSpecs = tools.length === 0 ? undefined : tools.map((tool) => tool.spec)
  const repetitionGuard = new RepetitionGuard(input.maxRepeats ?? DEFAULT_MAX_REPEATS)
  const runStartedAt = now()

  async function agentNode(state: GraphState): Promise<GraphUpdate> {
    if (input.privacyPolicy !== undefined) {
      assertProviderAllowed(input.client, input.privacyPolicy)
    }
    if (input.signal?.aborted === true) return { stopReason: 'cancelled' }
    if (input.killSwitch?.isActive() === true) return { stopReason: 'killed' }
    if (input.maxRunDurationMs !== undefined && now() - runStartedAt >= input.maxRunDurationMs) {
      return { stopReason: 'max_duration' }
    }
    if (state.stepIndex >= maxSteps) return { stopReason: 'max_steps' }
    if (input.budget !== undefined) {
      const check = input.budget.checkCall()
      if (!check.allowed) {
        if (check.reason !== undefined) input.onBudgetExceeded?.(check.reason)
        return { stopReason: 'budget_exceeded' }
      }
    }

    const response = await retryModelCall(
      () =>
        withTimeout(
          (signal) =>
            input.client.chat(
              {
                model: input.client.model,
                ...(input.system === undefined ? {} : { system: input.system }),
                messages: [...state.messages],
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

    const usage = addUsage(state.usage, response.usage)
    input.budget?.recordCall(response.usage)

    const assistantMessage: ChatMessage = {
      role: 'assistant',
      ...(response.content === null ? {} : { content: response.content }),
      ...(response.toolCalls.length === 0 ? {} : { toolCalls: response.toolCalls }),
    }
    const messages = [...state.messages, assistantMessage]
    const finalText = response.content !== null ? response.content : state.finalText
    const stepIndex = state.stepIndex + 1

    if (response.toolCalls.length === 0) {
      const stopReason = response.stopReason === 'max_tokens' ? 'max_tokens' : 'end_turn'
      return {
        messages,
        finalText,
        usage,
        stepIndex,
        stopReason,
        steps: [
          ...state.steps,
          { response: assistantMessage, usage: response.usage, toolOutcomes: [] },
        ],
      }
    }

    if (response.toolCalls.some((call) => repetitionGuard.wouldRepeat(call))) {
      return {
        messages,
        finalText,
        usage,
        stepIndex,
        stopReason: 'repetition_detected',
        steps: [
          ...state.steps,
          { response: assistantMessage, usage: response.usage, toolOutcomes: [] },
        ],
      }
    }
    for (const call of response.toolCalls) repetitionGuard.record(call)

    return {
      messages,
      finalText,
      usage,
      stepIndex,
      pendingAssistant: assistantMessage,
      pendingToolCalls: response.toolCalls,
      pendingUsage: response.usage,
    }
  }

  async function toolsNode(state: GraphState): Promise<GraphUpdate> {
    const toolOutcomes: ToolCallOutcome[] = []
    let messages = state.messages
    for (const call of state.pendingToolCalls) {
      const outcome = await runTool(
        toolIndex.get(call.name),
        call,
        input.signal ?? new AbortController().signal,
      )
      toolOutcomes.push(outcome)
      messages = [
        ...messages,
        {
          role: 'tool',
          toolCallId: call.id,
          toolName: call.name,
          content: outcome.ok
            ? (outcome.output ?? '')
            : `Error: ${outcome.error ?? 'unknown error'}`,
        },
      ]
    }
    return {
      messages,
      steps: [
        ...state.steps,
        {
          // Set on every path that reaches `tools` (see `agentNode` above) —
          // non-null by construction, not by luck.
          response: state.pendingAssistant as ChatMessage,
          usage: state.pendingUsage as TokenUsage,
          toolOutcomes,
        },
      ],
      pendingAssistant: null,
      pendingToolCalls: [],
      pendingUsage: null,
    }
  }

  function routeAfterAgent(state: GraphState): 'tools' | typeof END {
    return state.stopReason !== null ? END : 'tools'
  }

  const graph = new StateGraph(AgentGraphState)
    .addNode('agent', agentNode)
    .addNode('tools', toolsNode)
    .addEdge(START, 'agent')
    .addConditionalEdges('agent', routeAfterAgent, { tools: 'tools', [END]: END })
    .addEdge('tools', 'agent')

  return { graph: graph.compile(), maxSteps }
}

/**
 * L4 task 2, migrated to LangGraph.js (L24 task 1): one model call, tool
 * dispatch, repeat — with the same three guards as before (a step ceiling,
 * repetition detection, per-call cost measured from the first line), now run
 * as a two-node `StateGraph` (`buildAgentGraph` above) instead of a `for`
 * loop. The public contract — `RunAgentLoopInput` in, `RunResult` out — is
 * unchanged, so every existing caller (`agents/orchestrator.ts`,
 * `subagents/run-subagent.ts`, `tools/core/agent-delegate.ts`,
 * `assist/runtime.ts`, `eval/run-suite.ts`) needed no change at all.
 * Permission checking (task 4, now `withAutonomy`) and budgets (task 8)
 * still wrap this from the outside; this module still only knows how to
 * hold a conversation with a model and the tools it was handed.
 */
export async function runAgentLoop(input: RunAgentLoopInput): Promise<RunResult> {
  const { graph, maxSteps } = buildAgentGraph(input)

  const initialState: GraphState = {
    messages: [...input.messages],
    steps: [],
    usage: ZERO_USAGE,
    finalText: null,
    stopReason: null,
    stepIndex: 0,
    pendingAssistant: null,
    pendingToolCalls: [],
    pendingUsage: null,
  }

  let finalState: GraphState
  try {
    // Generous relative to `maxSteps`: each loop iteration is at most two
    // graph super-steps (`agent`, then `tools`), and `agentNode`'s own
    // `stepIndex >= maxSteps` check always produces a `max_steps` stop
    // before this ceiling could ever bind. It exists as a backstop against a
    // future bug in that check, not as the mechanism `max_steps` relies on.
    finalState = await graph.invoke(initialState, { recursionLimit: maxSteps * 2 + 10 })
  } catch (error) {
    if (error instanceof GraphRecursionError) {
      throw new CogentaError({
        code: 'AGENT_LOOP_RECURSION_LIMIT',
        message: 'The graph recursion ceiling was hit before its own max_steps check fired.',
        hint: 'This indicates a bug in the agent graph, not a normal stop reason — please report it.',
      })
    }
    throw error
  }

  return {
    messages: finalState.messages,
    steps: finalState.steps,
    finalText: finalState.finalText,
    stopReason: finalState.stopReason ?? 'max_steps',
    usage: finalState.usage,
  }
}
