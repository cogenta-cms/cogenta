import { type JSX, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ApiError } from '../api/http.js'
import {
  type AvailableTheme,
  applySampleData,
  getTheme,
  previewSampleData,
  type SampleDataMode,
  type SampleDataPreview,
  type SampleDataReport,
} from '../api/theme-client.js'
import { Button, Field, Input, Modal, Notice } from '../ui/index.js'

/**
 * Choosing a theme (L27, L28): the theme alone — with or without the
 * typography and colours it was designed with — or the theme together with
 * the sample data of its starter site, the way WordPress offers a demo
 * import. Sample data is either added beside the site's content or replaces
 * it; both are previewed first, with every warning the server computed, and a
 * reset asks for the site's name typed out. Nothing here decides for the
 * person (R6): each write is one explicit click.
 */

export interface ThemeApplyDialogProps {
  readonly token: string
  /** `null` closes the dialog. */
  readonly theme: AvailableTheme | null
  /** Whether this theme ships sample data at all. */
  readonly hasSampleData: boolean
  /** False under `cogenta serve`: sample data can be previewed, never applied. */
  readonly sampleDataWritable: boolean
  readonly switching: boolean
  readonly switchError: string | null
  onApplyThemeOnly(applySkin: boolean): void
  onClose(): void
  /** Called once sample data is in and the server answers again. */
  onSampleDataApplied(): Promise<void> | void
}

type Step =
  | { readonly kind: 'choose' }
  | {
      readonly kind: 'preview'
      readonly mode: SampleDataMode
      readonly preview: SampleDataPreview | null
    }
  | { readonly kind: 'applying'; readonly mode: SampleDataMode }
  | { readonly kind: 'restarting'; readonly report: SampleDataReport }
  | { readonly kind: 'done'; readonly report: SampleDataReport; readonly unreachable: boolean }

const RESTART_FIRST_CHECK_MS = 1500
const RESTART_POLL_MS = 1000
const RESTART_GIVE_UP_MS = 90_000

