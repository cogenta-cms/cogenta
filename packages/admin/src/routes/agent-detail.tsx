import type { TFunction } from 'i18next'
import { type JSX, useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useParams } from 'react-router'
import { type AgentSkillSummary, listAgentSkills } from '../api/agent-skills-client.js'
import {
  type AgentHistoryEntry,
  type AgentIdentityFields,
  type AgentSummary,
  type AgentTrace,
  disableAgent,
  enableAgent,
  getAgentIdentity,
  listAgentHistory,
  listAgents,
  listAgentTraces,
  removeAgent,
  updateAgent,
} from '../api/agents-client.js'
import { getImageGenerationStatus, type ImageGenerationStatus } from '../api/media-client.js'
import {
  getProviderCatalog,
  listProviders,
  type ProviderCatalogEntry,
  type ProviderSummary,
} from '../api/providers-client.js'
import { parseBudgetField } from '../ai/budget.js'
import { skillDisplayName } from '../ai/skill-text.js'
import { ConfirmAction } from '../ai/confirm-action.js'
import { describeCron } from '../ai/cron-text.js'
import { formatDateTime } from '../ai/format-date.js'
import { agentDisplayName, describeAiErrorLine, toolName } from '../ai/server-text.js'
import { useFlash } from '../ai/use-flash.js'
import { AgentChatFeed } from '../assist/agent-chat-feed.js'
import { useAgentConversation } from '../assist/use-agent-conversation.js'
import { useAuth } from '../auth/auth-context.js'
import { agentSummary } from '../i18n/shipped-text.js'
import { SettingsIcon } from '../ui/icons.js'
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  Field,
  Input,
  Modal,
  Notice,
  PageHeader,
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
  AUTOMATIC_PROVIDER,
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
  readonly eurPerMonth: string
  readonly callsPerHour: string
}

/** Traces/history each show at most this many entries before "afficher tout" — a real site's tool-call log grows fast, and the chat feed's own per-turn "outils utilisés" already covers the common case. */
const TECHNICAL_LOG_PAGE_SIZE = 8

/** An audit action as a person reads it: `agent.tool.content.list` → "Outil : Lister les contenus". */
function historyAction(action: string, t: TFunction): string {
  if (action === 'agent.run') return t('agents.historyRun')
  if (action.startsWith('agent.tool.')) {
    return t('agents.historyTool', { tool: toolName(action.slice('agent.tool.'.length), t) })
  }
  return action
}

