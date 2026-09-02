import { useCallback, useEffect, useState } from 'react'
import {
  type AgentConversationTurn,
  type AgentRunSummary,
  clearAgentConversation,
  getAgentConversation,
  sendAgentMessage,
} from '../api/agents-client.js'
import { ApiError } from '../api/client.js'

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
      try {
        const result = await sendAgentMessage(token, agentName, message.trim())
        setTurns(result.turns)
        return result.run
      } catch (caught) {
        setError(caught instanceof ApiError ? caught.message : errorFallback)
        return null
      } finally {
        setSending(false)
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

  return { turns, loading, sending, error, send, clear, dismissError: () => setError(null) }
}