export function ThemeApplyDialog({
  token,
  theme,
  hasSampleData,
  sampleDataWritable,
  switching,
  switchError,
  onApplyThemeOnly,
  onClose,
  onSampleDataApplied,
}: ThemeApplyDialogProps): JSX.Element {
  const { t } = useTranslation()
  const [step, setStep] = useState<Step>({ kind: 'choose' })
  const [error, setError] = useState<string | null>(null)
  const [confirmation, setConfirmation] = useState('')
  const alive = useRef(true)

  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  // A new theme (or a closed dialog) always starts over at the choice.
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset on the theme name only
  useEffect(() => {
    setStep({ kind: 'choose' })
    setError(null)
    setConfirmation('')
  }, [theme?.name])

  const busy = step.kind === 'applying' || step.kind === 'restarting'

  async function openPreview(mode: SampleDataMode): Promise<void> {
    if (theme === null) return
    setError(null)
    setConfirmation('')
    setStep({ kind: 'preview', mode, preview: null })
    try {
      const preview = await previewSampleData(token, theme.name, mode)
      if (alive.current) setStep({ kind: 'preview', mode, preview })
    } catch (caught) {
      if (!alive.current) return
      setError(
        caught instanceof ApiError ? caught.message : t('appearance.sampleData.previewError'),
      )
    }
  }

  async function waitForRestart(report: SampleDataReport): Promise<void> {
    setStep({ kind: 'restarting', report })
    const started = Date.now()
    await new Promise((resolve) => setTimeout(resolve, RESTART_FIRST_CHECK_MS))
    while (alive.current && Date.now() - started < RESTART_GIVE_UP_MS) {
      try {
        await getTheme(token)
        await onSampleDataApplied()
        if (alive.current) setStep({ kind: 'done', report, unreachable: false })
        return
      } catch {
        await new Promise((resolve) => setTimeout(resolve, RESTART_POLL_MS))
      }
    }
    if (alive.current) setStep({ kind: 'done', report, unreachable: true })
  }

  async function apply(mode: SampleDataMode): Promise<void> {
    if (theme === null) return
    const previous = step.kind === 'preview' ? step.preview : null
    setError(null)
    setStep({ kind: 'applying', mode })
    try {
      const report = await applySampleData(
        token,
        theme.name,
        mode,
        mode === 'reset' ? confirmation : undefined,
      )
      if (!alive.current) return
      if (report.restarting) {
        await waitForRestart(report)
      } else {
        await onSampleDataApplied()
        if (alive.current) setStep({ kind: 'done', report, unreachable: false })
      }
    } catch (caught) {
      if (!alive.current) return
      setError(caught instanceof ApiError ? caught.message : t('appearance.sampleData.applyError'))
      setStep({ kind: 'preview', mode, preview: previous })
    }
  }

  const title =
    step.kind === 'choose'
      ? t('appearance.themeSelectConfirmTitle', { name: theme?.label ?? '' })
      : step.kind === 'done'
        ? t('appearance.sampleData.doneTitle')
        : t('appearance.sampleData.title', { name: theme?.label ?? '' })

  return (
    <Modal
      open={theme !== null}
      onOpenChange={(open) => {
        if (!open && !busy) onClose()
      }}
      title={title}
      closeLabel={t('appearance.close')}
      className="w-[min(40rem,calc(100vw-2rem))]"
      footer={footerFor()}
    >
      {bodyFor()}
      {(error ?? (step.kind === 'choose' ? switchError : null)) !== null && (
        <Notice tone="danger" live="polite">
          <p>{error ?? switchError}</p>
        </Notice>
      )}
    </Modal>
  )

  function footerFor(): JSX.Element {
    if (step.kind === 'choose') {
      return (
        <Button type="button" variant="ghost" onClick={onClose} disabled={switching}>
          {t('common.cancel')}
        </Button>
      )
    }
    if (step.kind === 'preview') {
      const preview = step.preview
      const confirmed = step.mode === 'keep' || confirmation.trim() === preview?.siteName
      return (
        <>
          <Button type="button" variant="secondary" onClick={() => setStep({ kind: 'choose' })}>
            {t('appearance.sampleData.back')}
          </Button>
          <Button
            type="button"
            variant={step.mode === 'reset' ? 'destructive' : 'primary'}
            disabled={preview === null || !preview.writable || !confirmed}
            onClick={() => void apply(step.mode)}
          >
            {step.mode === 'reset'
              ? t('appearance.sampleData.applyReset')
              : t('appearance.sampleData.applyKeep')}
          </Button>
        </>
      )
    }
    if (step.kind === 'done') {
      return (
        <Button type="button" variant="primary" onClick={onClose}>
          {t('appearance.close')}
        </Button>
      )
    }
    return (
      <Button type="button" variant="primary" disabled>
        {step.kind === 'applying'
          ? t('appearance.sampleData.applying')
          : t('appearance.sampleData.restarting')}
      </Button>
    )
  }

  function bodyFor(): JSX.Element {
    if (step.kind === 'choose') {
      return (
        <div className="flex flex-col gap-5">
          <section className="flex flex-col gap-3" aria-labelledby="theme-apply-only">
            <h3 id="theme-apply-only" className="m-0 text-sm font-semibold">
              {t('appearance.sampleData.themeOnlyTitle')}
            </h3>
            <p className="m-0 text-sm text-muted-foreground">
              {t('appearance.themeSelectExplanation')}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => onApplyThemeOnly(false)}
                disabled={switching}
              >
                {t('appearance.themeSelectKeepSkin')}
              </Button>
              <Button
                type="button"
                variant="primary"
                onClick={() => onApplyThemeOnly(true)}
                disabled={switching}
              >
                {switching ? t('appearance.themeSwitching') : t('appearance.themeSelectApplySkin')}
              </Button>
            </div>
          </section>
          <section
            className="flex flex-col gap-3 border-t border-border pt-4"
            aria-labelledby="theme-apply-sample"
          >
            <h3 id="theme-apply-sample" className="m-0 text-sm font-semibold">
              {t('appearance.sampleData.withSampleTitle')}
            </h3>
            {!hasSampleData ? (
              <p className="m-0 text-sm text-muted-foreground">{t('appearance.sampleData.none')}</p>
            ) : (
              <>
                <p className="m-0 text-sm text-muted-foreground">
                  {t('appearance.sampleData.withSampleExplanation')}
                </p>
                {!sampleDataWritable && (
                  <Notice tone="info" live="off">
                    <p>{t('appearance.sampleData.devOnly')}</p>
                  </Notice>
                )}
                <div className="grid gap-2 sm:grid-cols-2">
                  <ChoiceButton
                    title={t('appearance.sampleData.keepTitle')}
                    description={t('appearance.sampleData.keepDescription')}
                    onClick={() => void openPreview('keep')}
                    disabled={switching}
                  />
                  <ChoiceButton
                    title={t('appearance.sampleData.resetTitle')}
                    description={t('appearance.sampleData.resetDescription')}
                    onClick={() => void openPreview('reset')}
                    disabled={switching}
                    destructive
                  />
                </div>
              </>
            )}
          </section>
        </div>
      )
    }

    if (step.kind === 'preview') {
      const preview = step.preview
      if (preview === null) {
        return error === null ? (
          <p className="m-0 text-sm text-muted-foreground" aria-live="polite">
            {t('appearance.sampleData.previewLoading')}
          </p>
        ) : (
          <span />
        )
      }
      return (
        <div className="flex flex-col gap-4">
          <p className="m-0 text-sm">
            {step.mode === 'reset'
              ? t('appearance.sampleData.resetIntro')
              : t('appearance.sampleData.keepIntro')}
          </p>
          <Warnings preview={preview} />
          <Summary preview={preview} />
          {!preview.writable && (
            <Notice tone="info" live="off">
              <p>{t('appearance.sampleData.devOnly')}</p>
            </Notice>
          )}
          {step.mode === 'reset' && preview.writable && (
            <Field
              label={t('appearance.sampleData.confirmLabel', { name: preview.siteName })}
              description={t('appearance.sampleData.confirmHelp')}
            >
              {(control) => (
                <Input
                  {...control}
                  autoComplete="off"
                  value={confirmation}
                  onChange={(event) => setConfirmation(event.target.value)}
                />
              )}
            </Field>
          )}
        </div>
      )
    }

    if (step.kind === 'applying') {
      return (
        <p className="m-0 text-sm" aria-live="polite">
          {step.mode === 'reset'
            ? t('appearance.sampleData.applyingReset')
            : t('appearance.sampleData.applyingKeep')}
        </p>
      )
    }

    const report = step.report
    return (
      <div className="flex flex-col gap-3">
        {step.kind === 'restarting' ? (
          <Notice tone="info" live="polite">
            <p>{t('appearance.sampleData.restartingHelp')}</p>
          </Notice>
        ) : step.unreachable ? (
          <Notice tone="warning" live="polite">
            <p>{t('appearance.sampleData.unreachable')}</p>
          </Notice>
        ) : (
          <Notice tone="success" live="polite">
            <p>
              {t('appearance.sampleData.doneSummary', {
                entries: report.imported.entries,
                media: report.imported.media,
              })}
            </p>
          </Notice>
        )}
        {report.backup !== null && (
          <div className="flex flex-col gap-1 text-sm">
            <p className="m-0">{t('appearance.sampleData.backupTaken')}</p>
            <code className="block overflow-x-auto rounded-md bg-muted px-2 py-1 text-xs">
              {report.backup.path}
            </code>
            <p className="m-0 text-muted-foreground">{t('appearance.sampleData.restoreWith')}</p>
            <code className="block overflow-x-auto rounded-md bg-muted px-2 py-1 text-xs">
              {report.backup.restoreCommand}
            </code>
          </div>
        )}
      </div>
    )
  }
}

