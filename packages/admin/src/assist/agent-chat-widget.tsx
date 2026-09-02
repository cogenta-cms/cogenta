import { type JSX, useEffect, useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { type AgentSummary, listAgents } from '../api/agents-client.js'
import { Button, Select } from '../ui/index.js'
import { AgentChatFeed } from './agent-chat-feed.js'
import { useAgentConversation } from './use-agent-conversation.js'

/**
 * L22 task 2 — a floating chat button, bottom-right on every authenticated
 * screen, that talks to an agent. Rebuilt (2026-09) on the same server-side
 * thread the agent detail page's own chat now reads and writes
 * (`useAgentConversation`) — the fix for a real reported bug: starting a
 * conversation here and reopening the widget after navigating away used to
 * lose it (a local `turns` array, folded into the next call's instruction
 * text client-side), and switching agent picked up nothing from the other
 * surface either, because the two never shared anything. Selecting an agent
 * in the dropdown below now loads that exact thread, wherever it was last
 * left off.
 *
 * Admin-only, matching `POST /api/agents/:name/conversation/messages`
 * itself (`agents-router.ts`'s `requireAdmin`) — a non-admin would see the
 * button and get nothing but a 403 on every message, so the widget does not
 * render for them at all, the same "disappears rather than fails loudly"
 * rule `/assistant` already follows for a site with no AI provider (R2's
 * spirit).
 */

export function AgentChatWidget({ token }: { readonly token: string }): JSX.Element {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [agents, setAgents] = useState<readonly AgentSummary[]>([])
  const [agentName, setAgentName] = useState('')
  const triggerId = useId()

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

  const conversation = useAgentConversation(
    open ? token : null,
    agentName,
    t('agentChat.sendError'),
  )

  return (
    <div className="fixed right-4 bottom-4 z-50 flex flex-col items-end gap-2">
      {open && (
        <div
          role="dialog"
          aria-label={t('agentChat.heading')}
          className="flex h-[28rem] w-80 flex-col gap-2 overflow-hidden rounded-lg border border-input bg-background p-2 shadow-lg"
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              setOpen(false)
              document.getElementById(triggerId)?.focus()
            }
          }}
        >
          <div className="flex items-center justify-between gap-2 border-b border-input pb-2">
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

          <AgentChatFeed conversation={conversation} dense disabled={agentName === ''} />
        </div>
      )}

      <Button
        id={triggerId}
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
