import {
  type ChangeEvent,
  type DragEvent,
  type FormEvent,
  type JSX,
  type KeyboardEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useSearchParams } from 'react-router'
import { ApiError } from '../api/client.js'
import { getSitePlan } from '../api/site-plan-client.js'
import {
  type AvailableTheme,
  getTheme,
  getThemeGenerateJob,
  saveThemeOverrides,
  startThemeGenerateJob,
  startThemeRefineJob,
  type ThemeConversationTurn,
  type ThemeGenerateCandidate,
  type ThemeGenerateProgressEvent,
  type ThemeState,
  toGenerateThemeAttachment,
} from '../api/theme-client.js'
import { checkSandboxDeployment, deploySandbox } from '../api/theme-sandbox-client.js'
import { useAuth } from '../auth/auth-context.js'
import {
  ActivityLog,
  Button,
  buttonVariants,
  Card,
  CardBody,
  CardDescription,
  CardHeader,
  CardTitle,
  classifyActivityMessage,
  Field,
  Notice,
  useSavedIndicator,
} from '../ui/index.js'
import { type ReferenceImage, ThemePreviewPanel } from './theme-generator-panel.js'

/**
 * The full-page "Generate a theme" workshop, as a *conversation*.
 *
 * The product owner's own words for what this screen has to be: the AI
 * generates, the user tries it, then asks for this or that adjustment, the AI
 * does it and reports back — and the preview stays on screen and updates as
 * it goes. So this is not a form with results underneath it any more. It is
 * two halves: a discussion on the left (what was asked, what the agent
 * answered, what it is doing right now) and a preview on the right that never
 * leaves and re-renders after every turn.
 *
 * The first message stays as simple as the old form was — a description, a
 * drop zone, one button — because someone arriving here has nothing to
 * continue from. Everything after it is a composer at the bottom of the
 * discussion, attachments included, exactly like any chat.
 *
 * Two entry modes, one screen, decided by whether `?baseline=` is present in
 * the URL rather than by two separate routes: `appearance.tsx` links here two
 * ways — a plain link for "generate new", and a second link carrying
 * `?baseline=<active theme name>` for "customize what's running". The choice
 * is frozen once the conversation has started: changing what a discussion was
 * about halfway through it is not a thing that can mean anything.
 */

/** How often the generation job is polled while it runs — see `use-agent-conversation.ts`'s identical constant for the same reasoning. */
const JOB_POLL_INTERVAL_MS = 500

type ErrorState = { readonly message: string; readonly hint?: string }

function toErrorState(caught: unknown, fallback: string): ErrorState {
  return caught instanceof ApiError
    ? { message: caught.message, ...(caught.hint === undefined ? {} : { hint: caught.hint }) }
    : { message: fallback }
}

function labelFor(availableThemes: readonly AvailableTheme[], name: string): string {
  return availableThemes.find((candidate) => candidate.name === name)?.label ?? name
}

/** What the operator said, plus whatever they attached while saying it. */
interface UserTurn {
  readonly id: string
  readonly role: 'user'
  readonly text: string
  readonly attachmentNames: readonly string[]
}

/** One agent reply, from the moment it starts running to whatever it ends up being. */
interface AgentTurn {
  readonly id: string
  readonly role: 'agent'
  readonly status: 'running' | 'done' | 'failed'
  readonly events: readonly ThemeGenerateProgressEvent[]
  readonly candidates: readonly ThemeGenerateCandidate[]
  readonly warnings: readonly string[]
  readonly error: ErrorState | null
}

type Turn = UserTurn | AgentTurn

/** The human-readable half of a turn — what the refinement route is told about the conversation so far, never the tool trace. */
function toConversationTurn(turn: Turn): ThemeConversationTurn | null {
  if (turn.role === 'user') return { role: 'user', message: turn.text }
  const spoken = turn.candidates
    .map((candidate) => candidate.summary ?? candidate.rationale)
    .filter((text) => text.trim() !== '')
    .join('\n\n')
  return spoken === '' ? null : { role: 'agent', message: spoken }
}

