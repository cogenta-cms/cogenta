import { type FormEvent, type JSX, type KeyboardEvent, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { AgentConversationTurn } from '../api/agents-client.js'
import { Badge, Button, Notice } from '../ui/index.js'
import type { UseAgentConversation } from './use-agent-conversation.js'

/**
 * The one chat feed both the agent detail page and the floating widget
 * render — same message list, same "outils utilisés" per-turn disclosure,
 * same composer. `dense` trims padding/type size for the widget's narrow
 * popover; the detail page uses the roomier default. Presentational only:
 * all state lives in `useAgentConversation`, passed in as `conversation`.
 */
export interface AgentChatFeedProps {
  readonly conversation: UseAgentConversation
  readonly dense?: boolean
  readonly disabled?: boolean
  readonly disabledHint?: string
}

export function AgentChatFeed({
  conversation,
  dense = false,
  disabled = false,
  disabledHint,
}: AgentChatFeedProps): JSX.Element {
  const { t } = useTranslation()
  const { turns, loading, sending, error, send, clear, dismissError } = conversation
  const [draft, setDraft] = useState('')
  const logRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (logRef.current !== null) logRef.current.scrollTop = logRef.current.scrollHeight
  }, [])

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault()
    const message = draft.trim()
    if (message === '' || sending || disabled) return
    setDraft('')
    await send(message)
    // jsdom does not implement `Element.scrollTo` at all (unlike
    // `scrollIntoView`, which it stubs) — optional-chain the method itself,
    // not just the element, or every send throws in tests.
    logRef.current?.scrollTo?.({ top: logRef.current.scrollHeight, behavior: 'smooth' })
  }

  function onComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      void submit(event)
    }
  }

  return (
    <div className="flex flex-1 flex-col gap-2 overflow-hidden">
      <div className="flex items-center justify-end">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={turns.length === 0 || sending}
          onClick={() => void clear()}
        >
          {t('agentChat.newConversation')}
        </Button>
      </div>

      <div
        ref={logRef}
        className={
          dense ? 'flex-1 space-y-2 overflow-y-auto text-sm' : 'flex-1 space-y-3 overflow-y-auto'
        }
      >
        {loading && <p className="m-0 text-sm text-muted-foreground">{t('common.loading')}</p>}
        {!loading && turns.length === 0 && (
          <p className="m-0 text-sm text-muted-foreground">{t('agentChat.empty')}</p>
        )}
        {turns.map((turn, index) => (
          <ChatBubble key={`${turn.createdAt}-${index}`} turn={turn} dense={dense} />
        ))}
        {sending && <p className="m-0 text-sm text-muted-foreground">{t('agentChat.thinking')}</p>}
      </div>

      {error !== null && (
        <Notice
          tone="danger"
          live="assertive"
          onDismiss={dismissError}
          dismissLabel={t('agentChat.close')}
        >
          <p className="m-0">{error}</p>
        </Notice>
      )}

      {disabled && disabledHint !== undefined && (
        <p className="m-0 text-xs text-muted-foreground">{disabledHint}</p>
      )}

      <form onSubmit={(event) => void submit(event)} className="flex gap-2">
        <textarea
          aria-label={t('agentChat.inputLabel')}
          className={
            dense
              ? 'h-16 flex-1 resize-none rounded-md border border-input bg-card p-2 text-sm shadow-card'
              : 'h-20 flex-1 resize-none rounded-md border border-input bg-card p-3 text-sm shadow-card'
          }
          value={draft}
          disabled={sending || disabled}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={onComposerKeyDown}
        />
        <Button type="submit" size="sm" disabled={sending || disabled || draft.trim() === ''}>
          {t('agentChat.send')}
        </Button>
      </form>
    </div>
  )
}

function ChatBubble({
  turn,
  dense,
}: {
  readonly turn: AgentConversationTurn
  readonly dense: boolean
}): JSX.Element {
  const { t } = useTranslation()
  const isUser = turn.role === 'user'
  return (
    <div className={isUser ? 'flex justify-end' : 'flex justify-start'}>
      <div
        className={
          isUser
            ? `max-w-[85%] rounded-lg bg-primary px-3 ${dense ? 'py-1.5 text-sm' : 'py-2'} text-primary-foreground shadow-card`
            : `max-w-[85%] rounded-lg bg-secondary px-3 ${dense ? 'py-1.5 text-sm' : 'py-2'} text-secondary-foreground shadow-card`
        }
      >
        <p className="m-0 whitespace-pre-wrap">{turn.content}</p>
        {turn.toolCalls !== undefined && turn.toolCalls.length > 0 && (
          <details className="mt-1.5">
            <summary className="cursor-pointer text-xs opacity-80">
              {t('agentChat.toolsUsed', { count: turn.toolCalls.length })}
            </summary>
            <ul className="m-0 mt-1 flex list-none flex-col gap-1 p-0">
              {turn.toolCalls.map((call, index) => (
                <li key={`${call.name}-${index}`}>
                  <Badge tone="neutral" className="font-mono text-[0.7rem]">
                    {call.name}
                  </Badge>
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
    </div>
  )
}
