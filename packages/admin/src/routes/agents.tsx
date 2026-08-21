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
 * Contract C's taxonomy of tool permissions (`docs/04-contrats.md` §
 * "Contrat C — Outil agentique", `tools@1.1`), reproduced verbatim as a
 * fixed, ordered list — this is the same taxonomy `defineTool({ permissions
 * })` draws from, kept here by hand for the same structural reason
 * `agents-router.ts` stays untyped against `@cogenta/agents`: the admin
 * package must not gain a dependency on the tool-definition package just to
 * label a checklist. Adding a permission to the real taxonomy (a mineur
 * change, ADR-0020/0022's own rule) means adding its name here too.
 */
const CONTRACT_C_PERMISSIONS: readonly string[] = [
  'content.read',
  'content.write_draft',
  'content.publish',
  'content.delete',
  'media.read',
  'media.write',
  'schema.read',
  'site.config_read',
  'site.config_write',
  'deps.scan',
  'deps.patch',
  'build.trigger',
  'deploy.trigger',
  'http.fetch',
  'channel.send',
  'agent.delegate',
  'memory.read',
  'memory.write',
  'document.extract',
]

/**
 * L5 task 9 / L21 task 4: état, autonomie, budget, historique, traces — read
 * from `@cogenta/agents`' registry via `/api/agents`, admin only.
 *
 * **Fiche 30 task 1.** No `AgentRegistry` runs anywhere in this codebase —
 * enabling an agent here writes a stored configuration flag that nothing
 * reads back to actually run one. The table below is real (it reads and
 * writes that stored configuration, and the toggle really does persist), but
 * it configures a capability that does not exist yet. The banner says so in
 * plain language, every time this screen renders, so nobody can look at this
 * table and believe an agent is executing.
 *
 * **L21 task 4.** `AgentDeclaration` (contract C's `defineAgent`) models far
 * more than the enable toggle and the two read-only fields this screen used
 * to show: a full tool/permission list, per-tool autonomy overrides, all
 * three budget metrics (not just `tokensPerDay`), skills, subagents, a model
 * preference, a memory configuration, and triggers (including cron
 * schedules). All of it is now shown in the detail panel below — but as
 * **read-only** data, on purpose: nothing in `@cogenta/agents`' own
 * `AgentRegistry` can persist an edit to any of these fields today (only
 * `enable`/`disable` really mutate anything — see `registry.ts`), so an
 * editable control for them would have no real backend effect. Building one
 * anyway would be exactly the kind of inert control R6 forbids: a checkbox
 * that looks like it grants a permission but changes nothing. The two
 * fields a user might reasonably also want here — free-form
 * "responsibilities" or "systems" beyond the fixed contract C taxonomy —
 * have no backend model at all and are not fabricated; see the task's
 * closing report for why they are out of scope without a new data model.
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

  const selectedAgent = agents.find((agent) => agent.name === selected) ?? null

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
                <TableHeader>{t('agents.model')}</TableHeader>
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
                  <TableCell>{agent.model?.preferred ?? '—'}</TableCell>
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
              {agents.length === 0 && <TableEmpty colSpan={6}>{t('agents.noAgents')}</TableEmpty>}
            </TableBody>
          </Table>
        </TableRoot>
      )}

      {selectedAgent !== null && (
        <Card aria-labelledby="agents-detail-heading">
          <CardHeader>
            <CardTitle>
              <h2 id="agents-detail-heading">
                {t('agents.detailHeading', { name: selectedAgent.name })}
              </h2>
            </CardTitle>
          </CardHeader>
          <CardBody>
            <Notice tone="info" live="off">
              <p className="m-0 text-sm">{t('agents.configReadOnlyNotice')}</p>
            </Notice>

            {detailLoading && <p>{t('common.loading')}</p>}

            {!detailLoading && (
              <div className="mt-4 flex flex-col gap-6">
                <div>
                  <h3 className="m-0 mb-2 text-sm leading-5 font-semibold">{t('agents.model')}</h3>
                  {selectedAgent.model === undefined ? (
                    <p className="m-0 text-sm">{t('agents.modelNone')}</p>
                  ) : (
                    <p className="m-0 text-sm">
                      {t('agents.modelPreferred', { model: selectedAgent.model.preferred })}
                      {selectedAgent.model.fallback !== undefined &&
                        ` — ${t('agents.modelFallback', { model: selectedAgent.model.fallback })}`}
                    </p>
                  )}
                </div>

                <div>
                  <h3 className="m-0 mb-2 text-sm leading-5 font-semibold">
                    {t('agents.autonomy')}
                  </h3>
                  <p className="m-0 text-sm">
                    {t('agents.autonomyDefault', {
                      level: selectedAgent.autonomy?.default ?? '—',
                    })}
                  </p>
                  {selectedAgent.autonomy?.overrides !== undefined &&
                    Object.keys(selectedAgent.autonomy.overrides).length > 0 && (
                      <TableRoot label={t('agents.autonomyOverrides')} className="mt-2">
                        <Table>
                          <TableHead>
                            <TableRow>
                              <TableHeader>{t('agents.tool')}</TableHeader>
                              <TableHeader>{t('agents.level')}</TableHeader>
                            </TableRow>
                          </TableHead>
                          <TableBody>
                            {Object.entries(selectedAgent.autonomy.overrides).map(
                              ([tool, level]) => (
                                <TableRow key={tool}>
                                  <TableCell>{tool}</TableCell>
                                  <TableCell>{level}</TableCell>
                                </TableRow>
                              ),
                            )}
                          </TableBody>
                        </Table>
                      </TableRoot>
                    )}
                </div>

                <div>
                  <h3 className="m-0 mb-2 text-sm leading-5 font-semibold">
                    {t('agents.budgetDetail')}
                  </h3>
                  <TableRoot label={t('agents.budgetDetail')}>
                    <Table>
                      <TableHead>
                        <TableRow>
                          <TableHeader>{t('agents.budgetMetric')}</TableHeader>
                          <TableHeader>{t('agents.budgetLimit')}</TableHeader>
                          <TableHeader>{t('agents.budgetUsage')}</TableHeader>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        <TableRow>
                          <TableCell>{t('agents.budgetMetricTokensPerDay')}</TableCell>
                          <TableCell>
                            {selectedAgent.budget?.tokensPerDay ?? t('agents.budgetNoLimit')}
                          </TableCell>
                          <TableCell>{selectedAgent.usage?.tokensToday ?? 0}</TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell>{t('agents.budgetMetricEurPerMonth')}</TableCell>
                          <TableCell>
                            {selectedAgent.budget?.eurPerMonth ?? t('agents.budgetNoLimit')}
                          </TableCell>
                          <TableCell>{selectedAgent.usage?.eurThisMonth ?? 0}</TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell>{t('agents.budgetMetricCallsPerHour')}</TableCell>
                          <TableCell>
                            {selectedAgent.budget?.callsPerHour ?? t('agents.budgetNoLimit')}
                          </TableCell>
                          <TableCell>{selectedAgent.usage?.callsThisHour ?? 0}</TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  </TableRoot>
                </div>

                <div>
                  <h3 className="m-0 mb-2 text-sm leading-5 font-semibold">
                    {t('agents.permissions')}
                  </h3>
                  <p className="m-0 mb-2 text-xs opacity-80">{t('agents.permissionsHint')}</p>
                  <ul className="m-0 grid list-none grid-cols-2 gap-1 p-0 text-sm sm:grid-cols-3">
                    {CONTRACT_C_PERMISSIONS.map((permission) => {
                      const granted = selectedAgent.tools.includes(permission)
                      const inputId = `agent-permission-${selectedAgent.name}-${permission}`
                      return (
                        <li key={permission} className="flex items-center gap-2">
                          <input
                            id={inputId}
                            type="checkbox"
                            checked={granted}
                            disabled
                            readOnly
                            aria-readonly="true"
                          />
                          <label htmlFor={inputId}>{permission}</label>
                        </li>
                      )
                    })}
                  </ul>
                </div>

                <div>
                  <h3 className="m-0 mb-2 text-sm leading-5 font-semibold">{t('agents.skills')}</h3>
                  <ul className="m-0 flex list-none flex-col gap-1 p-0 text-sm">
                    {(selectedAgent.skills ?? []).map((skill) => (
                      <li key={skill}>{skill}</li>
                    ))}
                    {(selectedAgent.skills === undefined || selectedAgent.skills.length === 0) && (
                      <li>{t('agents.noSkills')}</li>
                    )}
                  </ul>
                </div>

                <div>
                  <h3 className="m-0 mb-2 text-sm leading-5 font-semibold">
                    {t('agents.subagents')}
                  </h3>
                  <ul className="m-0 flex list-none flex-col gap-1 p-0 text-sm">
                    {(selectedAgent.subagents ?? []).map((subagent) => (
                      <li key={subagent}>{subagent}</li>
                    ))}
                    {(selectedAgent.subagents === undefined ||
                      selectedAgent.subagents.length === 0) && <li>{t('agents.noSubagents')}</li>}
                  </ul>
                </div>

                <div>
                  <h3 className="m-0 mb-2 text-sm leading-5 font-semibold">{t('agents.memory')}</h3>
                  {selectedAgent.memory === undefined ? (
                    <p className="m-0 text-sm">{t('agents.memoryNone')}</p>
                  ) : (
                    <ul className="m-0 flex list-none flex-col gap-1 p-0 text-sm">
                      <li>
                        {t('agents.memoryEpisodic')}:{' '}
                        {selectedAgent.memory.episodic === true ? t('common.yes') : t('common.no')}
                      </li>
                      <li>
                        {t('agents.memorySemantic')}:{' '}
                        {selectedAgent.memory.semantic === true ? t('common.yes') : t('common.no')}
                      </li>
                      <li>
                        {t('agents.memoryProcedural')}:{' '}
                        {selectedAgent.memory.procedural === true
                          ? t('common.yes')
                          : t('common.no')}
                      </li>
                      <li>
                        {t('agents.memoryScope')}: {selectedAgent.memory.scope ?? '—'}
                      </li>
                    </ul>
                  )}
                </div>

                <div>
                  <h3 className="m-0 mb-2 text-sm leading-5 font-semibold">
                    {t('agents.triggers')}
                  </h3>
                  <ul className="m-0 flex list-none flex-col gap-1 p-0 text-sm">
                    {(selectedAgent.triggers ?? []).map((trigger, index) => (
                      <li key={index}>
                        {trigger.cron !== undefined
                          ? t('agents.triggerSchedule', { on: trigger.on, cron: trigger.cron })
                          : t('agents.triggerEvent', { on: trigger.on })}
                      </li>
                    ))}
                    {(selectedAgent.triggers === undefined ||
                      selectedAgent.triggers.length === 0) && <li>{t('agents.noTriggers')}</li>}
                  </ul>
                </div>

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