function ChoiceButton({
  title,
  description,
  onClick,
  disabled,
  destructive = false,
}: {
  readonly title: string
  readonly description: string
  onClick(): void
  readonly disabled: boolean
  readonly destructive?: boolean
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={
        'flex cursor-pointer flex-col items-start gap-1 rounded-lg border bg-card px-3 py-2.5 text-left ' +
        'font-sans text-card-foreground hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60 ' +
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ' +
        (destructive ? 'border-destructive/40' : 'border-border')
      }
    >
      <span className="text-sm font-semibold">{title}</span>
      <span className="text-xs leading-4 text-muted-foreground">{description}</span>
    </button>
  )
}

function Warnings({ preview }: { readonly preview: SampleDataPreview }): JSX.Element | null {
  const { t } = useTranslation()
  if (preview.warnings.length === 0) return null
  return (
    <div className="flex flex-col gap-2">
      {preview.warnings.map((warning, index) => (
        <Notice
          // biome-ignore lint/suspicious/noArrayIndexKey: a warning list is rebuilt whole, never reordered
          key={`${warning.code}-${index}`}
          tone={
            warning.code === 'reset-deletes' || warning.code === 'schema-not-serialisable'
              ? 'danger'
              : 'warning'
          }
          live="off"
        >
          <p>{t(`appearance.sampleData.warnings.${warning.code}`, warning.params)}</p>
        </Notice>
      ))}
    </div>
  )
}

function Summary({ preview }: { readonly preview: SampleDataPreview }): JSX.Element {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col gap-2 text-sm">
      <h4 className="m-0 text-sm font-semibold">{t('appearance.sampleData.summaryTitle')}</h4>
      <ul className="m-0 flex list-none flex-col gap-1 p-0">
        {preview.collections.map((collection) => (
          <li key={collection.name} className="flex justify-between gap-3">
            <span>
              <code className="text-xs">{collection.name}</code>{' '}
              <span className="text-muted-foreground">
                {t(`appearance.sampleData.outcome.${collection.outcome}`)}
              </span>
            </span>
            <span className="tabular-nums text-muted-foreground">
              {t('appearance.sampleData.entriesCount', {
                count: collection.entries - collection.conflictingSlugs.length,
              })}
            </span>
          </li>
        ))}
        {preview.taxonomies.map((taxonomy) => (
          <li key={`taxonomy-${taxonomy.name}`} className="flex justify-between gap-3">
            <span>
              <code className="text-xs">{taxonomy.name}</code>{' '}
              <span className="text-muted-foreground">
                {t(`appearance.sampleData.outcome.${taxonomy.outcome}`)}
              </span>
            </span>
            <span className="tabular-nums text-muted-foreground">
              {t('appearance.sampleData.termsCount', { count: taxonomy.terms })}
            </span>
          </li>
        ))}
        <li className="flex justify-between gap-3">
          <span>{t('appearance.sampleData.mediaLabel')}</span>
          <span className="tabular-nums text-muted-foreground">
            {t('appearance.sampleData.mediaCount', { count: preview.media })}
          </span>
        </li>
        {preview.menus.map((menu) => (
          <li key={`menu-${menu.location}`} className="flex justify-between gap-3">
            <span>
              {t('appearance.sampleData.menuLabel', { location: menu.location })}{' '}
              <span className="text-muted-foreground">
                {t(`appearance.sampleData.outcome.${menu.outcome}`)}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
