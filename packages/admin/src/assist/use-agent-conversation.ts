import { useCallback, useEffect, useState } from 'react'
import {
  type AgentConversationTurn,
  type AgentRunSummary,
  clearAgentConversation,
  getAgentConversation,
  getAgentMessageJob,
  startAgentMessageJob,
} from '../api/agents-client.js'
import { ApiError } from '../api/client.js'

/** How often the conversation job is polled while a turn is in flight — frequent enough to feel live, far below anything that would look like hammering the server. */
const JOB_POLL_INTERVAL_MS = 500

/**
 * The one place that reads and writes an actor's standing thread with an
 * agent — shared by the agent detail page's own chat and the floating
 * widget (`agent-chat-widget.tsx`). Before this, each surface kept its own
 * local `turns` state (the widget folded a growing transcript into the next
 * instruction's text; the detail page had no multi-turn memory at all),
 * which is exactly why starting a conversation on one and opening the other
 * never "loaded" it — there was nothing shared to load. Both now call this
 * hook against the same `(agentName, actor)` thread the server keeps
 * (`POST /api/agents/:name/conversation/messages`).
 */
export interface UseAgentConversation {
  readonly turns: readonly AgentConversationTurn[]
  readonly loading: boolean
  readonly sending: boolean
  /**
   * Fiche feedback — "je ne sais pas si le traitement est en cours ou pas".
   * The growing log of what the agent is doing right now (thinking, calling
   * a tool, retrying) while `sending` is `true` — `[]` the rest of the time.
   */
  readonly progress: readonly string[]
  readonly error: string | null
  send(message: string): Promise<AgentRunSummary | null>
  clear(): Promise<void>
  dismissError(): void
}

export function useAgentConversation(
  token: string | null,
  agentName: string,
  errorFallback: string,
): UseAgentConversation {
  const [turns, setTurns] = useState<readonly AgentConversationTurn[]>([])
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [progress, setProgress] = useState<readonly string[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (token === null || agentName === '') {
      setTurns([])
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    getAgentConversation(token, agentName)
      .then((loaded) => {
        if (!cancelled) setTurns(loaded)
      })
      .catch((caught: unknown) => {
        if (!cancelled) setError(caught instanceof ApiError ? caught.message : errorFallback)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [token, agentName, errorFallback])

  const send = useCallback(
    async (message: string): Promise<AgentRunSummary | null> => {
      if (token === null || agentName === '' || message.trim() === '') return null
      setSending(true)
      setError(null)
      setProgress([])
      try {
        const { jobId } = await startAgentMessageJob(token, agentName, message.trim())
        for (;;) {
          const job = await getAgentMessageJob(token, agentName, jobId)
          setProgress(job.events.map((event) => event.message))
          if (job.status === 'running') {
            await new Promise((resolve) => setTimeout(resolve, JOB_POLL_INTERVAL_MS))
            continue
          }
          if (job.status === 'failed') {
            setError(job.error?.message ?? errorFallback)
            return null
          }
          if (job.result === undefined) return null
          setTurns(job.result.turns)
          return job.result.run
        }
      } catch (caught) {
        setError(caught instanceof ApiError ? caught.message : errorFallback)
        return null
      } finally {
        setSending(false)
        setProgress([])
      }
    },
    [token, agentName, errorFallback],
  )

  const clear = useCallback(async (): Promise<void> => {
    if (token === null || agentName === '') return
    setError(null)
    try {
      await clearAgentConversation(token, agentName)
      setTurns([])
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : errorFallback)
    }
  }, [token, agentName, errorFallback])

  return {
    turns,
    loading,
    sending,
    progress,
    error,
    send,
    clear,
    dismissError: () => setError(null),
  }
}
