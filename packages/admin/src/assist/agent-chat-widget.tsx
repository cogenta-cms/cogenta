import { type JSX, useEffect, useId, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { type AgentSummary, listAgents } from '../api/agents-client.js'
import { CloseIcon } from '../ui/icons.js'
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

/** The superagent every site is seeded with — the one a fresh chat should talk to. */
const SUPERAGENT_NAME = 'Cogenta Agent'
const CHAT_AGENT_STORAGE_KEY = 'cogenta.admin.chatAgent'

/**
 * The agent a chat opens on: the one the person last chose (if it still runs),
 * else the superagent, else the first built-in agent that is switched on, else
 * the first agent that is. A disabled agent is never a candidate — it refuses
 * every message, so offering it made the first message of a fresh chat fail.
 */
export function pickDefaultAgent(
  agents: readonly AgentSummary[],
  remembered: string | null,
): string {
  const active = agents.filter((agent) => agent.enabled)
  const pick =
    active.find((agent) => agent.name === remembered) ??
    active.find((agent) => agent.name === SUPERAGENT_NAME) ??
    active.find((agent) => agent.builtin === true) ??
    active[0]
  return pick?.name ?? ''
}

function readRememberedAgent(): string | null {
  try {
    return localStorage.getItem(CHAT_AGENT_STORAGE_KEY)
  } catch {
    return null
  }
}

export function AgentChatWidget({ token }: { readonly token: string }): JSX.Element {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [large, setLarge] = useState(false)
  const [agents, setAgents] = useState<readonly AgentSummary[]>([])
  const [agentName, setAgentName] = useState('')
  const triggerId = useId()
  const activeAgents = useMemo(() => agents.filter((agent) => agent.enabled), [agents])

  useEffect(() => {
    let cancelled = false
    listAgents(token)
      .then((list) => {
        if (cancelled) return
        setAgents(list)
        setAgentName((current) =>
          current !== '' ? current : pickDefaultAgent(list, readRememberedAgent()),
        )
      })
      .catch(() => undefined) // The button just opens to an empty picker — never a hard failure elsewhere in the admin.
    return () => {
      cancelled = true
    }
  }, [token])

  function chooseAgent(name: string): void {
    setAgentName(name)
    try {
      localStorage.setItem(CHAT_AGENT_STORAGE_KEY, name)
    } catch {
      // Private mode: the choice just is not remembered.
    }
  }

  const conversation = useAgentConversation(
    open ? token : null,
    agentName,
    t('agentChat.sendError'),
  )

  return (
    // Under the dialogs' veil (z-40) and the mobile drawer, above the page.
    <div className="fixed right-4 bottom-4 z-30 flex flex-col items-end gap-2">
      {open && (
        <div
          role="dialog"
          aria-label={t('agentChat.heading')}
          className={`flex flex-col gap-2 overflow-hidden rounded-lg border border-input bg-background p-2 shadow-lg ${
            large
              ? 'h-[min(42rem,calc(100dvh-7rem))] w-[min(34rem,calc(100vw-2rem))]'
              : 'h-[min(28rem,calc(100dvh-7rem))] w-[min(20rem,calc(100vw-2rem))]'
          }`}
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
              onChange={(event) => chooseAgent(event.target.value)}
              className="min-w-0 flex-1 text-sm"
            >
              {activeAgents.length === 0 && <option value="">{t('agentChat.noAgents')}</option>}
              {activeAgents.map((agent) => (
                <option key={agent.name} value={agent.name}>
                  {agent.name}
                </option>
              ))}
            </Select>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              aria-pressed={large}
              aria-label={t(large ? 'agentChat.shrink' : 'agentChat.enlarge')}
              title={t(large ? 'agentChat.shrink' : 'agentChat.enlarge')}
              onClick={() => setLarge((current) => !current)}
            >
              {large ? '⤡' : '⤢'}
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              aria-label={t('agentChat.close')}
              onClick={() => setOpen(false)}
            >
              <CloseIcon className="size-3.5" />
            </Button>
          </div>

          <AgentChatFeed
            conversation={conversation}
            dense
            disabled={agentName === ''}
            disabledHint={t('agentChat.noActiveAgent')}
          />
          {agentName !== '' && (
            <Link
              to={`/agents/${encodeURIComponent(agentName)}`}
              onClick={() => setOpen(false)}
              className="self-start text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
            >
              {t('agentChat.openFull')}
            </Link>
          )}
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
        {open ? <CloseIcon className="size-5" /> : '💬'}
      </Button>
    </div>
  )
}
