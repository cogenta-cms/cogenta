import { type JSX, useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { type AgentSkillSummary, listAgentSkills } from '../api/agent-skills-client.js'
import {
  type AgentHistoryEntry,
  type AgentRunSummary,
  type AgentSummary,
  type AgentTrace,
  createAgent,
  disableAgent,
  enableAgent,
  getAgentIdentity,
  listAgentHistory,
  listAgents,
  listAgentTraces,
  removeAgent,
  runAgent,
  updateAgent,
} from '../api/agents-client.js'
import { ApiError } from '../api/client.js'
import { useAuth } from '../auth/auth-context.js'
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  Field,
  Input,
  Notice,
  Select,
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
 * "Contrat C — Outil agentique", `tools@1.2`), reproduced verbatim as a
 * fixed, ordered list — the admin package must not gain a dependency on
 * `@cogenta/agents` just to label a checklist. Adding a permission to the
 * real taxonomy (a mineur change) means adding its name here too.
 *
 * `content.collections`/`content.list` both carry `content.read`'s own
 * permission (browsing is the same access as reading one entry, not a
 * wider grant — see `@cogenta/agents`' `content-browse.ts`), so they are
 * listed under their own tool names, not a new taxonomy entry.
 * `logs.read_not_found` and `redirects.create` do add two genuinely new
 * entries, `logs.read` and `redirects.write` (L22 task 3, `tools@1.2`).
 */
const CONTRACT_C_PERMISSIONS: readonly string[] = [
  'content.read',
  'content.write_draft',
  'content.publish',
  'content.delete',
  'content.collections',
  'content.list',
  'media.read',
  'media.write',
  'schema.read',
  'site.config_read',
  'deps.scan',
  'document.extract_text',
  'http.fetch',
  'logs.read_not_found',
  'redirects.create',
]

/**
 * The three autonomy levels the admin offers (L22 task 1 item 4) — mapped
 * onto contract C's four frozen `AutonomyLevel` strings the exact same way
 * `@cogenta/agents`' `autonomy/levels.ts` does, hand-copied here for the
 * same structural reason `CONTRACT_C_PERMISSIONS` is: this package stays
 * undependent on the runtime package. `execute_with_approval` has no UI
 * level of its own and is never produced by this screen; it still displays
 * (as "co-pilot") if a hand-written agent used it.
 */
const AUTONOMY_UI_LEVELS = ['report-only', 'co-pilot', 'autopilot'] as const
type AutonomyUiLevel = (typeof AUTONOMY_UI_LEVELS)[number]
const UI_TO_LEVEL: Record<AutonomyUiLevel, string> = {
  'report-only': 'observe',
  'co-pilot': 'propose',
  autopilot: 'autonomous',
}
const LEVEL_TO_UI: Record<string, AutonomyUiLevel> = {
  observe: 'report-only',
  propose: 'co-pilot',
  execute_with_approval: 'co-pilot',
  autonomous: 'autopilot',
}

interface EditState {
  readonly role: string
  readonly objectives: string
  readonly style: string
  readonly modelPreferred: string
  readonly modelFallback: string
  readonly tools: readonly string[]
  readonly skills: readonly string[]
  readonly subagents: readonly string[]
  readonly autonomyUi: AutonomyUiLevel
  readonly tokensPerDay: string
  readonly callsPerHour: string
}

function emptyEdit(): EditState {
  return {
    role: '',
    objectives: '',
    style: '',
    modelPreferred: 'anthropic',
    modelFallback: '',
    tools: [],
    skills: [],
    subagents: [],
    autonomyUi: 'co-pilot',
    tokensPerDay: '',
    callsPerHour: '',
  }
}

function toggleIn(list: readonly string[], value: string): readonly string[] {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value]
}

/**
 * L22 task 1: the real, persistent `AgentRegistry` — superagent + two
 * example built-ins, seeded on first boot, genuinely editable and runnable
 * from this screen. Replaces the pre-L22 read-only wrapper: `@cogenta/api`'s
 * `agents-router.ts` now backs `create`/`update`/`remove`/`run` with a real
 * file store and a real execution loop (`@cogenta/agents`' `AgentRunner`).
 */
