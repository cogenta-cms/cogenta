import { type JSX, useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import {
  type AgentSummary,
  createAgent,
  disableAgent,
  enableAgent,
  listAgents,
} from '../api/agents-client.js'
import { type GeneratedAgentIdentity, runGenerateAgentIdentity } from '../api/assist-client.js'
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
/** Exported for `agent-detail.tsx` (fiche 71 split the detail panel into its own route) — the create form and the edit form share this exact taxonomy. */
export const CONTRACT_C_PERMISSIONS: readonly string[] = [
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
export const AUTONOMY_UI_LEVELS = ['report-only', 'co-pilot', 'autopilot'] as const
export type AutonomyUiLevel = (typeof AUTONOMY_UI_LEVELS)[number]
export const UI_TO_LEVEL: Record<AutonomyUiLevel, string> = {
  'report-only': 'observe',
  'co-pilot': 'propose',
  autopilot: 'autonomous',
}
export const LEVEL_TO_UI: Record<string, AutonomyUiLevel> = {
  observe: 'report-only',
  propose: 'co-pilot',
  execute_with_approval: 'co-pilot',
  autonomous: 'autopilot',
}

/** Sentinel model-select value meaning "leave the free-text model field alone" — same convention as `providers.tsx`'s `CUSTOM_MODEL`. */
export const CUSTOM_MODEL = ''

/** Exported for `agent-detail.tsx`'s permission checklist (create form and edit form share the exact same widget). */
export function toggleIn(list: readonly string[], value: string): readonly string[] {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value]
}

/** Exported for `agent-detail.tsx`'s edit form — same "one line per item" convention as the create form's objectives/constraints fields. */
export function splitLines(text: string): readonly string[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
}

/**
 * L22 task 1: the real, persistent `AgentRegistry` — superagent + two
 * example built-ins, seeded on first boot, genuinely editable and runnable
 * from this screen. Replaces the pre-L22 read-only wrapper: `@cogenta/api`'s
 * `agents-router.ts` now backs `create`/`update`/`remove`/`run` with a real
 * file store and a real execution loop (`@cogenta/agents`' `AgentRunner`).
 *
 * Fiche 55: creation grew from "just a name" into the same richness edit
 * already had, plus two things edit never had — a `systemPrompt` (task 1),
 * and a "generate it" alternative to writing role/objectives/style/
 * systemPrompt by hand (task 3, `assist.generate_agent_identity`, reviewed
 * in the very same fields before Save — R6, nothing is ever applied
 * automatically). The provider `<Select>` in both create and edit is now
 * read from `GET /api/providers` filtered to `enabled: true` (task 3/4),
 * never a hard-coded three-option list.
 */
export function AgentsRoute(): JSX.Element {
  const { t } = useTranslation()
  const auth = useAuth()
  const token = auth.state.status === 'authenticated' ? auth.state.token : null
  const roles = auth.state.status === 'authenticated' ? auth.state.user.roles : []
  const isAdmin = roles.includes('admin')

  const [agents, setAgents] = useState<readonly AgentSummary[]>([])
  const [providers, setProviders] = useState<readonly ProviderSummary[]>([])
  const [catalog, setCatalog] = useState<readonly ProviderCatalogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [toggling, setToggling] = useState<string | null>(null)

  const [creating, setCreating] = useState(false)
  const [createName, setCreateName] = useState('')
  const [createProvider, setCreateProvider] = useState('')
  const [createModelChoice, setCreateModelChoice] = useState(CUSTOM_MODEL)
  const [createModel, setCreateModel] = useState('')
  const [createRole, setCreateRole] = useState('')
  const [createObjectives, setCreateObjectives] = useState('')
  const [createStyle, setCreateStyle] = useState('')
  const [createSystemPrompt, setCreateSystemPrompt] = useState('')
  const [createTools, setCreateTools] = useState<readonly string[]>([])
  const [createAutonomyUi, setCreateAutonomyUi] = useState<AutonomyUiLevel>('co-pilot')
  const [createPurpose, setCreatePurpose] = useState('')
  const [createConstraints, setCreateConstraints] = useState('')
  const [generating, setGenerating] = useState(false)
  const [generateError, setGenerateError] = useState<string | null>(null)
  const [generated, setGenerated] = useState(false)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    if (token === null || !isAdmin) return
    setLoading(true)
    setError(null)
    try {
      const [foundAgents, foundProviders, foundCatalog] = await Promise.all([
        listAgents(token),
        listProviders(token).catch(() => []),
        getProviderCatalog(token).catch(() => []),
      ])
      setAgents(foundAgents)
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

  useEffect(() => {
    if (createProvider === '' && enabledProviders.length > 0) {
      setCreateProvider(enabledProviders[0]?.provider ?? '')
    }
  }, [enabledProviders, createProvider])

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

  function resetCreateForm(): void {
    setCreateName('')
    setCreateModelChoice(CUSTOM_MODEL)
    setCreateModel('')
    setCreateRole('')
    setCreateObjectives('')
    setCreateStyle('')
    setCreateSystemPrompt('')
    setCreateTools([])
    setCreateAutonomyUi('co-pilot')
    setCreatePurpose('')
    setCreateConstraints('')
    setGenerateError(null)
    setGenerated(false)
  }

  function selectCreateKnownModel(modelId: string): void {
    setCreateModelChoice(modelId)
    if (modelId !== CUSTOM_MODEL) setCreateModel(modelId)
  }

  const createCatalogEntry = useMemo(
    () => catalog.find((entry) => entry.id === createProvider),
    [catalog, createProvider],
  )

  async function submitGenerate(): Promise<void> {
    if (token === null || createName.trim().length === 0 || createPurpose.trim().length === 0) {
      return
    }
    setGenerating(true)
    setGenerateError(null)
    try {
      const result: GeneratedAgentIdentity = await runGenerateAgentIdentity(token, {
        agentName: createName.trim(),
        purpose: createPurpose.trim(),
        toolNames: createTools,
        constraints: splitLines(createConstraints),
      })
      // Fills the same fields the human can edit — never saved on its own
      // (R6): Save is still a separate, explicit action below.
      setCreateRole(result.role)
      setCreateObjectives(result.objectives.join('\n'))
      setCreateStyle(result.style ?? '')
      setCreateSystemPrompt(result.systemPrompt ?? '')
      setGenerated(true)
    } catch (caught) {
      setGenerateError(caught instanceof ApiError ? caught.message : t('agents.generateError'))
    } finally {
      setGenerating(false)
    }
  }

  async function submitCreate(): Promise<void> {
    if (token === null || createName.trim().length === 0 || createProvider.trim().length === 0) {
      return
    }
    setSaving(true)
    setError(null)
    try {
      const role =
        createRole.trim().length > 0 ? createRole.trim() : t('agents.newAgentDefaultRole')
      await createAgent(token, {
        name: createName.trim(),
        identity: {
          role,
          objectives: splitLines(createObjectives),
          ...(createStyle.trim().length > 0 ? { style: createStyle.trim() } : {}),
          ...(createSystemPrompt.trim().length > 0
            ? { systemPrompt: createSystemPrompt.trim() }
            : {}),
        },
        model: {
          preferred: createProvider,
          ...(createModel.trim().length > 0 ? { model: createModel.trim() } : {}),
        },
        tools: createTools,
        autonomy: { default: UI_TO_LEVEL[createAutonomyUi] },
      })
      resetCreateForm()
      setCreating(false)
      await load()
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : t('agents.saveError'))
    } finally {
      setSaving(false)
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
      <div className="flex items-center justify-between gap-4">
        <h1 id="agents-heading" className="m-0 text-2xl leading-tight font-bold tracking-tight">
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
            <div className="flex flex-col gap-4">
              {enabledProviders.length === 0 && (
                <Notice tone="warning">
                  <p className="m-0 text-sm">{t('agents.createNoProviders')}</p>
                </Notice>
              )}
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
                <Field label={t('agents.createProvider')} className="min-w-[200px]">
                  {(control) => (
                    <Select
                      {...control}
                      value={createProvider}
                      onChange={(event) => {
                        setCreateProvider(event.target.value)
                        setCreateModelChoice(CUSTOM_MODEL)
                        setCreateModel('')
                      }}
                      disabled={enabledProviders.length === 0}
                    >
                      {enabledProviders.map((provider) => (
                        <option key={provider.provider} value={provider.provider}>
                          {provider.provider}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>
                {(createCatalogEntry?.knownModels.length ?? 0) > 0 && (
                  <Field label={t('providers.knownModel')} className="min-w-[200px]">
                    {(control) => (
                      <Select
                        {...control}
                        value={createModelChoice}
                        onChange={(event) => selectCreateKnownModel(event.target.value)}
                      >
                        <option value={CUSTOM_MODEL}>{t('providers.customModelOption')}</option>
                        {(createCatalogEntry?.knownModels ?? []).map((modelId) => (
                          <option key={modelId} value={modelId}>
                            {modelId}
                          </option>
                        ))}
                      </Select>
                    )}
                  </Field>
                )}
                <Field
                  label={t('agents.createModel')}
                  description={t('agents.createModelHint')}
                  className="min-w-[200px]"
                >
                  {(control) => (
                    <Input
                      {...control}
                      value={createModel}
                      onChange={(event) => {
                        setCreateModel(event.target.value)
                        setCreateModelChoice(CUSTOM_MODEL)
                      }}
                      placeholder={t('providers.modelPlaceholder')}
                    />
                  )}
                </Field>
              </div>

              <div className="flex flex-col gap-3">
                <Field label={t('agents.identityRole')}>
                  {(control) => (
                    <Input
                      {...control}
                      value={createRole}
                      onChange={(event) => setCreateRole(event.target.value)}
                      placeholder={t('agents.newAgentDefaultRole')}
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
                      value={createObjectives}
                      onChange={(event) => setCreateObjectives(event.target.value)}
                    />
                  )}
                </Field>
                <Field label={t('agents.identityStyle')}>
                  {(control) => (
                    <Input
                      {...control}
                      value={createStyle}
                      onChange={(event) => setCreateStyle(event.target.value)}
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
                      value={createSystemPrompt}
                      onChange={(event) => setCreateSystemPrompt(event.target.value)}
                    />
                  )}
                </Field>
              </div>

              <Card aria-labelledby="agents-generate-heading">
                <CardHeader>
                  <CardTitle>
                    <h3
                      id="agents-generate-heading"
                      className="m-0 text-sm leading-5 font-semibold"
                    >
                      {t('agents.generateHeading')}
                    </h3>
                  </CardTitle>
                </CardHeader>
                <CardBody>
                  <p className="m-0 mb-3 text-xs opacity-80">{t('agents.generateHint')}</p>
                  <div className="flex flex-col gap-3">
                    <Field
                      label={t('agents.generatePurpose')}
                      description={t('agents.generatePurposeHint')}
                    >
                      {(control) => (
                        <textarea
                          {...control}
                          className="w-full rounded-md border border-input bg-card px-3 py-2 font-sans text-sm leading-5 text-card-foreground shadow-card"
                          rows={3}
                          value={createPurpose}
                          onChange={(event) => setCreatePurpose(event.target.value)}
                          placeholder={t('agents.generatePurposePlaceholder')}
                        />
                      )}
                    </Field>
                    <Field
                      label={t('agents.generateConstraints')}
                      description={t('agents.generateConstraintsHint')}
                    >
                      {(control) => (
                        <textarea
                          {...control}
                          className="w-full rounded-md border border-input bg-card px-3 py-2 font-sans text-sm leading-5 text-card-foreground shadow-card"
                          rows={2}
                          value={createConstraints}
                          onChange={(event) => setCreateConstraints(event.target.value)}
                        />
                      )}
                    </Field>
                    {generateError !== null && (
                      <Notice tone="danger" live="assertive">
                        <p className="m-0 text-sm">{generateError}</p>
                      </Notice>
                    )}
                    {generated && generateError === null && (
                      <Notice tone="info" live="polite">
                        <p className="m-0 text-sm">{t('agents.generatedReview')}</p>
                      </Notice>
                    )}
                    <div>
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={
                          generating ||
                          createName.trim().length === 0 ||
                          createPurpose.trim().length === 0
                        }
                        onClick={() => void submitGenerate()}
                      >
                        {generating ? t('agents.generating') : t('agents.generateButton')}
                      </Button>
                    </div>
                  </div>
                </CardBody>
              </Card>

              <div>
                <h3 className="m-0 mb-2 text-sm leading-5 font-semibold">
                  {t('agents.permissions')}
                </h3>
                <ul className="m-0 grid list-none grid-cols-2 gap-1 p-0 text-sm sm:grid-cols-3">
                  {CONTRACT_C_PERMISSIONS.map((permission) => {
                    const inputId = `agent-create-permission-${permission}`
                    return (
                      <li key={permission} className="flex items-center gap-2">
                        <input
                          id={inputId}
                          type="checkbox"
                          checked={createTools.includes(permission)}
                          onChange={() => setCreateTools(toggleIn(createTools, permission))}
                        />
                        <label htmlFor={inputId}>{permission}</label>
                      </li>
                    )
                  })}
                </ul>
              </div>

              <Field label={t('agents.autonomy')} className="max-w-xs">
                {(control) => (
                  <Select
                    {...control}
                    value={createAutonomyUi}
                    onChange={(event) => setCreateAutonomyUi(event.target.value as AutonomyUiLevel)}
                  >
                    {AUTONOMY_UI_LEVELS.map((level) => (
                      <option key={level} value={level}>
                        {t(`agents.autonomyLevel.${level}`)}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>

              <div className="flex gap-3">
                <Button
                  disabled={
                    saving || createName.trim().length === 0 || createProvider.trim().length === 0
                  }
                  onClick={() => void submitCreate()}
                >
                  {t('common.save')}
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => {
                    setCreating(false)
                    resetCreateForm()
                  }}
                >
                  {t('common.cancel')}
                </Button>
              </div>
              <p className="m-0 text-xs opacity-80">{t('agents.newAgentHint')}</p>
            </div>
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
                    <Link
                      to={`/agents/${encodeURIComponent(agent.name)}`}
                      className="font-medium text-primary underline-offset-2 hover:underline"
                    >
                      {agent.name}
                    </Link>
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
    </section>
  )
}
