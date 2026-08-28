import { type JSX, useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useParams } from 'react-router'
import { type AgentSkillSummary, listAgentSkills } from '../api/agent-skills-client.js'
import {
  type AgentHistoryEntry,
  type AgentIdentityFields,
  type AgentRunSummary,
  type AgentSummary,
  type AgentTrace,
  getAgentIdentity,
  listAgentHistory,
  listAgents,
  listAgentTraces,
  removeAgent,
  runAgent,
  updateAgent,
} from '../api/agents-client.js'
import { ApiError } from '../api/client.js'
import {
  getProviderCatalog,
  listProviders,
  type ProviderCatalogEntry,
  type ProviderSummary,
} from '../api/providers-client.js'
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
  TableHead,
  TableHeader,
  TableRoot,
  TableRow,
} from '../ui/index.js'
import {
  AUTONOMY_UI_LEVELS,
  type AutonomyUiLevel,
  CONTRACT_C_PERMISSIONS,
  CUSTOM_MODEL,
  LEVEL_TO_UI,
  splitLines,
  toggleIn,
  UI_TO_LEVEL,
} from './agents.js'

interface EditState {
  readonly role: string
  readonly objectives: string
  readonly style: string
  readonly systemPrompt: string
  readonly modelPreferred: string
  readonly modelFallback: string
  readonly modelExplicit: string
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
    systemPrompt: '',
    modelPreferred: '',
    modelFallback: '',
    modelExplicit: '',
    tools: [],
    skills: [],
    subagents: [],
    autonomyUi: 'co-pilot',
    tokensPerDay: '',
    callsPerHour: '',
  }
}

/**
 * One agent's detail — fiche 71: this used to live inline on `/agents`
 * (`selected` state), so the URL never changed and an F5 or a shared link
 * always lost the open panel. Now a real route (`agents/:name`), the same
 * shape `commerce-order-detail.tsx` already uses for `commerce/orders/:id` —
 * a "Retour" `<Link>`, never `history.back()`, and a named message rather
 * than a blank screen when the name in the URL no longer resolves to a real
 * agent (deleted between opening a bookmark and loading it).
 *
 * Loads its own copy of the agent list (plus skills/providers/catalog),
 * independent from `AgentsRoute` — the same independence
 * `commerce-order-detail.tsx` has from `commerce-orders.tsx`.
 */