export function AgentsRoute(): JSX.Element {
  const { t } = useTranslation()
  const auth = useAuth()
  const token = auth.state.status === 'authenticated' ? auth.state.token : null
  const roles = auth.state.status === 'authenticated' ? auth.state.user.roles : []
  const isAdmin = roles.includes('admin')

  const [agents, setAgents] = useState<readonly AgentSummary[]>([])
  const [skillOptions, setSkillOptions] = useState<readonly AgentSkillSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [toggling, setToggling] = useState<string | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [traces, setTraces] = useState<readonly AgentTrace[]>([])
  const [history, setHistory] = useState<readonly AgentHistoryEntry[]>([])
  const [detailLoading, setDetailLoading] = useState(false)

  const [creating, setCreating] = useState(false)
  const [createName, setCreateName] = useState('')
  const [editing, setEditing] = useState(false)
  const [edit, setEdit] = useState<EditState>(emptyEdit())
  const [saving, setSaving] = useState(false)

  const [instruction, setInstruction] = useState('')
  const [running, setRunning] = useState(false)
  const [runResult, setRunResult] = useState<AgentRunSummary | null>(null)

  const load = useCallback(async () => {
    if (token === null || !isAdmin) return
    setLoading(true)
    setError(null)
    try {
      const [foundAgents, foundSkills] = await Promise.all([
        listAgents(token),
        listAgentSkills(token).catch(() => []),
      ])
      setAgents(foundAgents)
      setSkillOptions(foundSkills)
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
    setEditing(false)
    setRunResult(null)
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

  async function submitCreate(): Promise<void> {
    if (token === null || createName.trim().length === 0) return
    setSaving(true)
    setError(null)
    try {
      await createAgent(token, {
        name: createName.trim(),
        identity: { role: t('agents.newAgentDefaultRole'), objectives: [] },
        model: { preferred: 'anthropic' },
        tools: [],
        autonomy: { default: 'propose' },
      })
      setCreateName('')
      setCreating(false)
      await load()
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : t('agents.saveError'))
    } finally {
      setSaving(false)
    }
  }

  async function startEditing(agent: AgentSummary): Promise<void> {
    if (token === null) return
    setEditing(true)
    setError(null)
    try {
      const identity = await getAgentIdentity(token, agent.name)
      setEdit({
        role: identity.role,
        objectives: identity.objectives.join('\n'),
        style: identity.style ?? '',
        modelPreferred: agent.model?.preferred ?? 'anthropic',
        modelFallback: agent.model?.fallback ?? '',
        tools: agent.tools,
        skills: agent.skills ?? [],
        subagents: agent.subagents ?? [],
        autonomyUi: LEVEL_TO_UI[agent.autonomy?.default ?? 'propose'] ?? 'co-pilot',
        tokensPerDay: agent.budget?.tokensPerDay?.toString() ?? '',
        callsPerHour: agent.budget?.callsPerHour?.toString() ?? '',
      })
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : t('agents.loadError'))
      setEditing(false)
    }
  }

  async function submitEdit(agent: AgentSummary): Promise<void> {
    if (token === null) return
    setSaving(true)
    setError(null)
    try {
      const tokensPerDay = Number.parseInt(edit.tokensPerDay, 10)
      const callsPerHour = Number.parseInt(edit.callsPerHour, 10)
      await updateAgent(token, agent.name, {
        identity: {
          role: edit.role,
          objectives: edit.objectives
            .split('\n')
            .map((line) => line.trim())
            .filter((line) => line.length > 0),
          ...(edit.style.trim().length > 0 ? { style: edit.style.trim() } : {}),
        },
        model: {
          preferred: edit.modelPreferred,
          ...(edit.modelFallback.trim().length > 0 ? { fallback: edit.modelFallback.trim() } : {}),
        },
        tools: edit.tools,
        skills: edit.skills,
        subagents: edit.subagents,
        autonomy: { default: UI_TO_LEVEL[edit.autonomyUi] },
        budget: {
          ...(Number.isFinite(tokensPerDay) && edit.tokensPerDay !== '' ? { tokensPerDay } : {}),
          ...(Number.isFinite(callsPerHour) && edit.callsPerHour !== '' ? { callsPerHour } : {}),
        },
      })
      setEditing(false)
      await load()
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : t('agents.saveError'))
    } finally {
      setSaving(false)
    }
  }

  async function submitRemove(agent: AgentSummary): Promise<void> {
    if (token === null) return
    setSaving(true)
    setError(null)
    try {
      await removeAgent(token, agent.name)
      setSelected(null)
      await load()
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : t('agents.saveError'))
    } finally {
      setSaving(false)
    }
  }

  async function submitRun(agent: AgentSummary): Promise<void> {
    if (token === null || instruction.trim().length === 0) return
    setRunning(true)
    setError(null)
    setRunResult(null)
    try {
      setRunResult(await runAgent(token, agent.name, instruction.trim()))
      await Promise.all([
        listAgentTraces(token, agent.name).then(setTraces),
        listAgentHistory(token, agent.name).then(setHistory),
      ])
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : t('agents.runError'))
    } finally {
      setRunning(false)
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
  const otherAgentNames = agents
    .map((agent) => agent.name)
    .filter((name) => name !== selectedAgent?.name)

  return (
    <section aria-labelledby="agents-heading" className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <h1 id="agents-heading" className="m-0 text-xl leading-7 font-semibold">
          {t('agents.heading')}
        </h1>
        <Button size="sm" onClick={() => setCreating((value) => !value)}>
          {t('agents.createAgent')}
        </Button>
      </div>

      {creating && (
        <Card aria-labelledby="agents-create-heading">
          <CardHeader>
            <CardTitle>
              <h2 id="agents-create-heading">{t('agents.createAgent')}</h2>
            </CardTitle>
          </CardHeader>
          <CardBody>
            <div className="flex flex-wrap items-end gap-3">
              <Field label={t('agents.name')} className="min-w-[240px]">
                {(control) => (
                  <Input
                    {...control}
                    value={createName}
                    onChange={(event) => setCreateName(event.target.value)}
                    placeholder={t('agents.newAgentNamePlaceholder')}
                  />
                )}
              </Field>
              <Button
                disabled={saving || createName.trim().length === 0}
                onClick={() => void submitCreate()}
              >
                {t('common.save')}
              </Button>
              <Button variant="ghost" onClick={() => setCreating(false)}>
                {t('common.cancel')}
              </Button>
            </div>
            <p className="m-0 mt-2 text-xs opacity-80">{t('agents.newAgentHint')}</p>
          </CardBody>
        </Card>
      )}

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
                  <TableCell>
                    {t(
                      `agents.autonomyLevel.${LEVEL_TO_UI[agent.autonomy?.default ?? ''] ?? 'co-pilot'}`,
                    )}
                  </TableCell>
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
            <div className="mb-4 flex flex-wrap gap-2">
              {!editing && (
                <Button size="sm" onClick={() => void startEditing(selectedAgent)}>
                  {t('agents.edit')}
                </Button>
              )}
              {editing && (
                <>
                  <Button
                    size="sm"
                    disabled={saving}
                    onClick={() => void submitEdit(selectedAgent)}
                  >
                    {t('common.save')}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
                    {t('common.cancel')}
                  </Button>
                </>
              )}
              {!selectedAgent.builtin && (
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={saving}
                  onClick={() => void submitRemove(selectedAgent)}
                >
                  {t('agents.remove')}
                </Button>
              )}
            </div>

            {detailLoading && <p>{t('common.loading')}</p>}

            {!detailLoading && editing && (
              <div className="flex flex-col gap-4">
                <Field label={t('agents.identityRole')}>
                  {(control) => (
                    <Input
                      {...control}
                      value={edit.role}
                      onChange={(event) => setEdit({ ...edit, role: event.target.value })}
                    />
                  )}
                </Field>
                <Field
                  label={t('agents.identityObjectives')}
                  description={t('agents.identityObjectivesHint')}
                >
                  {(control) => (
                    <textarea
                      {...control}
                      className="w-full rounded-md border border-input bg-card px-3 py-2 font-sans text-sm leading-5 text-card-foreground shadow-card"
                      rows={3}
                      value={edit.objectives}
                      onChange={(event) => setEdit({ ...edit, objectives: event.target.value })}
                    />
                  )}
                </Field>
                <Field label={t('agents.identityStyle')}>
                  {(control) => (
                    <Input
                      {...control}
                      value={edit.style}
                      onChange={(event) => setEdit({ ...edit, style: event.target.value })}
                    />
                  )}
                </Field>

                <div className="flex flex-wrap gap-3">
                  <Field label={t('agents.modelPreferred', { model: '' })}>
                    {(control) => (
                      <Select
                        {...control}
                        value={edit.modelPreferred}
                        onChange={(event) =>
                          setEdit({ ...edit, modelPreferred: event.target.value })
                        }
                      >
                        <option value="anthropic">anthropic</option>
                        <option value="openai">openai</option>
                        <option value="google">google</option>
                      </Select>
                    )}
                  </Field>
                  <Field label={t('agents.autonomy')}>
                    {(control) => (
                      <Select
                        {...control}
                        value={edit.autonomyUi}
                        onChange={(event) =>
                          setEdit({ ...edit, autonomyUi: event.target.value as AutonomyUiLevel })
                        }
                      >
                        {AUTONOMY_UI_LEVELS.map((level) => (
                          <option key={level} value={level}>
                            {t(`agents.autonomyLevel.${level}`)}
                          </option>
                        ))}
                      </Select>
                    )}
                  </Field>
                  <Field label={t('agents.budgetMetricTokensPerDay')}>
                    {(control) => (
                      <Input
                        {...control}
                        type="number"
                        min={0}
                        value={edit.tokensPerDay}
                        onChange={(event) => setEdit({ ...edit, tokensPerDay: event.target.value })}
                      />
                    )}
                  </Field>
                  <Field label={t('agents.budgetMetricCallsPerHour')}>
                    {(control) => (
                      <Input
                        {...control}
                        type="number"
                        min={0}
                        value={edit.callsPerHour}
                        onChange={(event) => setEdit({ ...edit, callsPerHour: event.target.value })}
                      />
                    )}
                  </Field>
                </div>

                <div>
                  <h3 className="m-0 mb-2 text-sm leading-5 font-semibold">
                    {t('agents.permissions')}
                  </h3>
                  <ul className="m-0 grid list-none grid-cols-2 gap-1 p-0 text-sm sm:grid-cols-3">
                    {CONTRACT_C_PERMISSIONS.map((permission) => {
                      const inputId = `agent-edit-permission-${permission}`
                      return (
                        <li key={permission} className="flex items-center gap-2">
                          <input
                            id={inputId}
                            type="checkbox"
                            checked={edit.tools.includes(permission)}
                            onChange={() =>
                              setEdit({ ...edit, tools: toggleIn(edit.tools, permission) })
                            }
                          />
                          <label htmlFor={inputId}>{permission}</label>
                        </li>
                      )
                    })}
                  </ul>
                </div>

                {skillOptions.length > 0 && (
                  <div>
                    <h3 className="m-0 mb-2 text-sm leading-5 font-semibold">
                      {t('agents.skills')}
                    </h3>
                    <ul className="m-0 flex list-none flex-col gap-1 p-0 text-sm">
                      {skillOptions.map((skill) => {
                        const inputId = `agent-edit-skill-${skill.id}`
                        return (
                          <li key={skill.id} className="flex items-center gap-2">
                            <input
                              id={inputId}
                              type="checkbox"
                              checked={edit.skills.includes(skill.id)}
                              onChange={() =>
                                setEdit({ ...edit, skills: toggleIn(edit.skills, skill.id) })
                              }
                            />
                            <label htmlFor={inputId}>{skill.name}</label>
                          </li>
                        )
                      })}
                    </ul>
                  </div>
                )}

                {otherAgentNames.length > 0 && (
                  <div>
                    <h3 className="m-0 mb-2 text-sm leading-5 font-semibold">
                      {t('agents.subagents')}
                    </h3>
                    <ul className="m-0 flex list-none flex-col gap-1 p-0 text-sm">
                      {otherAgentNames.map((name) => {
                        const inputId = `agent-edit-subagent-${name}`
                        return (
                          <li key={name} className="flex items-center gap-2">
                            <input
                              id={inputId}
                              type="checkbox"
                              checked={edit.subagents.includes(name)}
                              onChange={() =>
                                setEdit({ ...edit, subagents: toggleIn(edit.subagents, name) })
                              }
                            />
                            <label htmlFor={inputId}>{name}</label>
                          </li>
                        )
                      })}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {!detailLoading && !editing && (
              <div className="flex flex-col gap-6">
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
                      level: t(
                        `agents.autonomyLevel.${LEVEL_TO_UI[selectedAgent.autonomy?.default ?? ''] ?? 'co-pilot'}`,
                      ),
                    })}
                  </p>
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
                    {(selectedAgent.skills ?? []).map((skillId) => (
                      <li key={skillId}>
                        {skillOptions.find((skill) => skill.id === skillId)?.name ?? skillId}
                      </li>
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
                  <h3 className="m-0 mb-2 text-sm leading-5 font-semibold">{t('agents.runNow')}</h3>
                  <div className="flex flex-col gap-2">
                    <textarea
                      className="w-full rounded-md border border-input bg-card px-3 py-2 font-sans text-sm leading-5 text-card-foreground shadow-card"
                      rows={2}
                      placeholder={t('agents.runInstructionPlaceholder')}
                      value={instruction}
                      onChange={(event) => setInstruction(event.target.value)}
                      disabled={!selectedAgent.enabled}
                    />
                    <div>
                      <Button
                        size="sm"
                        disabled={
                          running || instruction.trim().length === 0 || !selectedAgent.enabled
                        }
                        onClick={() => void submitRun(selectedAgent)}
                      >
                        {running ? t('agents.running') : t('agents.run')}
                      </Button>
                    </div>
                    {!selectedAgent.enabled && (
                      <p className="m-0 text-xs opacity-80">{t('agents.runDisabledHint')}</p>
                    )}
                    {runResult !== null && (
                      <Notice tone="info" live="polite">
                        <p className="m-0 text-sm">
                          {t('agents.runStopReason', { reason: runResult.stopReason })}
                        </p>
                        {runResult.finalText !== null && (
                          <p className="m-0 mt-1 text-sm">{runResult.finalText}</p>
                        )}
                      </Notice>
                    )}
                  </div>
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
