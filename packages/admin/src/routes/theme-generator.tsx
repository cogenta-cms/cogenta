import { type ChangeEvent, type JSX, useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useSearchParams } from 'react-router'
import { ApiError } from '../api/client.js'
import {
  type AvailableTheme,
  getTheme,
  getThemeGenerateJob,
  saveThemeOverrides,
  startThemeGenerateJob,
  type ThemeGenerateCandidate,
  type ThemeState,
  toGenerateThemeAttachment,
} from '../api/theme-client.js'
import { checkSandboxDeployment, deploySandbox } from '../api/theme-sandbox-client.js'
import { useAuth } from '../auth/auth-context.js'
import {
  Button,
  buttonVariants,
  Card,
  CardBody,
  CardDescription,
  CardHeader,
  CardTitle,
  Field,
  Notice,
  SavedIndicator,
  useSavedIndicator,
} from '../ui/index.js'
import { ThemeCandidatePreview } from './theme-generator-preview.js'

/**
 * The full-page "Generate a theme" workshop the user asked for verbatim: a
 * page to describe a theme, attach files, get one or more AI-generated
 * candidates to preview and activate — and, the same screen, describe a
 * change to the theme already running rather than starting over.
 *
 * Two entry modes, one screen, decided by whether `?baseline=` is present in
 * the URL rather than by two separate routes: `appearance.tsx` links here
 * two ways — a plain link for "generate new", and a second link carrying
 * `?baseline=<active theme name>` next to the gallery's "Personnaliser"
 * button for "customize what's running" — and this screen also lets the
 * user flip between the two once here, via the two buttons below the
 * heading. Bookmarking either URL reproduces the exact same screen, the
 * same reason `appearance.tsx` itself moved its gallery/customize split onto
 * `?view=`.
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

  const [description, setDescription] = useState('')
  const [attachedFiles, setAttachedFiles] = useState<readonly File[]>([])
  const [candidates, setCandidates] = useState<readonly ThemeGenerateCandidate[] | null>(null)
  const [warnings, setWarnings] = useState<readonly string[]>([])
  const [generating, setGenerating] = useState(false)
  /** Fiche feedback — "je ne sais pas si le traitement est en cours ou pas": the growing log of what the generator is doing right now (choosing a base theme, filling each design direction), rendered while `generating` is `true`. */
  const [progress, setProgress] = useState<readonly string[]>([])
  const [generateError, setGenerateError] = useState<ErrorState | null>(null)

  const [activatingId, setActivatingId] = useState<string | null>(null)
  const [activateError, setActivateError] = useState<ErrorState | null>(null)
  const [activatedId, setActivatedId] = useState<string | null>(null)
  const activatedIndicator = useSavedIndicator()

  function onFilesSelected(event: ChangeEvent<HTMLInputElement>): void {
    setAttachedFiles([...(event.target.files ?? [])])
  }

  function removeAttachment(index: number): void {
    setAttachedFiles((current) => current.filter((_file, at) => at !== index))
  }

  async function generate(): Promise<void> {
    if (token === null || description.trim() === '') return
    setGenerating(true)
    setGenerateError(null)
    setCandidates(null)
    setWarnings([])
    setActivatedId(null)
    setProgress([])
    try {
      const attachments = await Promise.all(attachedFiles.map(toGenerateThemeAttachment))
      const { jobId } = await startThemeGenerateJob(token, {
        description,
        ...(attachments.length === 0 ? {} : { attachments }),
        ...(mode === 'customize' && baselineThemeName !== null
          ? { baseline: { themeName: baselineThemeName } }
          : {}),
      })
      for (;;) {
        const job = await getThemeGenerateJob(token, jobId)
        setProgress(job.events.map((event) => event.message))
        if (job.status === 'running') {
          await new Promise((resolve) => setTimeout(resolve, JOB_POLL_INTERVAL_MS))
          continue
        }
        if (job.status === 'failed') {
          setGenerateError({ message: job.error?.message ?? t('themeGenerator.generateError') })
          break
        }
        if (job.result !== undefined) {
          setCandidates(job.result.candidates)
          setWarnings(job.result.warnings ?? [])
        }
        break
      }
    } catch (caught) {
      setGenerateError(toErrorState(caught, t('themeGenerator.generateError')))
    } finally {
      setGenerating(false)
      setProgress([])
    }
  }

  async function activate(candidate: ThemeGenerateCandidate): Promise<void> {
    if (token === null) return
    setActivatingId(candidate.id)
    setActivateError(null)
    try {
      if (candidate.kind === 'sandbox') {
        // A custom-layout candidate has no tokens to overlay — activating it
        // means promoting its sandbox into themes/ (the same deploy pipeline
        // the "Gérer les thèmes locaux" screen's own "Déployer" button uses)
        // and then pointing the site at it, same as any other theme switch.
        // The sandbox's own id (minted fresh per generation run — never
        // colliding, already a valid lowercase/digits/hyphen name) doubles
        // as the deployed theme's name, so there is nothing further to ask
        // the operator to name.
        const themeName = candidate.sandboxId
        const check = await checkSandboxDeployment(token, candidate.sandboxId, themeName)
        if (!check.ok) {
          setActivateError({
            message: check.reasons.join(' ') || t('themeGenerator.activateError'),
          })
          return
        }
        const deployed = await deploySandbox(token, candidate.sandboxId, themeName)
        if (!deployed.ok) {
          setActivateError({
            message: deployed.reasons.join(' ') || t('themeGenerator.activateError'),
          })
          return
        }
        await saveThemeOverrides(token, { activeTheme: themeName })
      } else {
        // Wholesale, not a diff: contract D tokens are opaque here, and the
        // gallery's own "choose an AI candidate" flow (pre-workshop, in
        // `appearance.tsx`) never diffed against the file either — it replaced
        // the whole draft with the candidate's tokens and left "Enregistrer"
        // to persist it. `activeTheme` is only sent when the candidate names
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
      setActivatingId(null)
    }
  }

  const baselineLabel = useMemo(
    () => (baselineThemeName === null ? null : labelFor(availableThemes, baselineThemeName)),
    [availableThemes, baselineThemeName],
  )

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
              onClick={switchToGenerateNew}
            >
              {t('themeGenerator.modeGenerateAction')}
            </Button>
            <Button
              type="button"
              variant={mode === 'customize' ? 'primary' : 'secondary'}
              aria-pressed={mode === 'customize'}
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

          <Card aria-labelledby="theme-generator-form-heading">
            <CardHeader>
              <CardTitle>
                <h2 id="theme-generator-form-heading">{t('themeGenerator.formHeading')}</h2>
              </CardTitle>
              <CardDescription>{t('themeGenerator.formHelp')}</CardDescription>
            </CardHeader>
            <CardBody className="flex flex-col gap-4">
              <Field label={t('themeGenerator.descriptionLabel')}>
                {(control) => (
                  <textarea
                    {...control}
                    rows={4}
                    className="w-full appearance-none rounded-md border border-input bg-card px-3 py-2 font-sans text-sm text-card-foreground shadow-card"
                    value={description}
                    placeholder={t('themeGenerator.descriptionPlaceholder')}
                    disabled={generating}
                    onChange={(event) => setDescription(event.target.value)}
                  />
                )}
              </Field>

              <div className="flex flex-col gap-2">
                <label htmlFor="theme-generator-attachments" className="text-sm text-foreground">
                  {t('themeGenerator.attachmentsLabel')}
                </label>
                <input
                  id="theme-generator-attachments"
                  type="file"
                  multiple
                  accept="image/*,.pdf,.doc,.docx"
                  disabled={generating}
                  onChange={onFilesSelected}
                />
                {attachedFiles.length > 0 && (
                  <ul className="m-0 flex flex-col gap-1 p-0">
                    {attachedFiles.map((file, index) => (
                      <li
                        key={`${file.name}-${index}`}
                        className="flex items-center justify-between gap-2 text-xs text-muted-foreground"
                      >
                        <span>{file.name}</span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          disabled={generating}
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
                <Button
                  type="button"
                  disabled={generating || description.trim() === ''}
                  onClick={() => void generate()}
                >
                  {generating ? t('themeGenerator.generating') : t('themeGenerator.generateAction')}
                </Button>
              </div>

              {generating && (
                <ul
                  className="m-0 flex list-none flex-col gap-1 p-0 text-xs text-muted-foreground"
                  aria-live="polite"
                  data-testid="theme-generator-progress"
                >
                  {progress.length === 0 ? (
                    <li className="italic">{t('themeGenerator.generating')}</li>
                  ) : (
                    progress.map((message, index) => (
                      <li key={`${index}-${message}`} className="italic">
                        {message}
                      </li>
                    ))
                  )}
                </ul>
              )}

              {generateError !== null && (
                <Notice tone="danger" live="assertive">
                  <p>{generateError.message}</p>
                  {generateError.hint !== undefined && <p>{generateError.hint}</p>}
                </Notice>
              )}

              {warnings.map((warning) => (
                <Notice tone="warning" key={warning} live="polite">
                  <p>{warning}</p>
                </Notice>
              ))}
            </CardBody>
          </Card>

          {activateError !== null && (
            <Notice tone="danger" live="assertive">
              <p>{activateError.message}</p>
              {activateError.hint !== undefined && <p>{activateError.hint}</p>}
            </Notice>
          )}

          {candidates !== null && candidates.length === 0 && (
            <Notice tone="info">
              <p>{t('themeGenerator.noCandidates')}</p>
            </Notice>
          )}

          {candidates !== null && candidates.length > 0 && (
            <ul className="m-0 grid list-none grid-cols-1 gap-4 p-0 sm:grid-cols-2 lg:grid-cols-3">
              {candidates.map((candidate) => (
                <li
                  key={candidate.id}
                  className="flex flex-col gap-3 rounded-md border border-border p-3"
                >
                  <ThemeCandidatePreview
                    token={token ?? ''}
                    candidate={candidate}
                    activeThemeName={activeThemeName}
                  />
                  <strong className="text-sm text-foreground">
                    {candidate.kind === 'sandbox'
                      ? t('themeGenerator.candidateCustomLayoutLabel')
                      : candidate.label}
                  </strong>
                  <span className="text-xs text-muted-foreground">{candidate.rationale}</span>
                  {candidate.kind === 'tokens' && candidate.chromeInput?.tagline !== undefined && (
                    <span className="text-xs text-muted-foreground">
                      {t('themeGenerator.candidateTagline', {
                        tagline: candidate.chromeInput.tagline,
                      })}
                    </span>
                  )}
                  {candidate.kind === 'sandbox' && (
                    <span className="text-xs text-muted-foreground">
                      {t('themeGenerator.candidateFilesWritten', {
                        count: candidate.filesWritten.length,
                      })}
                    </span>
                  )}
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant={activatedId === candidate.id ? 'secondary' : 'primary'}
                      size="sm"
                      disabled={activatingId !== null}
                      onClick={() => void activate(candidate)}
                    >
                      {activatingId === candidate.id
                        ? t('themeGenerator.activating')
                        : activatedId === candidate.id
                          ? t('themeGenerator.activated')
                          : t('themeGenerator.activateAction')}
                    </Button>
                    {activatedId === candidate.id && (
                      <SavedIndicator
                        visible={activatedIndicator.visible}
                        label={t('themeGenerator.activatedIndicator')}
                      />
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  )
}
