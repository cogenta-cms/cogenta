import { type JSX, useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
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
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  Notice,
  Table,
  TableBody,
  TableCell,
  TableEmpty,
  TableHead,
  TableHeader,
  TableRoot,
  TableRow,
} from '../ui/index.js'

/**
 * L5 task 9: état, autonomie, budget, historique, traces — read from `@cogenta/agents`' registry via `/api/agents`, admin only.
 *
 * **Fiche 30 task 1.** No `AgentRegistry` runs anywhere in this codebase —
 * enabling an agent here writes a stored configuration flag that nothing
 * reads back to actually run one. The table below is real (it reads and
 * writes that stored configuration, and the toggle really does persist), but
 * it configures a capability that does not exist yet. The banner says so in
 * plain language, every time this screen renders, so nobody can look at this
 * table and believe an agent is executing.
 */
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
      // `CONTENT_NOT_FOUND` here means exactly what the banner above already
      // says in plain language: no `AgentRegistry` is constructed on this
      // site, so `/api/agents` is never mounted (`packages/cli/src/commands/
      // serve.ts`'s `site.agentsRouter`) and the request falls through to the
      // generic "no route matches this path" 404. That is expected and
      // already explained — showing its raw wire text as a second, separate
      // error would just contradict the honest banner with a scary one, so
      // this one specific case degrades to the same empty state as a site
      // with no agents configured at all, rather than surfacing an error.
      if (caught instanceof ApiError && caught.code === 'CONTENT_NOT_FOUND') {
        setAgents([])
      } else {
        setError(caught instanceof ApiError ? caught.message : t('agents.loadError'))
      }
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
    <section aria-labelledby="agents-heading" className="flex flex-col gap-6">
      <h1 id="agents-heading" className="m-0 text-xl leading-7 font-semibold">
        {t('agents.heading')}
      </h1>

      <Notice tone="warning" live="off" title={t('agents.runtimeNoticeTitle')}>
        <p className="m-0">{t('agents.runtimeNoticeBody')}</p>
        <p className="m-0 mt-2">
          <Link to="/assistant">{t('agents.runtimeNoticeAssistantLink')}</Link>
          {' — '}
          {t('agents.runtimeNoticeDocs')}
        </p>
      </Notice>

      {error !== null && (
        <Notice tone="danger" live="assertive">
          <p>{error}</p>
        </Notice>
      )}
      {loading && <p>{t('common.loading')}</p>}

      {!loading && error === null && (
        <TableRoot label={t('agents.heading')}>
          <Table>
            <TableHead>
              <TableRow>
                <TableHeader>{t('agents.name')}</TableHeader>
                <TableHeader>{t('agents.state')}</TableHeader>
                <TableHeader>{t('agents.autonomy')}</TableHeader>
                <TableHeader>{t('agents.budget')}</TableHeader>
                <TableHeader>{t('agents.actions')}</TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {agents.map((agent) => (
                <TableRow key={agent.name}>
                  <TableCell>
                    <Button variant="ghost" size="sm" onClick={() => setSelected(agent.name)}>
                      {agent.name}
                    </Button>
                  </TableCell>
                  <TableCell>
                    {agent.enabled ? t('agents.enabled') : t('agents.disabled')}
                  </TableCell>
                  <TableCell>{agent.autonomy?.default ?? '—'}</TableCell>
                  <TableCell>
                    {agent.budget?.tokensPerDay ?? '—'} / {agent.usage?.tokensToday ?? 0}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant={agent.enabled ? 'destructive' : 'secondary'}
                      size="sm"
                      disabled={toggling === agent.name}
                      onClick={() => void toggle(agent)}
                    >
                      {agent.enabled ? t('agents.disable') : t('agents.enable')}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {agents.length === 0 && <TableEmpty colSpan={5}>{t('agents.noAgents')}</TableEmpty>}
            </TableBody>
          </Table>
        </TableRoot>
      )}

      {selected !== null && (
        <Card aria-labelledby="agents-detail-heading">
          <CardHeader>
            <CardTitle>
              <h2 id="agents-detail-heading">{t('agents.detailHeading', { name: selected })}</h2>
            </CardTitle>
          </CardHeader>
          <CardBody>
            {detailLoading && <p>{t('common.loading')}</p>}

            {!detailLoading && (
              <div className="flex flex-col gap-4">
                <div>
                  <h3 className="m-0 mb-2 text-sm leading-5 font-semibold">{t('agents.traces')}</h3>
                  <ul className="m-0 flex list-none flex-col gap-1 p-0 text-sm">
                    {traces.map((trace) => (
                      <li key={trace.id}>
                        {trace.startedAt} — {trace.stopReason}
                      </li>
                    ))}
                    {traces.length === 0 && <li>{t('agents.noTraces')}</li>}
                  </ul>
                </div>

                <div>
                  <h3 className="m-0 mb-2 text-sm leading-5 font-semibold">
                    {t('agents.history')}
                  </h3>
                  <ul className="m-0 flex list-none flex-col gap-1 p-0 text-sm">
                    {history.map((entry) => (
                      <li key={entry.id}>
                        {entry.at} — {entry.action}
                      </li>
                    ))}
                    {history.length === 0 && <li>{t('agents.noHistory')}</li>}
                  </ul>
                </div>
              </div>
            )}
          </CardBody>
        </Card>
      )}
    </section>
  )
}
