import { type JSX, useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  type AgentHistoryEntry,
  type AgentSummary,
  type AgentTrace,
  disableAgent,
  enableAgent,
  listAgentHistory,
  listAgents,
  listAgentTraces,
} from '../api/agents-client.js'
import { ApiError } from '../api/client.js'
import { useAuth } from '../auth/auth-context.js'

/** L5 task 9: état, autonomie, budget, historique, traces — read from `@cogenta/agents`' registry via `/api/agents`, admin only. */
export function AgentsRoute(): JSX.Element {
  const { t } = useTranslation()
  const auth = useAuth()
  const token = auth.state.status === 'authenticated' ? auth.state.token : null
  const roles = auth.state.status === 'authenticated' ? auth.state.user.roles : []
  const isAdmin = roles.includes('admin')

  const [agents, setAgents] = useState<readonly AgentSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [toggling, setToggling] = useState<string | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [traces, setTraces] = useState<readonly AgentTrace[]>([])
  const [history, setHistory] = useState<readonly AgentHistoryEntry[]>([])
  const [detailLoading, setDetailLoading] = useState(false)

  const load = useCallback(async () => {
    if (token === null || !isAdmin) return
    setLoading(true)
    setError(null)
    try {
      setAgents(await listAgents(token))
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : t('agents.loadError'))
    } finally {
      setLoading(false)
    }
  }, [token, isAdmin, t])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (token === null || selected === null) {
      setTraces([])
      setHistory([])
      return
    }
    setDetailLoading(true)
    void Promise.all([listAgentTraces(token, selected), listAgentHistory(token, selected)])
      .then(([foundTraces, foundHistory]) => {
        setTraces(foundTraces)
        setHistory(foundHistory)
      })
      .catch((caught: unknown) => {
        setError(caught instanceof ApiError ? caught.message : t('agents.loadError'))
      })
      .finally(() => setDetailLoading(false))
  }, [token, selected, t])

  async function toggle(agent: AgentSummary): Promise<void> {
    if (token === null) return
    setToggling(agent.name)
    try {
      if (agent.enabled) await disableAgent(token, agent.name)
      else await enableAgent(token, agent.name)
      await load()
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : t('agents.toggleError'))
    } finally {
      setToggling(null)
    }
  }

  if (!isAdmin) {
    return (
      <section aria-labelledby="agents-heading">
        <h1 id="agents-heading">{t('agents.heading')}</h1>
        <p role="alert">{t('agents.adminOnly')}</p>
      </section>
    )
  }

  return (
    <section aria-labelledby="agents-heading">
      <h1 id="agents-heading">{t('agents.heading')}</h1>

      {error !== null && <p role="alert">{error}</p>}
      {loading && <p>{t('common.loading')}</p>}

      {!loading && error === null && (
        <table>
          <thead>
            <tr>
              <th scope="col">{t('agents.name')}</th>
              <th scope="col">{t('agents.state')}</th>
              <th scope="col">{t('agents.autonomy')}</th>
              <th scope="col">{t('agents.budget')}</th>
              <th scope="col">{t('agents.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {agents.map((agent) => (
              <tr key={agent.name}>
                <td>
                  <button type="button" onClick={() => setSelected(agent.name)}>
                    {agent.name}
                  </button>
                </td>
                <td>{agent.enabled ? t('agents.enabled') : t('agents.disabled')}</td>
                <td>{agent.autonomy?.default ?? '—'}</td>
                <td>
                  {agent.budget?.tokensPerDay ?? '—'} / {agent.usage?.tokensToday ?? 0}
                </td>
                <td>
                  <button
                    type="button"
                    disabled={toggling === agent.name}
                    onClick={() => void toggle(agent)}
                  >
                    {agent.enabled ? t('agents.disable') : t('agents.enable')}
                  </button>
                </td>
              </tr>
            ))}
            {agents.length === 0 && (
              <tr>
                <td colSpan={5}>{t('agents.noAgents')}</td>
              </tr>
            )}
          </tbody>
        </table>
      )}

      {selected !== null && (
        <section aria-labelledby="agents-detail-heading">
          <h2 id="agents-detail-heading">{t('agents.detailHeading', { name: selected })}</h2>
          {detailLoading && <p>{t('common.loading')}</p>}

          {!detailLoading && (
            <>
              <h3>{t('agents.traces')}</h3>
              <ul>
                {traces.map((trace) => (
                  <li key={trace.id}>
                    {trace.startedAt} — {trace.stopReason}
                  </li>
                ))}
                {traces.length === 0 && <li>{t('agents.noTraces')}</li>}
              </ul>

              <h3>{t('agents.history')}</h3>
              <ul>
                {history.map((entry) => (
                  <li key={entry.id}>
                    {entry.at} — {entry.action}
                  </li>
                ))}
                {history.length === 0 && <li>{t('agents.noHistory')}</li>}
              </ul>
            </>
          )}
        </section>
      )}
    </section>
  )
}
