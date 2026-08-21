import { type FormEvent, type JSX, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { type AgentSummary, listAgents, runAgent } from '../api/agents-client.js'
import { ApiError } from '../api/client.js'
import { Button, Select } from '../ui/index.js'

/**
 * L22 task 2 — a floating chat button, bottom-right on every authenticated
 * screen, that talks to an agent. Reuses the exact single-call
 * request/response flow `assist-client.ts`'s `runAssistTool`/`POST
 * /api/assistant/run` already established for the writing-tools panel — no
 * second streaming protocol, this widget calls the equally simple `POST
 * /api/agents/:name/run` (`runAgent`, already exported from
 * `agents-client.ts` for the "Agents" screen's own "Run now" button) with
 * one HTTP request per turn. Multi-turn is entirely client-side: the running
 * transcript is folded into the next call's `instruction`, the same way a
 * human operator would just keep typing more context — the server has no
 * notion of a "conversation" beyond one instruction string.
 *
 * Admin-only, matching `POST /api/agents/:name/run` itself
 * (`agents-router.ts`'s `requireAdmin`) — a non-admin would see the button
 * and get nothing but a 403 on every message, so the widget does not render
 * for them at all, the same "disappears rather than fails loudly" rule
 * `/assistant` already follows for a site with no AI provider (R2's spirit).
 */

interface ChatTurn {
  readonly role: 'user' | 'assistant'
  readonly text: string
}

function buildInstruction(history: readonly ChatTurn[], nextMessage: string): string {
  if (history.length === 0) return nextMessage
  const transcript = history
    .map((turn) => `${turn.role === 'user' ? 'User' : 'Assistant'}: ${turn.text}`)
    .join('\n')
  return `Continue this conversation. Reply only with your next message, nothing else.\n\n${transcript}\nUser: ${nextMessage}`
}

export function AgentChatWidget({ token }: { readonly token: string }): JSX.Element {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [agents, setAgents] = useState<readonly AgentSummary[]>([])
  const [agentName, setAgentName] = useState('')
  const [turns, setTurns] = useState<readonly ChatTurn[]>([])
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const logRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancelled = false
    listAgents(token)
      .then((list) => {
        if (cancelled) return
        setAgents(list)
        setAgentName((current) => {
          if (current !== '') return current
          const preferred = list.find((agent) => agent.builtin === true) ?? list[0]
          return preferred?.name ?? ''
        })
      })
      .catch(() => undefined) // The button just opens to an empty picker — never a hard failure elsewhere in the admin.
    return () => {
      cancelled = true
    }
  }, [token])

  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  useEffect(() => {
    if (logRef.current !== null) logRef.current.scrollTop = logRef.current.scrollHeight
  }, [])

  async function send(event: FormEvent): Promise<void> {
    event.preventDefault()
    const message = draft.trim()
    if (message === '' || agentName === '' || sending) return
    setError(null)
    setSending(true)
    const instruction = buildInstruction(turns, message)
    setTurns((previous) => [...previous, { role: 'user', text: message }])
    setDraft('')
    try {
      const result = await runAgent(token, agentName, instruction)
      setTurns((previous) => [
        ...previous,
        { role: 'assistant', text: result.finalText ?? t('agentChat.noReply') },
      ])
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : t('agentChat.sendError'))
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="fixed right-4 bottom-4 z-50 flex flex-col items-end gap-2">
      {open && (
        <div
          role="dialog"
          aria-label={t('agentChat.heading')}
          className="flex h-[28rem] w-80 flex-col overflow-hidden rounded-lg border border-input bg-background shadow-lg"
          onKeyDown={(event) => {
            if (event.key === 'Escape') setOpen(false)
          }}
        >
          <div className="flex items-center justify-between gap-2 border-b border-input p-2">
            <Select
              aria-label={t('agentChat.agentLabel')}
              value={agentName}
              onChange={(event) => setAgentName(event.target.value)}
              className="text-sm"
            >
              {agents.length === 0 && <option value="">{t('agentChat.noAgents')}</option>}
              {agents.map((agent) => (
                <option key={agent.name} value={agent.name}>
                  {agent.name}
                </option>
              ))}
            </Select>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              aria-label={t('agentChat.close')}
              onClick={() => setOpen(false)}
            >
              ✕
            </Button>
          </div>

          <div ref={logRef} className="flex-1 space-y-2 overflow-y-auto p-2 text-sm">
            {turns.length === 0 && <p className="text-muted-foreground">{t('agentChat.empty')}</p>}
            {turns.map((turn, index) => (
              <p
                key={index}
                className={
                  turn.role === 'user'
                    ? 'ml-auto max-w-[85%] rounded-md bg-primary px-2 py-1 text-primary-foreground'
                    : 'mr-auto max-w-[85%] rounded-md bg-secondary px-2 py-1'
                }
              >
                {turn.text}
              </p>
            ))}
            {sending && <p className="text-muted-foreground">{t('agentChat.thinking')}</p>}
          </div>

          {error !== null && (
            <p role="alert" className="border-t border-input p-2 text-sm text-destructive">
              {error}
            </p>
          )}

          <form
            onSubmit={(event) => void send(event)}
            className="flex gap-2 border-t border-input p-2"
          >
            <textarea
              ref={inputRef}
              aria-label={t('agentChat.inputLabel')}
              className="h-16 flex-1 resize-none rounded-md border border-input bg-background p-2 text-sm"
              value={draft}
              disabled={sending || agentName === ''}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault()
                  void send(event)
                }
              }}
            />
            <Button
              type="submit"
              size="sm"
              disabled={sending || draft.trim() === '' || agentName === ''}
            >
              {t('agentChat.send')}
            </Button>
          </form>
        </div>
      )}

      <Button
        type="button"
        aria-label={t(open ? 'agentChat.close' : 'agentChat.open')}
        aria-expanded={open}
        className="size-12 rounded-full p-0 text-xl shadow-lg"
        onClick={() => setOpen((current) => !current)}
      >
        {open ? '✕' : '💬'}
      </Button>
    </div>
  )
}
