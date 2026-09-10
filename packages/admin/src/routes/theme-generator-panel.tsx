import { type JSX, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { ThemeGenerateCandidate } from '../api/theme-client.js'
import { Button, Field, Input, Modal, SavedIndicator, Select } from '../ui/index.js'
import { ThemeCandidatePreview } from './theme-generator-preview.js'

/**
 * The workshop's *persistent* preview: the half of the screen that never
 * leaves, showing whatever the agent last produced and updating itself after
 * every turn of the conversation.
 *
 * This used to be a grid of cards, one per candidate, sitting under a
 * one-shot form. It is a panel now because the screen it belongs to is a
 * discussion: the operator describes, looks, asks for a change, and looks
 * again — and a result that scrolls out of view the moment they start typing
 * the next sentence is not something they can judge against what they asked
 * for. Only one candidate is shown at a time; when a run returns several
 * (which only happens when the operator asked for several), the header
 * carries the switch between them.
 *
 * The comparison view is the other reason this is one place and not many: an
 * operator who attached a screenshot is judging a *resemblance*, so the same
 * reference image and the same real server render sit side by side, both
 * large, in one dialog.
 *
 * A local theme name lives here too, and only for a `sandbox` candidate:
 * activating one deploys its sandbox into `themes/<name>/`. A `tokens`
 * candidate has no equivalent — activating it writes theme *overrides*, a row
 * that names no theme of its own.
 */

/** One attached image, kept as an object URL by the workshop screen that owns the files. */
export interface ReferenceImage {
  readonly name: string
  readonly url: string
}

/** What `POST /api/theme/sandbox/:id/deploy` will accept as a theme directory name. */
const THEME_NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u

export interface ThemePreviewPanelProps {
  readonly token: string
  /** Everything the last run produced, in the order the server returned it. Empty until the first turn settles. */
  readonly candidates: readonly ThemeGenerateCandidate[]
  readonly selectedId: string | null
  selectCandidate(id: string): void
  readonly activeThemeName: string
  /** Human label of the theme the public site is running right now — re-read after every activation, so this panel says what is live and not only what is proposed. */
  readonly activeThemeLabel: string
  readonly references: readonly ReferenceImage[]
  /** A turn is in flight: the panel keeps showing the previous result rather than blanking, and refuses to activate mid-run. */
  readonly busy: boolean
  readonly activating: boolean
  readonly activated: boolean
  readonly activatedIndicatorVisible: boolean
  activate(candidate: ThemeGenerateCandidate, themeName: string | null): void
}

export function ThemePreviewPanel({
  token,
  candidates,
  selectedId,
  selectCandidate,
  activeThemeName,
  activeThemeLabel,
  references,
  busy,
  activating,
  activated,
  activatedIndicatorVisible,
  activate,
}: ThemePreviewPanelProps): JSX.Element {
  const { t } = useTranslation()
  const selected = candidates.find((entry) => entry.id === selectedId) ?? candidates[0] ?? null

  return (
    <section
      aria-labelledby="theme-generator-preview-heading"
      className="flex flex-col gap-3 rounded-md border border-border bg-card p-3"
      data-testid="theme-generator-preview-panel"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2
          id="theme-generator-preview-heading"
          className="m-0 text-sm leading-5 font-semibold text-card-foreground"
        >
          {t('themeGenerator.previewPanelHeading')}
        </h2>
        {candidates.length > 1 && (
          <Select
            aria-label={t('themeGenerator.candidatePickerLabel')}
            value={selected?.id ?? ''}
            onChange={(event) => selectCandidate(event.target.value)}
          >
            {candidates.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.kind === 'sandbox'
                  ? t('themeGenerator.candidateCustomLayoutLabel')
                  : candidate.label}
              </option>
            ))}
          </Select>
        )}
      </div>

      <p className="m-0 text-xs leading-5 text-muted-foreground">
        {t('themeGenerator.activeThemeNote', { theme: activeThemeLabel })}
      </p>

      {selected === null ? (
        <p
          className="m-0 flex h-56 items-center justify-center rounded-md border border-dashed border-border px-4 text-center text-xs leading-5 text-muted-foreground"
          data-testid="theme-generator-preview-empty"
        >
          {busy ? t('themeGenerator.previewPending') : t('themeGenerator.previewPlaceholder')}
        </p>
      ) : (
        <PanelBody
          key={selected.id}
          token={token}
          candidate={selected}
          activeThemeName={activeThemeName}
          references={references}
          busy={busy}
          activating={activating}
          activated={activated}
          activatedIndicatorVisible={activatedIndicatorVisible}
          activate={activate}
        />
      )}
    </section>
  )
}

/**
 * Keyed on the candidate's id by its parent, so the chosen theme name and any
 * open dialog reset when the agent produces a different candidate rather than
 * carrying a name that was typed for something else.
 */