export function ThemeGeneratorRoute(): JSX.Element {
  const { t } = useTranslation()
  const auth = useAuth()
  const token = auth.state.status === 'authenticated' ? auth.state.token : null
  const roles = auth.state.status === 'authenticated' ? auth.state.user.roles : []
  const isAdmin = roles.includes('admin')

  const [searchParams, setSearchParams] = useSearchParams()
  const baselineThemeName = searchParams.get('baseline')
  const mode: 'generate' | 'customize' = baselineThemeName === null ? 'generate' : 'customize'

  const [theme, setTheme] = useState<ThemeState | null>(null)
  const [loadError, setLoadError] = useState<ErrorState | null>(null)

  const load = useCallback(async () => {
    if (token === null || !isAdmin) return
    try {
      const data = await getTheme(token)
      setTheme(data)
      setLoadError(null)
    } catch (caught) {
      setLoadError(toErrorState(caught, t('themeGenerator.loadError')))
    }
  }, [token, isAdmin, t])

  useEffect(() => {
    void load()
  }, [load])

  const activeThemeName = theme?.overrides.activeTheme ?? '@cogenta/theme-canonical'
  const availableThemes = theme?.availableThemes ?? []

  const [turns, setTurns] = useState<readonly Turn[]>([])
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)

  /**
   * Arriving from a site plan (`?plan=<id>`), the first message starts written.
   *
   * The two halves of "the AI builds my site" were watertight: `/create-site`
   * analysed a brief — what the activity is, who it is for, how it should
   * sound — and the theme workshop then asked the same operator to describe
   * their site again, from scratch, in a blank box. This carries the analysed
   * brief across as an editable starting point.
   *
   * The uploaded documents themselves do not come with it: a plan stores the
   * brief it derived, not the files it derived it from. A reference
   * screenshot is therefore attached here, in the drop zone, which is also
   * where it belongs — the plan never needed it.
   */
  const planId = searchParams.get('plan')
  const [planBrief, setPlanBrief] = useState<string | null>(null)
  const planApplied = useRef(false)

  useEffect(() => {
    if (token === null || !isAdmin || planId === null || planApplied.current) return
    planApplied.current = true
    void (async () => {
      try {
        const plan = await getSitePlan(token, planId)
        const brief = plan.draft.brief
        const description = [
          brief.activity,
          brief.audience === undefined
            ? ''
            : t('themeGenerator.fromPlanAudience', { audience: brief.audience }),
          brief.tone === undefined ? '' : t('themeGenerator.fromPlanTone', { tone: brief.tone }),
          brief.summary,
        ]
          .map((line) => line.trim())
          .filter((line) => line !== '')
          .join('\n')
        if (description === '') return
        setDraft((current) => (current === '' ? description : current))
        setPlanBrief(description)
      } catch {
        // A plan that no longer exists is not a reason to refuse the
        // workshop: the operator can still describe a theme themselves.
      }
    })()
  }, [token, isAdmin, planId, t])

  /** Everything the last settled turn produced, and which of it the preview is showing. */
  const [candidates, setCandidates] = useState<readonly ThemeGenerateCandidate[]>([])
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null)

  const [activating, setActivating] = useState(false)
  const [activateError, setActivateError] = useState<ErrorState | null>(null)
  const [activatedId, setActivatedId] = useState<string | null>(null)
  const activatedIndicator = useSavedIndicator()

  const started = turns.length > 0

  function switchToGenerateNew(): void {
    const params = new URLSearchParams(searchParams)
    params.delete('baseline')
    setSearchParams(params)
  }

  function switchToCustomizeCurrent(): void {
    const params = new URLSearchParams(searchParams)
    params.set('baseline', activeThemeName)
    setSearchParams(params)
  }

  /**
   * Attachments, in two lives. `pending` is what the composer is about to
   * send; `references` is everything ever attached in this conversation, kept
   * so the comparison view still has the mockup from three turns ago to put
   * beside the current render.
   *
   * Object URLs are minted by hand rather than in an effect keyed on the file
   * list: an effect would revoke the URL of a file the moment it leaves
   * `pending`, which is exactly when `references` starts needing it. Every URL
   * this screen creates is tracked and revoked at unmount; jsdom implements
   * neither call, hence the guards.
   */
  const createdUrls = useRef<string[]>([])
  const [pending, setPending] = useState<readonly { readonly file: File; readonly url: string }[]>(
    [],
  )
  const [references, setReferences] = useState<readonly ReferenceImage[]>([])
  const [dragging, setDragging] = useState(false)

  useEffect(
    () => () => {
      if (typeof URL.revokeObjectURL !== 'function') return
      for (const url of createdUrls.current) URL.revokeObjectURL(url)
      createdUrls.current = []
    },
    [],
  )

  function objectUrlFor(file: File): string {
    if (!file.type.startsWith('image/') || typeof URL.createObjectURL !== 'function') return ''
    const url = URL.createObjectURL(file)
    createdUrls.current.push(url)
    return url
  }

  function addFiles(files: readonly File[]): void {
    if (files.length === 0) return
    setPending((current) => [
      ...current,
      ...files.map((file) => ({ file, url: objectUrlFor(file) })),
    ])
  }

  function onFilesSelected(event: ChangeEvent<HTMLInputElement>): void {
    addFiles([...(event.target.files ?? [])])
    // Reset the control so re-picking the same file still fires `change`.
    event.target.value = ''
  }

  function onDrop(event: DragEvent<HTMLLabelElement>): void {
    event.preventDefault()
    setDragging(false)
    if (busy) return
    addFiles([...(event.dataTransfer?.files ?? [])])
  }

  function removeAttachment(index: number): void {
    setPending((current) => current.filter((_entry, at) => at !== index))
  }

  const feedRef = useRef<HTMLOListElement>(null)
  useEffect(() => {
    // jsdom implements neither `scrollTo` on elements nor smooth behaviour —
    // optional-chain the method itself, the same guard `agent-chat-feed.tsx`
    // and `activity-log.tsx` already needed.
    feedRef.current?.scrollTo?.({ top: feedRef.current.scrollHeight })
  }, [])

  function patchAgentTurn(id: string, patch: Partial<AgentTurn>): void {
    setTurns((current) =>
      current.map((turn) =>
        turn.role === 'agent' && turn.id === id ? { ...turn, ...patch } : turn,
      ),
    )
  }

  /**
   * What a follow-up continues from — the candidate the preview is currently
   * showing, in whichever shape it has.
   *
   * Both shapes refine. A custom layout is re-read from its sandbox; a token
   * candidate has no sandbox, so what it continues from is its own current
   * token values, sent as the baseline. The product owner's own words for why
   * this matters: "au prochain tour on ne doit pas repartir du début… si on
   * repart du début on va avoir à chaque fois un résultat différent." Only
   * the very first message of a conversation generates.
   */
  const selectedCandidate =
    candidates.find((entry) => entry.id === selectedCandidateId) ?? candidates[0] ?? null

  async function send(event?: FormEvent): Promise<void> {
    event?.preventDefault()
    const message = draft.trim()
    if (token === null || message === '' || busy) return

    const sent = pending
    const priorTurns = turns
    setDraft('')
    setPending([])
    setReferences((current) => [
      ...current,
      ...sent
        .filter((entry) => entry.url !== '')
        .map((entry) => ({ name: entry.file.name, url: entry.url })),
    ])

    const stamp = String(Date.now())
    const agentTurnId = `agent-${stamp}`
    setTurns((current) => [
      ...current,
      {
        id: `user-${stamp}`,
        role: 'user',
        text: message,
        attachmentNames: sent.map((entry) => entry.file.name),
      },
      {
        id: agentTurnId,
        role: 'agent',
        status: 'running',
        events: [],
        candidates: [],
        warnings: [],
        error: null,
      },
    ])
    setBusy(true)

    try {
      const attachments = await Promise.all(
        sent.map((entry) => toGenerateThemeAttachment(entry.file)),
      )
      const previousTurns = priorTurns
        .map(toConversationTurn)
        .filter((turn): turn is ThemeConversationTurn => turn !== null)

      const { jobId } =
        selectedCandidate === null
          ? await startThemeGenerateJob(token, {
              description: message,
              ...(attachments.length === 0 ? {} : { attachments }),
              ...(mode === 'customize' && baselineThemeName !== null
                ? { baseline: { themeName: baselineThemeName } }
                : {}),
            })
          : await startThemeRefineJob(token, {
              ...(selectedCandidate.kind === 'sandbox'
                ? { sandboxId: selectedCandidate.sandboxId }
                : {
                    baseline: {
                      tokens: selectedCandidate.tokens,
                      ...(selectedCandidate.themeName === undefined
                        ? {}
                        : { themeName: selectedCandidate.themeName }),
                    },
                  }),
              message,
              ...(attachments.length === 0 ? {} : { attachments }),
              ...(previousTurns.length === 0 ? {} : { previousTurns }),
            })

      for (;;) {
        const job = await getThemeGenerateJob(token, jobId)
        patchAgentTurn(agentTurnId, { events: job.events })
        if (job.status === 'running') {
          await new Promise((resolve) => setTimeout(resolve, JOB_POLL_INTERVAL_MS))
          continue
        }
        if (job.status === 'failed') {
          patchAgentTurn(agentTurnId, {
            status: 'failed',
            error: { message: job.error?.message ?? t('themeGenerator.generateError') },
          })
          break
        }
        const produced = job.result?.candidates ?? []
        patchAgentTurn(agentTurnId, {
          status: 'done',
          candidates: produced,
          warnings: job.result?.warnings ?? [],
        })
        if (produced.length > 0) {
          setCandidates(produced)
          setSelectedCandidateId(produced[0]?.id ?? null)
          setActivatedId(null)
        }
        break
      }
    } catch (caught) {
      // Reported inside the turn it belongs to, and only there: a second
      // copy under the composer would say the same sentence twice, which is
      // how a duplicated accessible name starts.
      patchAgentTurn(agentTurnId, {
        status: 'failed',
        error: toErrorState(caught, t('themeGenerator.generateError')),
      })
    } finally {
      setBusy(false)
    }
  }

  function onComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      void send()
    }
  }

  async function activate(
    candidate: ThemeGenerateCandidate,
    themeName: string | null,
  ): Promise<void> {
    if (token === null) return
    setActivating(true)
    setActivateError(null)
    try {
      if (candidate.kind === 'sandbox') {
        // A custom-layout candidate has no tokens to overlay — activating it
        // means promoting its sandbox into themes/ (the same deploy pipeline
        // the "Gérer les thèmes locaux" screen's own "Déployer" button uses)
        // and then pointing the site at it, exactly like every other switch.
        const chosenName = themeName ?? candidate.sandboxId
        const check = await checkSandboxDeployment(token, candidate.sandboxId, chosenName)
        if (!check.ok) {
          setActivateError({
            message: check.reasons.join(' ') || t('themeGenerator.activateError'),
          })
          return
        }
        const deployed = await deploySandbox(token, candidate.sandboxId, chosenName)
        if (!deployed.ok) {
          setActivateError({
            message: deployed.reasons.join(' ') || t('themeGenerator.activateError'),
          })
          return
        }
        await saveThemeOverrides(token, { activeTheme: chosenName })
      } else {
        // Wholesale, not a diff: contract D tokens are opaque here, and the
        // gallery's own "choose an AI candidate" flow never diffed against the
        // file either. `activeTheme` is only sent when the candidate names
        // one: omitting the key (not sending `null`) is what `PUT
        // /api/theme/overrides` reads as "leave the active theme alone".
        await saveThemeOverrides(token, {
          tokenOverrides: candidate.tokens,
          ...(candidate.themeName === undefined ? {} : { activeTheme: candidate.themeName }),
        })
      }
      setActivatedId(candidate.id)
      activatedIndicator.show()
      await load()
    } catch (caught) {
      setActivateError(toErrorState(caught, t('themeGenerator.activateError')))
    } finally {
      setActivating(false)
    }
  }

  const baselineLabel =
    baselineThemeName === null ? null : labelFor(availableThemes, baselineThemeName)

  if (!isAdmin) {
    return (
      <section aria-labelledby="theme-generator-heading">
        <h1 id="theme-generator-heading">{t('themeGenerator.heading')}</h1>
        <p role="alert">{t('themeGenerator.adminOnly')}</p>
      </section>
    )
  }

  return (
    <section aria-labelledby="theme-generator-heading" className="flex flex-col gap-6">
      <div>
        <h1
          id="theme-generator-heading"
          className="m-0 text-2xl leading-tight font-bold tracking-tight"
        >
          {t('themeGenerator.heading')}
        </h1>
        <p className="text-muted-foreground text-sm">{t('themeGenerator.intro')}</p>
      </div>

      {loadError !== null && (
        <Notice tone="danger" live="assertive">
          <p>{loadError.message}</p>
          {loadError.hint !== undefined && <p>{loadError.hint}</p>}
        </Notice>
      )}

      {theme !== null && !theme.aiAvailable && (
        <Notice
          tone="info"
          actions={
            <Link to="/providers" className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
              {t('themeGenerator.noProviderAction')}
            </Link>
          }
        >
          <p>{t('themeGenerator.noProviderNotice')}</p>
        </Notice>
      )}

      {theme?.aiAvailable && (
        <>
          <fieldset className="m-0 flex flex-wrap items-center gap-2 border-none p-0">
            <legend className="sr-only">{t('themeGenerator.modeGroupLabel')}</legend>
            <Button
              type="button"
              variant={mode === 'generate' ? 'primary' : 'secondary'}
              aria-pressed={mode === 'generate'}
              disabled={started}
              onClick={switchToGenerateNew}
            >
              {t('themeGenerator.modeGenerateAction')}
            </Button>
            <Button
              type="button"
              variant={mode === 'customize' ? 'primary' : 'secondary'}
              aria-pressed={mode === 'customize'}
              disabled={started}
              onClick={switchToCustomizeCurrent}
            >
              {t('themeGenerator.modeCustomizeAction')}
            </Button>
          </fieldset>

          <Notice tone="info" live="off">
            <p>
              {mode === 'customize'
                ? t('themeGenerator.modeCustomizeNote', {
                    theme: baselineLabel ?? labelFor(availableThemes, activeThemeName),
                  })
                : t('themeGenerator.modeGenerateNote')}
            </p>
          </Notice>

          {planBrief !== null && !started && (
            <Notice tone="info" live="off">
              <p>{t('themeGenerator.fromPlanNote')}</p>
            </Notice>
          )}

          <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
            <Card aria-labelledby="theme-generator-form-heading" className="flex flex-col">
              <CardHeader>
                <CardTitle>
                  <h2 id="theme-generator-form-heading">
                    {started
                      ? t('themeGenerator.conversationHeading')
                      : t('themeGenerator.formHeading')}
                  </h2>
                </CardTitle>
                <CardDescription>
                  {started ? t('themeGenerator.conversationHelp') : t('themeGenerator.formHelp')}
                </CardDescription>
              </CardHeader>
              <CardBody className="flex flex-col gap-4">
                {started && (
                  <ol
                    ref={feedRef}
                    aria-label={t('themeGenerator.conversationLabel')}
                    className="m-0 flex max-h-[32rem] list-none flex-col gap-3 overflow-y-auto p-0"
                  >
                    {turns.map((turn) =>
                      turn.role === 'user' ? (
                        <UserMessage key={turn.id} turn={turn} />
                      ) : (
                        <AgentMessage key={turn.id} turn={turn} />
                      ),
                    )}
                  </ol>
                )}

                <form onSubmit={(event) => void send(event)} className="flex flex-col gap-4">
                  {started ? (
                    <textarea
                      aria-label={t('themeGenerator.followUpLabel')}
                      rows={3}
                      className="w-full resize-none appearance-none rounded-md border border-input bg-card px-3 py-2 font-sans text-sm text-card-foreground shadow-card"
                      value={draft}
                      placeholder={t('themeGenerator.followUpPlaceholder')}
                      disabled={busy}
                      onChange={(event) => setDraft(event.target.value)}
                      onKeyDown={onComposerKeyDown}
                    />
                  ) : (
                    <Field label={t('themeGenerator.descriptionLabel')}>
                      {(control) => (
                        <textarea
                          {...control}
                          rows={4}
                          className="w-full appearance-none rounded-md border border-input bg-card px-3 py-2 font-sans text-sm text-card-foreground shadow-card"
                          value={draft}
                          placeholder={t('themeGenerator.descriptionPlaceholder')}
                          disabled={busy}
                          onChange={(event) => setDraft(event.target.value)}
                        />
                      )}
                    </Field>
                  )}

                  <div className="flex flex-col gap-2">
                    {/* The whole drop zone is the label: clicking anywhere in it opens the file picker, and the real input below stays `sr-only` but keeps its own accessible name. */}
                    <label
                      htmlFor="theme-generator-attachments"
                      onDragOver={(event) => {
                        event.preventDefault()
                        setDragging(true)
                      }}
                      onDragLeave={() => setDragging(false)}
                      onDrop={onDrop}
                      className={`flex cursor-pointer flex-col gap-1 rounded-md border-2 border-dashed p-4 text-center ${
                        dragging ? 'border-primary bg-accent' : 'border-border bg-muted/40'
                      }`}
                    >
                      <span className="text-sm font-medium text-foreground">
                        {t('themeGenerator.attachmentsLabel')}
                      </span>
                      <span className="text-xs leading-5 text-muted-foreground">
                        {t('themeGenerator.attachmentsDropHint')}
                      </span>
                      <input
                        id="theme-generator-attachments"
                        type="file"
                        multiple
                        accept="image/*,.pdf,.doc,.docx"
                        aria-label={t('themeGenerator.attachmentsLabel')}
                        disabled={busy}
                        onChange={onFilesSelected}
                        className="sr-only"
                      />
                    </label>
                    {pending.length > 0 && (
                      <ul className="m-0 grid list-none grid-cols-2 gap-2 p-0 sm:grid-cols-4">
                        {pending.map((entry, index) => (
                          <li
                            key={`${entry.file.name}-${index}`}
                            className="flex flex-col gap-1 rounded-md border border-border bg-card p-2"
                          >
                            {entry.url === '' ? (
                              <span className="flex h-24 items-center justify-center rounded-sm border border-border bg-muted font-mono text-[0.7rem] text-muted-foreground">
                                {entry.file.name.split('.').pop()?.toUpperCase() ?? '—'}
                              </span>
                            ) : (
                              <img
                                src={entry.url}
                                alt={t('themeGenerator.attachmentImageAlt', {
                                  name: entry.file.name,
                                })}
                                className="h-24 w-full rounded-sm border border-border bg-muted object-cover"
                              />
                            )}
                            <span
                              className="truncate text-xs text-muted-foreground"
                              title={entry.file.name}
                            >
                              {entry.file.name}
                            </span>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              disabled={busy}
                              aria-label={t('themeGenerator.removeAttachmentActionFor', {
                                name: entry.file.name,
                              })}
                              onClick={() => removeAttachment(index)}
                            >
                              {t('themeGenerator.removeAttachmentAction')}
                            </Button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  <div>
                    <Button type="submit" disabled={busy || draft.trim() === ''}>
                      {busy
                        ? started
                          ? t('themeGenerator.sending')
                          : t('themeGenerator.generating')
                        : started
                          ? t('themeGenerator.sendAction')
                          : t('themeGenerator.generateAction')}
                    </Button>
                  </div>
                </form>
              </CardBody>
            </Card>

            <div className="flex flex-col gap-4 lg:sticky lg:top-4">
              <ThemePreviewPanel
                token={token ?? ''}
                candidates={candidates}
                selectedId={selectedCandidateId}
                selectCandidate={setSelectedCandidateId}
                activeThemeName={activeThemeName}
                activeThemeLabel={labelFor(availableThemes, activeThemeName)}
                references={references}
                busy={busy}
                activating={activating}
                activated={selectedCandidate !== null && activatedId === selectedCandidate.id}
                activatedIndicatorVisible={activatedIndicator.visible}
                activate={(candidate, themeName) => void activate(candidate, themeName)}
              />

              {activateError !== null && (
                <Notice tone="danger" live="assertive">
                  <p>{activateError.message}</p>
                  {activateError.hint !== undefined && <p>{activateError.hint}</p>}
                </Notice>
              )}
            </div>
          </div>
        </>
      )}
    </section>
  )
}

function UserMessage({ turn }: { readonly turn: UserTurn }): JSX.Element {
  const { t } = useTranslation()
  return (
    <li className="flex justify-end">
      <div className="max-w-[85%] rounded-lg bg-primary px-3 py-2 text-primary-foreground shadow-card">
        <p className="sr-only">{t('themeGenerator.turnUserLabel')}</p>
        <p className="m-0 text-sm whitespace-pre-wrap">{turn.text}</p>
        {turn.attachmentNames.length > 0 && (
          <p className="m-0 mt-1 text-xs opacity-80">
            {t('themeGenerator.turnAttachments', { names: turn.attachmentNames.join(', ') })}
          </p>
        )}
      </div>
    </li>
  )
}

/**
 * One agent turn: what it is doing (the run log, live), then what it said and
 * what it produced. The long `rationale` — a real run has returned several
 * thousand words of it — stays behind a disclosure so the summary above it
 * remains readable.
 */
function AgentMessage({ turn }: { readonly turn: AgentTurn }): JSX.Element {
  const { t } = useTranslation()
  return (
    <li className="flex flex-col gap-2 rounded-lg bg-secondary px-3 py-2 text-secondary-foreground shadow-card">
      <p className="sr-only">{t('themeGenerator.turnAgentLabel')}</p>

      <ActivityLog
        data-testid="theme-generator-progress"
        status={turn.status}
        entries={turn.events.map((event, index) => {
          const classified = classifyActivityMessage(event.message, {
            ...(event.kind === undefined ? {} : { kind: event.kind }),
            ...(event.tool === undefined ? {} : { tool: event.tool }),
          })
          return { id: `${index}-${event.at}`, message: event.message, at: event.at, ...classified }
        })}
        labels={{
          title: t('themeGenerator.progressTitle'),
          running: t('themeGenerator.progressStatusRunning'),
          done: t('themeGenerator.progressStatusDone'),
          failed: t('themeGenerator.progressStatusFailed'),
          empty: t('themeGenerator.progressEmpty'),
          show: t('themeGenerator.progressShow'),
          hide: t('themeGenerator.progressHide'),
          kinds: {
            thinking: t('themeGenerator.progressKindThinking'),
            'tool-start': t('themeGenerator.progressKindToolStart'),
            'tool-success': t('themeGenerator.progressKindToolSuccess'),
            'tool-failure': t('themeGenerator.progressKindToolFailure'),
            info: t('themeGenerator.progressKindInfo'),
          },
        }}
      />

      {turn.error !== null && (
        <Notice tone="danger" live="assertive">
          <p>{turn.error.message}</p>
          {turn.error.hint !== undefined && <p>{turn.error.hint}</p>}
        </Notice>
      )}

      {turn.warnings.map((warning) => (
        <Notice tone="warning" key={warning} live="polite">
          <p>{warning}</p>
        </Notice>
      ))}

      {turn.status === 'done' && turn.candidates.length === 0 && turn.error === null && (
        <p className="m-0 text-sm">{t('themeGenerator.noCandidates')}</p>
      )}

      {turn.candidates.map((candidate) => {
        const label =
          candidate.kind === 'sandbox'
            ? t('themeGenerator.candidateCustomLayoutLabel')
            : candidate.label
        const summary = candidate.summary ?? candidate.rationale
        const hasMore = candidate.summary !== undefined && candidate.rationale !== candidate.summary
        return (
          <div key={candidate.id} className="flex flex-col gap-1">
            {/* Prefixed, never the bare label: the persistent preview panel is
                where a candidate is *named*, and two elements carrying the exact
                same text is how a duplicated accessible name starts. */}
            <strong className="text-sm">{t('themeGenerator.candidateHeading', { label })}</strong>
            <p className="m-0 text-sm leading-5 whitespace-pre-wrap">{summary}</p>
            {hasMore && (
              <details>
                <summary className="cursor-pointer text-xs leading-5 opacity-80">
                  {t('themeGenerator.rationaleShow')}
                </summary>
                <p className="m-0 mt-1 text-xs leading-5 whitespace-pre-wrap">
                  {candidate.rationale}
                </p>
              </details>
            )}
          </div>
        )
      })}
    </li>
  )
}