/** The sentence under the title that says which provider answers for this agent. */
function providerSentence(
  agent: AgentSummary,
  enabledProviders: readonly ProviderSummary[],
  t: TFunction,
): string {
  const names = enabledProviders.map((provider) => provider.provider)
  const wanted = [agent.model?.preferred, agent.model?.fallback].find(
    (candidate): candidate is string =>
      candidate !== undefined && candidate !== AUTOMATIC_PROVIDER && names.includes(candidate),
  )
  if (wanted !== undefined) return t('agents.runsOn', { provider: wanted })
  const any = [...names].sort()[0]
  return any === undefined ? t('agents.runsOnNothing') : t('agents.runsOnAutomatic', { provider: any })
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
    eurPerMonth: '',
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
  const { t, i18n } = useTranslation()
  const { name = '' } = useParams<{ name: string }>()
  const navigate = useNavigate()
  const auth = useAuth()
  const token = auth.state.status === 'authenticated' ? auth.state.token : null

  /**
   * Which image model this agent would actually draw with.
   *
   * The `model` field above names a *text* provider — the model that reasons
   * about what to draw. The image model is a different thing entirely, lives
   * on the provider entry (one multimodal vendor is one entry sharing one
   * key), and is resolved separately. An admin opening an agent that can
   * generate images and finding only a text model has no way to know that,
   * which is the gap this closes.
   */
  const [imageStatus, setImageStatus] = useState<ImageGenerationStatus | null>(null)
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
  const [confirmRemoval, setConfirmRemoval] = useState(false)
  const [toggling, setToggling] = useState(false)
  /** Set once a save has been attempted, so an untouched form is not shown as wrong. */
  const [showBudgetErrors, setShowBudgetErrors] = useState(false)
  const flash = useFlash()

  const conversation = useAgentConversation(token, name, t('agentChat.sendError'))
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [showAllTraces, setShowAllTraces] = useState(false)
  const [showAllHistory, setShowAllHistory] = useState(false)

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
      setError(describeAiErrorLine(caught, t, t('agents.loadError')))
    } finally {
      setLoading(false)
    }
  }, [token, isAdmin, t])

  useEffect(() => {
    void load()
  }, [load])

  const enabledProviders = useMemo(() => providers.filter((p) => p.enabled), [providers])
  const selectedAgent = agents.find((agent) => agent.name === name) ?? null
  const number = new Intl.NumberFormat(i18n.language)
  const agentName = (agentNameValue: string): string =>
    agentDisplayName(
      agentNameValue,
      agents.find((candidate) => candidate.name === agentNameValue)?.builtin,
      t,
    )
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
    setShowAllTraces(false)
    setShowAllHistory(false)
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
        setError(describeAiErrorLine(caught, t, t('agents.loadError')))
      })
      .finally(() => setDetailLoading(false))
  }, [token, loading, selectedAgent, t])

  useEffect(() => {
    if (token === null) return () => undefined
    let cancelled = false
    getImageGenerationStatus(token)
      .then((status) => {
        if (!cancelled) setImageStatus(status)
      })
      .catch(() => {
        if (!cancelled) setImageStatus({ available: false })
      })
    return () => {
      cancelled = true
    }
  }, [token])

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
        // A provider that is not registered here (the seeded default names
        // Anthropic and OpenAI) means "whichever is enabled" at run time, so
        // that is what the form shows rather than a name that does not exist.
        modelPreferred:
          agent.model !== undefined && providers.some((p) => p.provider === agent.model?.preferred)
            ? agent.model.preferred
            : AUTOMATIC_PROVIDER,
        modelFallback: agent.model?.fallback ?? '',
        modelExplicit: agent.model?.model ?? '',
        tools: agent.tools,
        skills: agent.skills ?? [],
        subagents: agent.subagents ?? [],
        autonomyUi: LEVEL_TO_UI[agent.autonomy?.default ?? 'propose'] ?? 'co-pilot',
        tokensPerDay: agent.budget?.tokensPerDay?.toString() ?? '',
        eurPerMonth: agent.budget?.eurPerMonth?.toString() ?? '',
        callsPerHour: agent.budget?.callsPerHour?.toString() ?? '',
      })
      setEditModelChoice(CUSTOM_MODEL)
      setShowBudgetErrors(false)
    } catch (caught) {
      setError(describeAiErrorLine(caught, t, t('agents.loadError')))
      setEditing(false)
    }
  }

  const budgetFields = {
    tokensPerDay: parseBudgetField(edit.tokensPerDay),
    eurPerMonth: parseBudgetField(edit.eurPerMonth, { decimals: true }),
    callsPerHour: parseBudgetField(edit.callsPerHour),
  } as const
  const budgetInvalid = Object.values(budgetFields).some((field) => field.kind === 'invalid')
  const budgetError = (field: keyof typeof budgetFields): string | null =>
    showBudgetErrors && budgetFields[field].kind === 'invalid' ? t('agents.budgetInvalid') : null

  async function submitEdit(agent: AgentSummary): Promise<void> {
    if (token === null) return
    if (budgetInvalid) {
      setShowBudgetErrors(true)
      return
    }
    setSaving(true)
    setError(null)
    try {
      const numeric = (field: keyof typeof budgetFields): number | undefined => {
        const parsed = budgetFields[field]
        return parsed.kind === 'value' ? parsed.value : undefined
      }
      const tokensPerDay = numeric('tokensPerDay')
      const eurPerMonth = numeric('eurPerMonth')
      const callsPerHour = numeric('callsPerHour')
      await updateAgent(token, agent.name, {
        identity: {
          role: edit.role,
          objectives: splitLines(edit.objectives),
          ...(edit.style.trim().length > 0 ? { style: edit.style.trim() } : {}),
          ...(edit.systemPrompt.trim().length > 0
            ? { systemPrompt: edit.systemPrompt.trim() }
            : {}),
        },
        model:
          edit.modelPreferred === AUTOMATIC_PROVIDER
            ? // Cogenta picks the provider, so a model id (which belongs to
              // one vendor) and a fallback have nothing to apply to.
              { preferred: AUTOMATIC_PROVIDER }
            : {
                preferred: edit.modelPreferred,
                ...(edit.modelFallback.trim().length > 0
                  ? { fallback: edit.modelFallback.trim() }
                  : {}),
                ...(edit.modelExplicit.trim().length > 0
                  ? { model: edit.modelExplicit.trim() }
                  : {}),
              },
        tools: edit.tools,
        skills: edit.skills,
        subagents: edit.subagents,
        // `updateAgent` replaces `autonomy`/`budget` wholesale when present
        // (same as `skills`/`subagents` — the store's contract, not a bug):
        // this screen only edits the default level and the three budget
        // numbers, so per-tool overrides and any limit this form has no
        // field for must be carried forward from `agent` or they vanish
        // silently on the next save.
        autonomy: {
          ...(agent.autonomy?.overrides === undefined
            ? {}
            : { overrides: agent.autonomy.overrides }),
          default: UI_TO_LEVEL[edit.autonomyUi],
        },
        budget: {
          ...(tokensPerDay === undefined ? {} : { tokensPerDay }),
          ...(eurPerMonth === undefined ? {} : { eurPerMonth }),
          ...(callsPerHour === undefined ? {} : { callsPerHour }),
        },
      })
      setEditing(false)
      // Closed so the confirmation below is seen, not hidden behind the dialog.
      setSettingsOpen(false)
      flash.show(t('agents.settingsSaved'))
      await load()
    } catch (caught) {
      setError(describeAiErrorLine(caught, t, t('agents.saveError')))
    } finally {
      setSaving(false)
    }
  }

  async function toggleEnabled(agent: AgentSummary): Promise<void> {
    if (token === null) return
    setToggling(true)
    setError(null)
    try {
      if (agent.enabled) await disableAgent(token, agent.name)
      else await enableAgent(token, agent.name)
      flash.show(
        t(agent.enabled ? 'agents.nowDisabled' : 'agents.nowEnabled', {
          name: agentDisplayName(agent.name, agent.builtin, t),
        }),
      )
      await load()
    } catch (caught) {
      setError(describeAiErrorLine(caught, t, t('agents.toggleError')))
    } finally {
      setToggling(false)
    }
  }

  async function submitRemove(agent: AgentSummary): Promise<void> {
    if (token === null) return
    setSaving(true)
    setError(null)
    try {
      await removeAgent(token, agent.name)
      setConfirmRemoval(false)
      navigate('/agents')
    } catch (caught) {
      setError(describeAiErrorLine(caught, t, t('agents.saveError')))
      setConfirmRemoval(false)
    } finally {
      setSaving(false)
    }
  }

  // The chat feed's own `useAgentConversation` runs the agent now — this
  // just keeps the collapsed technical log (traces/history) in step with
  // it, the same refresh `submitRun` used to do inline before the chat
  // feed replaced it.
  const turnCount = conversation.turns.length
  useEffect(() => {
    if (token === null || selectedAgent === null || turnCount === 0) return
    void Promise.all([
      listAgentTraces(token, selectedAgent.name).then(setTraces),
      listAgentHistory(token, selectedAgent.name).then(setHistory),
    ])
    // `turnCount` (a number), not `conversation.turns` (a new array
    // reference every load): using the array itself would refire this on
    // every render the hook re-resolves the same thread to an equal-length
    // array, which is harmless but pointless.
  }, [turnCount, token, selectedAgent])

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
        <PageHeader title={t('agents.heading')} />
        <Link to="/agents">{t('agents.detailBack')}</Link>
        <Notice tone="warning" live="polite">
          <p>{t('agents.detailNotFound')}</p>
        </Notice>
      </section>
    )
  }

  return (
    <section aria-labelledby="agents-detail-heading" className="flex flex-col gap-3">
      <Link to="/agents">{t('agents.detailBack')}</Link>

      {error !== null && (
        <Notice tone="danger" live="assertive">
          <p>{error}</p>
        </Notice>
      )}

      {/* Fiche feedback: the agent's own description used to be buried inside
          "Réglages" — shown here too so what this agent is for is readable
          without opening the modal. */}
      {flash.message !== null && (
        <Notice tone="success" live="polite" onDismiss={flash.clear} dismissLabel={t('common.close')}>
          <p>{flash.message}</p>
        </Notice>
      )}

      {/* The agent's own description used to be buried inside "Réglages" —
          shown here too so what this agent is for is readable without
          opening the dialog. */}
      <PageHeader
        id="agents-detail-heading"
        title={t('agents.detailHeading', {
          name: agentDisplayName(selectedAgent.name, selectedAgent.builtin, t),
        })}
        {...(identity === null
          ? {}
          : { description: agentSummary(selectedAgent.name, identity.role, t) })}
        actions={
          <>
            <Button
              variant="secondary"
              size="sm"
              disabled={toggling}
              onClick={() => void toggleEnabled(selectedAgent)}
            >
              {selectedAgent.enabled ? t('agents.disable') : t('agents.enable')}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setSettingsOpen(true)}
              aria-label={t('agents.settings')}
            >
              <SettingsIcon className="size-4" aria-hidden="true" />
              {t('agents.settings')}
            </Button>
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
        <Badge tone={selectedAgent.enabled ? 'success' : 'neutral'}>
          {selectedAgent.enabled ? t('agents.enabled') : t('agents.disabled')}
        </Badge>
        {(selectedAgent.triggers ?? []).map((trigger) =>
          trigger.cron === undefined ? null : (
            <span key={`${trigger.on}-${trigger.cron}`}>
              {t('agents.scheduled', { when: describeCron(trigger.cron, t, i18n.language) })}
            </span>
          ),
        )}
        <span>{providerSentence(selectedAgent, enabledProviders, t)}</span>
      </div>

      {!selectedAgent.enabled && (
        <Notice
          tone="warning"
          actions={
            <Button size="sm" disabled={toggling} onClick={() => void toggleEnabled(selectedAgent)}>
              {t('agents.enable')}
            </Button>
          }
        >
          <p>{t('agents.disabledBanner')}</p>
        </Notice>
      )}

      {/* Fiche feedback: clicking an agent used to land on a long
          configuration page with the chat buried at the bottom. The chat is
          now the page itself; every configuration field moved into the
          "Réglages" modal above, opened on demand rather than always taking
          the whole screen. */}
      {/* A self-contained height, not `h-full`/`flex-1` inherited from an
          ancestor: `.app-shell`'s grid row is only a `min-height` floor
          (shell.css), so it grows to fit content rather than clamping to
          the viewport — `h-full` here resolved to `auto` and the message
          list never had a bounded box to scroll inside, stretching the
          whole page and stranding everything below it. Same fixed-height
          pattern `agent-chat-widget.tsx` already uses for its own panel,
          just roomier for the full page.

          Fiche feedback: a brand-new conversation reserved the same tall
          `70vh` box as a long one, so the empty-state line sat near the top
          with a large blank gap down to the composer — the box now only
          grows to that full height once there is something to scroll. */}
      <div
        className={
          turnCount === 0
            ? 'flex max-h-[42rem] min-h-[14rem] flex-col gap-2'
            : 'flex h-[70vh] max-h-[42rem] min-h-[28rem] flex-col gap-2'
        }
      >
        <AgentChatFeed
          conversation={conversation}
          disabled={!selectedAgent.enabled}
          {...(selectedAgent.enabled ? {} : { disabledHint: t('agents.runDisabledHint') })}
        />
      </div>

      {/* Raw tool-call/audit events — collapsed by default, and each list
          truncated to its most recent entries with its own "afficher tout"
          toggle (fiche feedback: "toujours trop [long]"), since a real site
          quickly accumulates dozens of these and the chat feed above
          already carries a per-turn "outils utilisés" summary for anyone
          who just wants to know what the last message touched. */}
      <details>
        <summary className="cursor-pointer text-sm leading-5 font-semibold">
          {t('agents.technicalLog')}
        </summary>
        <div className="mt-3 flex flex-col gap-6">
          <div>
            <h2 className="m-0 mb-2 text-xs leading-5 font-semibold text-muted-foreground uppercase">
              {t('agents.traces')}
            </h2>
            <ul className="m-0 flex list-none flex-col gap-1 p-0 text-sm">
              {(showAllTraces ? traces : traces.slice(0, TECHNICAL_LOG_PAGE_SIZE)).map((trace) => (
                <li key={trace.id}>
                  {formatDateTime(trace.startedAt, i18n.language)} —{' '}
                  {t(`agents.stopReason.${trace.stopReason}`, { defaultValue: trace.stopReason })}
                  {trace.usage.inputTokens + trace.usage.outputTokens > 0 &&
                    ` — ${t('agents.traceTokens', {
                      count: trace.usage.inputTokens + trace.usage.outputTokens,
                    })}`}
                </li>
              ))}
              {traces.length === 0 && <li>{t('agents.noTraces')}</li>}
            </ul>
            {!showAllTraces && traces.length > TECHNICAL_LOG_PAGE_SIZE && (
              <Button
                variant="ghost"
                size="sm"
                className="mt-1"
                onClick={() => setShowAllTraces(true)}
              >
                {t('agents.showAll', { count: traces.length })}
              </Button>
            )}
          </div>

          <div>
            <h2 className="m-0 mb-2 text-xs leading-5 font-semibold text-muted-foreground uppercase">
              {t('agents.history')}
            </h2>
            <ul className="m-0 flex list-none flex-col gap-1 p-0 text-sm">
              {(showAllHistory ? history : history.slice(0, TECHNICAL_LOG_PAGE_SIZE)).map(
                (entry) => (
                  <li key={entry.id}>
                    {formatDateTime(entry.at, i18n.language)} — {historyAction(entry.action, t)}
                  </li>
                ),
              )}
              {history.length === 0 && <li>{t('agents.noHistory')}</li>}
            </ul>
            {!showAllHistory && history.length > TECHNICAL_LOG_PAGE_SIZE && (
              <Button
                variant="ghost"
                size="sm"
                className="mt-1"
                onClick={() => setShowAllHistory(true)}
              >
                {t('agents.showAll', { count: history.length })}
              </Button>
            )}
          </div>
        </div>
      </details>

      <Modal
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        title={t('agents.settingsTitle', {
          name: agentDisplayName(selectedAgent.name, selectedAgent.builtin, t),
        })}
        closeLabel={t('agents.settingsClose')}
        className="w-[min(52rem,calc(100vw-2rem))]"
        footer={
          editing ? (
            <>
              <Button variant="ghost" onClick={() => setEditing(false)}>
                {t('common.cancel')}
              </Button>
              <Button disabled={saving} onClick={() => void submitEdit(selectedAgent)}>
                {t('common.save')}
              </Button>
            </>
          ) : (
            <>
              {!selectedAgent.builtin && (
                <Button
                  variant="destructive"
                  disabled={saving}
                  onClick={() => setConfirmRemoval(true)}
                >
                  {t('agents.remove')}
                </Button>
              )}
              <Button onClick={() => void startEditing(selectedAgent)}>{t('agents.edit')}</Button>
            </>
          )
        }
      >
        {detailLoading && <p>{t('common.loading')}</p>}

        {!detailLoading && editing && (
          <div className="flex flex-col gap-3">
            <Card aria-labelledby="agent-edit-identity-heading">
              <CardHeader>
                <CardTitle>
                  <h3 id="agent-edit-identity-heading">{t('agents.identityHeading')}</h3>
                </CardTitle>
              </CardHeader>
              <CardBody>
                {/* The instructions of an agent Cogenta ships are written for
                    the model, in English: say so, and say what they amount to. */}
                {selectedAgent.builtin === true &&
                  identity !== null &&
                  agentSummary(selectedAgent.name, identity.role, t) !== identity.role && (
                    <Notice tone="info">
                      <p>{agentSummary(selectedAgent.name, identity.role, t)}</p>
                      <p>{t('agents.identityEnglishNote')}</p>
                    </Notice>
                  )}
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
              </CardBody>
            </Card>

            <Card aria-labelledby="agent-edit-model-heading">
              <CardHeader>
                <CardTitle>
                  <h3 id="agent-edit-model-heading">{t('agents.model')}</h3>
                </CardTitle>
              </CardHeader>
              <CardBody>
                <div className="grid grid-cols-1 items-start gap-3 sm:grid-cols-2 lg:grid-cols-3">
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
                        <option value={AUTOMATIC_PROVIDER}>{t('agents.providerAutomatic')}</option>
                        {providers.map((provider) => (
                          <option key={provider.provider} value={provider.provider}>
                            {provider.enabled
                              ? provider.provider
                              : t('agents.providerDisabledOption', { provider: provider.provider })}
                          </option>
                        ))}
                      </Select>
                    )}
                  </Field>
                  {edit.modelPreferred !== AUTOMATIC_PROVIDER &&
                    (editCatalogEntry?.knownModels.length ?? 0) > 0 && (
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
                  {edit.modelPreferred !== AUTOMATIC_PROVIDER && (
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
                  )}
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
                  <Field
                    label={t('agents.budgetMetricTokensPerDay')}
                    description={t('agents.budgetFieldHint')}
                    error={budgetError('tokensPerDay')}
                  >
                    {(control) => (
                      <Input
                        {...control}
                        type="number"
                        min={0}
                        step={1}
                        value={edit.tokensPerDay}
                        onChange={(event) => setEdit({ ...edit, tokensPerDay: event.target.value })}
                      />
                    )}
                  </Field>
                  <Field
                    label={t('agents.budgetMetricEurPerMonth')}
                    description={t('agents.budgetFieldHint')}
                    error={budgetError('eurPerMonth')}
                  >
                    {(control) => (
                      <Input
                        {...control}
                        type="number"
                        min={0}
                        step="any"
                        value={edit.eurPerMonth}
                        onChange={(event) => setEdit({ ...edit, eurPerMonth: event.target.value })}
                      />
                    )}
                  </Field>
                  <Field
                    label={t('agents.budgetMetricCallsPerHour')}
                    description={t('agents.budgetFieldHint')}
                    error={budgetError('callsPerHour')}
                  >
                    {(control) => (
                      <Input
                        {...control}
                        type="number"
                        min={0}
                        step={1}
                        value={edit.callsPerHour}
                        onChange={(event) => setEdit({ ...edit, callsPerHour: event.target.value })}
                      />
                    )}
                  </Field>
                </div>
                {/* Only for an agent that can actually draw: everyone else has
                    no image model to care about. */}
                {edit.tools.includes('assist.generate_image') && imageStatus !== null && (
                  <div className="mt-3">
                    <Notice tone={imageStatus.available ? 'info' : 'warning'}>
                      <p>
                        {imageStatus.available
                          ? t('agents.imageModelResolved', {
                              model: imageStatus.model ?? '',
                              provider: imageStatus.provider ?? '',
                            })
                          : t('agents.imageModelMissing')}
                      </p>
                      <p>
                        <Link to="/providers">{t('agents.imageModelLink')}</Link>
                      </p>
                    </Notice>
                  </div>
                )}
              </CardBody>
            </Card>

            <Card aria-labelledby="agent-edit-permissions-heading">
              <CardHeader>
                <CardTitle>
                  <h3 id="agent-edit-permissions-heading">{t('agents.permissions')}</h3>
                </CardTitle>
              </CardHeader>
              <CardBody>
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
                        <label htmlFor={inputId} title={permission}>
                          {toolName(permission, t)}
                        </label>
                      </li>
                    )
                  })}
                </ul>
              </CardBody>
            </Card>

            {(skillOptions.length > 0 || otherAgentNames.length > 0) && (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {skillOptions.length > 0 && (
                  <Card aria-labelledby="agent-edit-skills-heading">
                    <CardHeader>
                      <CardTitle>
                        <h3 id="agent-edit-skills-heading">{t('agents.skills')}</h3>
                      </CardTitle>
                    </CardHeader>
                    <CardBody>
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
                              <label htmlFor={inputId}>{skillDisplayName(skill, t)}</label>
                            </li>
                          )
                        })}
                      </ul>
                    </CardBody>
                  </Card>
                )}

                {otherAgentNames.length > 0 && (
                  <Card aria-labelledby="agent-edit-subagents-heading">
                    <CardHeader>
                      <CardTitle>
                        <h3 id="agent-edit-subagents-heading">{t('agents.subagents')}</h3>
                      </CardTitle>
                    </CardHeader>
                    <CardBody>
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
                                  setEdit({
                                    ...edit,
                                    subagents: toggleIn(edit.subagents, otherName),
                                  })
                                }
                              />
                              <label htmlFor={inputId}>{agentName(otherName)}</label>
                            </li>
                          )
                        })}
                      </ul>
                    </CardBody>
                  </Card>
                )}
              </div>
            )}
          </div>
        )}

        {!detailLoading && !editing && (
          <div className="flex flex-col gap-3">
            <Card aria-labelledby="agent-settings-identity-heading">
              <CardHeader>
                <CardTitle>
                  <h3 id="agent-settings-identity-heading">{t('agents.identityHeading')}</h3>
                </CardTitle>
              </CardHeader>
              <CardBody>
                {identity === null ? (
                  <p className="m-0 text-sm">{t('common.loading')}</p>
                ) : (
                  <div className="flex flex-col gap-2 text-sm">
                    {/* A built-in agent's identity is written for the model, in
                        English, with tool names: the person reads the shipped
                        summary in their language first, the instructions on
                        demand. An edited identity is the owner's own words. */}
                    {agentSummary(selectedAgent.name, identity.role, t) !== identity.role && (
                      <p className="m-0">{agentSummary(selectedAgent.name, identity.role, t)}</p>
                    )}
                    <details
                      className="rounded-md border border-border px-3 py-2"
                      {...(agentSummary(selectedAgent.name, identity.role, t) === identity.role
                        ? { open: true }
                        : {})}
                    >
                      <summary className="cursor-pointer font-medium">
                        {t('agents.identityForModel')}
                      </summary>
                      <div className="mt-2 flex flex-col gap-2">
                        <p className="m-0">{identity.role}</p>
                        {identity.objectives.length > 0 && (
                          <ul className="m-0 list-disc pl-5">
                            {identity.objectives.map((objective) => (
                              <li key={objective}>{objective}</li>
                            ))}
                          </ul>
                        )}
                        {identity.style !== undefined && (
                          <p className="m-0 border-t border-border pt-2 text-muted-foreground">
                            {t('agents.identityStyle')}: {identity.style}
                          </p>
                        )}
                        {identity.systemPrompt !== undefined && (
                          <div className="border-t border-border pt-2">
                            <p className="m-0 font-medium">{t('agents.identitySystemPrompt')}</p>
                            <p className="m-0 whitespace-pre-wrap text-muted-foreground">
                              {identity.systemPrompt}
                            </p>
                          </div>
                        )}
                      </div>
                    </details>
                  </div>
                )}
              </CardBody>
            </Card>

            {/* Model + autonomy side by side — two short facts that used to
                each take a full-width section for one line of text. */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Card aria-labelledby="agent-settings-model-heading">
                <CardHeader>
                  <CardTitle>
                    <h3 id="agent-settings-model-heading">{t('agents.model')}</h3>
                  </CardTitle>
                </CardHeader>
                <CardBody>
                  <p className="m-0 text-sm">{providerSentence(selectedAgent, enabledProviders, t)}</p>
                  {selectedAgent.model?.model !== undefined &&
                    selectedAgent.model.preferred !== AUTOMATIC_PROVIDER && (
                      <p className="m-0 mt-1 text-sm text-muted-foreground">
                        {t('agents.modelExplicit', { model: selectedAgent.model.model })}
                      </p>
                    )}
                </CardBody>
              </Card>

              <Card aria-labelledby="agent-settings-autonomy-heading">
                <CardHeader>
                  <CardTitle>
                    <h3 id="agent-settings-autonomy-heading">{t('agents.autonomy')}</h3>
                  </CardTitle>
                </CardHeader>
                <CardBody>
                  <p className="m-0 text-sm">
                    {t('agents.autonomyDefault', {
                      level: t(
                        `agents.autonomyLevel.${LEVEL_TO_UI[selectedAgent.autonomy?.default ?? ''] ?? 'co-pilot'}`,
                      ),
                    })}
                  </p>
                </CardBody>
              </Card>
            </div>

            <Card aria-labelledby="agent-settings-budget-heading">
              <CardHeader>
                <CardTitle>
                  <h3 id="agent-settings-budget-heading">{t('agents.budgetDetail')}</h3>
                </CardTitle>
              </CardHeader>
              <CardBody>
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
                          {selectedAgent.budget?.tokensPerDay === undefined
                            ? t('agents.budgetNoLimit')
                            : number.format(selectedAgent.budget.tokensPerDay)}
                        </TableCell>
                        <TableCell>{number.format(selectedAgent.usage?.tokensToday ?? 0)}</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell>{t('agents.budgetMetricEurPerMonth')}</TableCell>
                        <TableCell>
                          {selectedAgent.budget?.eurPerMonth === undefined
                            ? t('agents.budgetNoLimit')
                            : number.format(selectedAgent.budget.eurPerMonth)}
                        </TableCell>
                        <TableCell>{number.format(selectedAgent.usage?.eurThisMonth ?? 0)}</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell>{t('agents.budgetMetricCallsPerHour')}</TableCell>
                        <TableCell>
                          {selectedAgent.budget?.callsPerHour === undefined
                            ? t('agents.budgetNoLimit')
                            : number.format(selectedAgent.budget.callsPerHour)}
                        </TableCell>
                        <TableCell>{number.format(selectedAgent.usage?.callsThisHour ?? 0)}</TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </TableRoot>
              </CardBody>
            </Card>

            <Card aria-labelledby="agent-settings-permissions-heading">
              <CardHeader>
                <CardTitle>
                  <h3 id="agent-settings-permissions-heading">{t('agents.permissions')}</h3>
                </CardTitle>
              </CardHeader>
              <CardBody>
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
                        <label htmlFor={inputId} title={permission}>
                          {toolName(permission, t)}
                        </label>
                      </li>
                    )
                  })}
                </ul>
              </CardBody>
            </Card>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Card aria-labelledby="agent-settings-skills-heading">
                <CardHeader>
                  <CardTitle>
                    <h3 id="agent-settings-skills-heading">{t('agents.skills')}</h3>
                  </CardTitle>
                </CardHeader>
                <CardBody>
                  <ul className="m-0 flex list-none flex-col gap-1 p-0 text-sm">
                    {(selectedAgent.skills ?? []).map((skillId) => (
                      <li key={skillId}>
                        {(() => {
                          const skill = skillOptions.find((candidate) => candidate.id === skillId)
                          return skill === undefined ? skillId : skillDisplayName(skill, t)
                        })()}
                      </li>
                    ))}
                    {(selectedAgent.skills === undefined || selectedAgent.skills.length === 0) && (
                      <li>{t('agents.noSkills')}</li>
                    )}
                  </ul>
                </CardBody>
              </Card>

              <Card aria-labelledby="agent-settings-subagents-heading">
                <CardHeader>
                  <CardTitle>
                    <h3 id="agent-settings-subagents-heading">{t('agents.subagents')}</h3>
                  </CardTitle>
                </CardHeader>
                <CardBody>
                  <ul className="m-0 flex list-none flex-col gap-1 p-0 text-sm">
                    {(selectedAgent.subagents ?? []).map((subagent) => (
                      <li key={subagent}>{agentName(subagent)}</li>
                    ))}
                    {(selectedAgent.subagents === undefined ||
                      selectedAgent.subagents.length === 0) && <li>{t('agents.noSubagents')}</li>}
                  </ul>
                </CardBody>
              </Card>
            </div>
          </div>
        )}
      </Modal>

      <ConfirmAction
        open={confirmRemoval}
        title={t('agents.removeTitle', { name: selectedAgent.name })}
        confirmLabel={t('agents.removeConfirm')}
        busy={saving}
        onCancel={() => setConfirmRemoval(false)}
        onConfirm={() => void submitRemove(selectedAgent)}
      >
        <p className="m-0">{t('agents.removeBody')}</p>
      </ConfirmAction>
    </section>
  )
}