export function AgentDetailRoute(): JSX.Element {
  const { t } = useTranslation()
  const { name = '' } = useParams<{ name: string }>()
  const navigate = useNavigate()
  const auth = useAuth()
  const token = auth.state.status === 'authenticated' ? auth.state.token : null
  const roles = auth.state.status === 'authenticated' ? auth.state.user.roles : []
  const isAdmin = roles.includes('admin')

  const [agents, setAgents] = useState<readonly AgentSummary[]>([])
  const [skillOptions, setSkillOptions] = useState<readonly AgentSkillSummary[]>([])
  const [providers, setProviders] = useState<readonly ProviderSummary[]>([])
  const [catalog, setCatalog] = useState<readonly ProviderCatalogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [traces, setTraces] = useState<readonly AgentTrace[]>([])
  const [history, setHistory] = useState<readonly AgentHistoryEntry[]>([])
  const [identity, setIdentity] = useState<AgentIdentityFields | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  const [editing, setEditing] = useState(false)
  const [edit, setEdit] = useState<EditState>(emptyEdit())
  const [editModelChoice, setEditModelChoice] = useState(CUSTOM_MODEL)
  const [saving, setSaving] = useState(false)

  const [instruction, setInstruction] = useState('')
  const [running, setRunning] = useState(false)
  const [runResult, setRunResult] = useState<AgentRunSummary | null>(null)

  const load = useCallback(async () => {
    if (token === null || !isAdmin) return
    setLoading(true)
    setError(null)
    try {
      const [foundAgents, foundSkills, foundProviders, foundCatalog] = await Promise.all([
        listAgents(token),
        listAgentSkills(token).catch(() => []),
        listProviders(token).catch(() => []),
        getProviderCatalog(token).catch(() => []),
      ])
      setAgents(foundAgents)
      setSkillOptions(foundSkills)
      setProviders(foundProviders)
      setCatalog(foundCatalog)
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : t('agents.loadError'))
    } finally {
      setLoading(false)
    }
  }, [token, isAdmin, t])

  useEffect(() => {
    void load()
  }, [load])

  const enabledProviders = useMemo(() => providers.filter((p) => p.enabled), [providers])
  const selectedAgent = agents.find((agent) => agent.name === name) ?? null
  const otherAgentNames = agents
    .map((agent) => agent.name)
    .filter((candidate) => candidate !== selectedAgent?.name)

  // Only fetched once the agent is confirmed to exist in the freshly loaded
  // list — a URL pointing at a name that no longer exists must not fire
  // three doomed requests, it must show the "not found" message below.
  useEffect(() => {
    if (token === null || loading || selectedAgent === null) {
      if (!loading && selectedAgent === null) {
        setTraces([])
        setHistory([])
        setIdentity(null)
      }
      return
    }
    setDetailLoading(true)
    setEditing(false)
    setRunResult(null)
    void Promise.all([
      listAgentTraces(token, selectedAgent.name),
      listAgentHistory(token, selectedAgent.name),
      getAgentIdentity(token, selectedAgent.name).catch(() => null),
    ])
      .then(([foundTraces, foundHistory, foundIdentity]) => {
        setTraces(foundTraces)
        setHistory(foundHistory)
        setIdentity(foundIdentity)
      })
      .catch((caught: unknown) => {
        setError(caught instanceof ApiError ? caught.message : t('agents.loadError'))
      })
      .finally(() => setDetailLoading(false))
  }, [token, loading, selectedAgent, t])

  function selectEditKnownModel(modelId: string): void {
    setEditModelChoice(modelId)
    if (modelId !== CUSTOM_MODEL) setEdit((current) => ({ ...current, modelExplicit: modelId }))
  }

  const editCatalogEntry = useMemo(
    () => catalog.find((entry) => entry.id === edit.modelPreferred),
    [catalog, edit.modelPreferred],
  )

  async function startEditing(agent: AgentSummary): Promise<void> {
    if (token === null) return
    setEditing(true)
    setError(null)
    try {
      const foundIdentity = await getAgentIdentity(token, agent.name)
      setEdit({
        role: foundIdentity.role,
        objectives: foundIdentity.objectives.join('\n'),
        style: foundIdentity.style ?? '',
        systemPrompt: foundIdentity.systemPrompt ?? '',
        modelPreferred: agent.model?.preferred ?? enabledProviders[0]?.provider ?? '',
        modelFallback: agent.model?.fallback ?? '',
        modelExplicit: agent.model?.model ?? '',
        tools: agent.tools,
        skills: agent.skills ?? [],
        subagents: agent.subagents ?? [],
        autonomyUi: LEVEL_TO_UI[agent.autonomy?.default ?? 'propose'] ?? 'co-pilot',
        tokensPerDay: agent.budget?.tokensPerDay?.toString() ?? '',
        callsPerHour: agent.budget?.callsPerHour?.toString() ?? '',
      })
      setEditModelChoice(CUSTOM_MODEL)
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
          objectives: splitLines(edit.objectives),
          ...(edit.style.trim().length > 0 ? { style: edit.style.trim() } : {}),
          ...(edit.systemPrompt.trim().length > 0
            ? { systemPrompt: edit.systemPrompt.trim() }
            : {}),
        },
        model: {
          preferred: edit.modelPreferred,
          ...(edit.modelFallback.trim().length > 0 ? { fallback: edit.modelFallback.trim() } : {}),
          ...(edit.modelExplicit.trim().length > 0 ? { model: edit.modelExplicit.trim() } : {}),
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
      navigate('/agents')
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

  if (loading) return <p>{t('common.loading')}</p>

  // Handles a URL pointing at an agent that no longer exists (removed, or
  // never real) with a named message, never a blank screen — the fiche's
  // own named pitfall for a route-based detail panel.
  if (selectedAgent === null) {
    return (
      <section className="flex flex-col gap-4">
        <Link to="/agents">{t('agents.detailBack')}</Link>
        <Notice tone="warning" live="polite">
          <p>{t('agents.detailNotFound')}</p>
        </Notice>
      </section>
    )
  }

  return (
    <section aria-labelledby="agents-detail-heading" className="flex flex-col gap-6">
      <Link to="/agents">{t('agents.detailBack')}</Link>

      {error !== null && (
        <Notice tone="danger" live="assertive">
          <p>{error}</p>
        </Notice>
      )}

      <Card aria-labelledby="agents-detail-heading">
        <CardHeader>
          <CardTitle>
            <h1 id="agents-detail-heading">
              {t('agents.detailHeading', { name: selectedAgent.name })}
            </h1>
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
                <Button size="sm" disabled={saving} onClick={() => void submitEdit(selectedAgent)}>
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
              <Field
                label={t('agents.identitySystemPrompt')}
                description={t('agents.identitySystemPromptHint')}
              >
                {(control) => (
                  <textarea
                    {...control}
                    className="w-full rounded-md border border-input bg-card px-3 py-2 font-sans text-sm leading-5 text-card-foreground shadow-card"
                    rows={3}
                    value={edit.systemPrompt}
                    onChange={(event) => setEdit({ ...edit, systemPrompt: event.target.value })}
                  />
                )}
              </Field>

              <div className="flex flex-wrap gap-3">
                <Field label={t('agents.createProvider')}>
                  {(control) => (
                    <Select
                      {...control}
                      value={edit.modelPreferred}
                      onChange={(event) => {
                        setEdit({ ...edit, modelPreferred: event.target.value })
                        setEditModelChoice(CUSTOM_MODEL)
                      }}
                    >
                      {/* The agent's currently configured provider is always shown, even if it was since disabled — otherwise saving would silently switch it. */}
                      {!enabledProviders.some((p) => p.provider === edit.modelPreferred) &&
                        edit.modelPreferred.length > 0 && (
                          <option value={edit.modelPreferred}>{edit.modelPreferred}</option>
                        )}
                      {enabledProviders.map((provider) => (
                        <option key={provider.provider} value={provider.provider}>
                          {provider.provider}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>
                {(editCatalogEntry?.knownModels.length ?? 0) > 0 && (
                  <Field label={t('providers.knownModel')}>
                    {(control) => (
                      <Select
                        {...control}
                        value={editModelChoice}
                        onChange={(event) => selectEditKnownModel(event.target.value)}
                      >
                        <option value={CUSTOM_MODEL}>{t('providers.customModelOption')}</option>
                        {(editCatalogEntry?.knownModels ?? []).map((modelId) => (
                          <option key={modelId} value={modelId}>
                            {modelId}
                          </option>
                        ))}
                      </Select>
                    )}
                  </Field>
                )}
                <Field label={t('agents.createModel')} description={t('agents.createModelHint')}>
                  {(control) => (
                    <Input
                      {...control}
                      value={edit.modelExplicit}
                      onChange={(event) => {
                        setEdit({ ...edit, modelExplicit: event.target.value })
                        setEditModelChoice(CUSTOM_MODEL)
                      }}
                      placeholder={t('providers.modelPlaceholder')}
                    />
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
                  <h3 className="m-0 mb-2 text-sm leading-5 font-semibold">{t('agents.skills')}</h3>
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
                    {otherAgentNames.map((otherName) => {
                      const inputId = `agent-edit-subagent-${otherName}`
                      return (
                        <li key={otherName} className="flex items-center gap-2">
                          <input
                            id={inputId}
                            type="checkbox"
                            checked={edit.subagents.includes(otherName)}
                            onChange={() =>
                              setEdit({ ...edit, subagents: toggleIn(edit.subagents, otherName) })
                            }
                          />
                          <label htmlFor={inputId}>{otherName}</label>
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
                <h3 className="m-0 mb-2 text-sm leading-5 font-semibold">
                  {t('agents.identityHeading')}
                </h3>
                {identity === null ? (
                  <p className="m-0 text-sm">{t('common.loading')}</p>
                ) : (
                  <div className="flex flex-col gap-2 text-sm">
                    <p className="m-0">{identity.role}</p>
                    {identity.objectives.length > 0 && (
                      <ul className="m-0 list-disc pl-5">
                        {identity.objectives.map((objective) => (
                          <li key={objective}>{objective}</li>
                        ))}
                      </ul>
                    )}
                    {identity.style !== undefined && (
                      <p className="m-0 opacity-80">
                        {t('agents.identityStyle')}: {identity.style}
                      </p>
                    )}
                    {identity.systemPrompt !== undefined && (
                      <div>
                        <p className="m-0 font-medium">{t('agents.identitySystemPrompt')}</p>
                        <p className="m-0 whitespace-pre-wrap opacity-80">
                          {identity.systemPrompt}
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div>
                <h3 className="m-0 mb-2 text-sm leading-5 font-semibold">{t('agents.model')}</h3>
                {selectedAgent.model === undefined ? (
                  <p className="m-0 text-sm">{t('agents.modelNone')}</p>
                ) : (
                  <p className="m-0 text-sm">
                    {t('agents.modelPreferred', { model: selectedAgent.model.preferred })}
                    {selectedAgent.model.fallback !== undefined &&
                      ` — ${t('agents.modelFallback', { model: selectedAgent.model.fallback })}`}
                    {selectedAgent.model.model !== undefined &&
                      ` — ${t('agents.modelExplicit', { model: selectedAgent.model.model })}`}
                  </p>
                )}
              </div>

              <div>
                <h3 className="m-0 mb-2 text-sm leading-5 font-semibold">{t('agents.autonomy')}</h3>
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
                <h3 className="m-0 mb-2 text-sm leading-5 font-semibold">{t('agents.history')}</h3>
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
    </section>
  )
}