function PanelBody({
  token,
  candidate,
  activeThemeName,
  references,
  busy,
  activating,
  activated,
  activatedIndicatorVisible,
  activate,
}: {
  readonly token: string
  readonly candidate: ThemeGenerateCandidate
  readonly activeThemeName: string
  readonly references: readonly ReferenceImage[]
  readonly busy: boolean
  readonly activating: boolean
  readonly activated: boolean
  readonly activatedIndicatorVisible: boolean
  activate(candidate: ThemeGenerateCandidate, themeName: string | null): void
}): JSX.Element {
  const { t } = useTranslation()
  const [inspect, setInspect] = useState<'preview' | 'compare' | null>(null)
  const [themeName, setThemeName] = useState(
    candidate.kind === 'sandbox' ? candidate.sandboxId : '',
  )

  const label =
    candidate.kind === 'sandbox' ? t('themeGenerator.candidateCustomLayoutLabel') : candidate.label
  const nameInvalid = candidate.kind === 'sandbox' && !THEME_NAME_PATTERN.test(themeName)

  return (
    <div className="flex flex-col gap-3">
      <ThemeCandidatePreview
        token={token}
        candidate={candidate}
        activeThemeName={activeThemeName}
        className="h-72"
      />

      <div className="flex flex-col gap-1">
        <strong className="text-sm text-card-foreground">{label}</strong>
        {candidate.kind === 'tokens' && candidate.chromeInput?.tagline !== undefined && (
          <span className="text-xs leading-5 text-muted-foreground">
            {t('themeGenerator.candidateTagline', { tagline: candidate.chromeInput.tagline })}
          </span>
        )}
      </div>

      {candidate.kind === 'sandbox' && (
        <details className="rounded-md border border-border">
          <summary className="cursor-pointer px-2 py-1.5 text-xs leading-5 text-muted-foreground">
            {t('themeGenerator.candidateFilesWritten', { count: candidate.filesWritten.length })}
          </summary>
          <ul className="m-0 flex list-none flex-col gap-1 border-t border-border p-2">
            {candidate.filesWritten.map((file) => (
              <li
                key={file}
                className="font-mono text-[0.7rem] leading-4 break-all text-foreground"
              >
                {file}
              </li>
            ))}
          </ul>
        </details>
      )}

      {candidate.kind === 'sandbox' && (
        <Field
          label={t('themeGenerator.themeNameLabel')}
          description={t('themeGenerator.themeNameHint')}
          error={nameInvalid ? t('themeGenerator.themeNameInvalid') : null}
        >
          {(control) => (
            <Input
              {...control}
              value={themeName}
              disabled={activating}
              onChange={(event) => setThemeName(event.target.value)}
            />
          )}
        </Field>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant={activated ? 'secondary' : 'primary'}
          size="sm"
          disabled={activating || busy || nameInvalid}
          onClick={() => activate(candidate, candidate.kind === 'sandbox' ? themeName : null)}
        >
          {activating
            ? t('themeGenerator.activating')
            : activated
              ? t('themeGenerator.activated')
              : t('themeGenerator.activateAction')}
        </Button>
        <Button type="button" variant="secondary" size="sm" onClick={() => setInspect('preview')}>
          {t('themeGenerator.enlargeAction')}
        </Button>
        {references.length > 0 && (
          <Button type="button" variant="secondary" size="sm" onClick={() => setInspect('compare')}>
            {t('themeGenerator.compareAction')}
          </Button>
        )}
        {activated && (
          <SavedIndicator
            visible={activatedIndicatorVisible}
            label={t('themeGenerator.activatedIndicator')}
          />
        )}
      </div>

      <Modal
        open={inspect !== null}
        onOpenChange={(open) => {
          if (!open) setInspect(null)
        }}
        title={
          inspect === 'compare'
            ? t('themeGenerator.compareModalTitle', { label })
            : t('themeGenerator.previewModalTitle', { label })
        }
        closeLabel={t('themeGenerator.closeAction')}
        className="w-[min(76rem,calc(100vw-2rem))]"
      >
        {inspect === 'compare' ? (
          <CompareView
            token={token}
            candidate={candidate}
            activeThemeName={activeThemeName}
            references={references}
          />
        ) : (
          <ThemeCandidatePreview
            token={token}
            candidate={candidate}
            activeThemeName={activeThemeName}
            className="h-[65vh]"
            interactive
          />
        )}
      </Modal>
    </div>
  )
}

function CompareView({
  token,
  candidate,
  activeThemeName,
  references,
}: {
  readonly token: string
  readonly candidate: ThemeGenerateCandidate
  readonly activeThemeName: string
  readonly references: readonly ReferenceImage[]
}): JSX.Element {
  const { t } = useTranslation()
  const [shown, setShown] = useState(references[0]?.url ?? '')
  const reference = references.find((entry) => entry.url === shown) ?? references[0]

  return (
    <div className="flex flex-col gap-3">
      {references.length > 1 && (
        <Field label={t('themeGenerator.compareReferencePicker')}>
          {(control) => (
            <Select {...control} value={shown} onChange={(event) => setShown(event.target.value)}>
              {references.map((entry) => (
                <option key={entry.url} value={entry.url}>
                  {entry.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
      )}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <figure className="m-0 flex flex-col gap-2">
          <figcaption className="text-xs leading-5 font-medium text-muted-foreground">
            {t('themeGenerator.compareReferenceLabel')}
          </figcaption>
          {reference === undefined ? (
            <p className="m-0 text-xs text-muted-foreground">
              {t('themeGenerator.compareNoReference')}
            </p>
          ) : (
            <img
              src={reference.url}
              alt={t('themeGenerator.attachmentImageAlt', { name: reference.name })}
              className="h-[60vh] w-full rounded-md border border-border bg-muted object-contain"
            />
          )}
        </figure>
        <div className="flex flex-col gap-2">
          <span className="text-xs leading-5 font-medium text-muted-foreground">
            {t('themeGenerator.compareResultLabel')}
          </span>
          <ThemeCandidatePreview
            token={token}
            candidate={candidate}
            activeThemeName={activeThemeName}
            className="h-[60vh]"
            interactive
          />
        </div>
      </div>
    </div>
  )
}
