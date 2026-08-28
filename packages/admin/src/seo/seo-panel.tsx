import { type JSX, useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  type AssistSuggestion,
  getAssistCapabilities,
  runAssistTool,
} from '../api/assist-client.js'
import { ApiError } from '../api/client.js'
import { runSeoPreview, type SeoPreview } from '../api/seo-client.js'
import { FieldInput } from '../fields/field-input.js'
import type { CollectionSummary, SchemaField } from '../schema/types.js'
import { Button, Card, CardBody, CardHeader, CardTitle, Input, Label, Notice } from '../ui/index.js'
import { analyseContent, type ContentCheckId } from './content-score.js'

/**
 * Fiche 13 (SEO éditorial), Task 1 — the panel `entry-edit.tsx` never had:
 * a title distinct from the page's own, a description, a share image, a
 * `noindex` switch and an advanced canonical override.
 *
 * Three properties this file is built around:
 *
 * 1. **Convention, not contract.** The four/five fields it edits
 *    (`seoTitle`, `seoDescription`, `seoImage`, `seoNoindex`, `seoCanonical`)
 *    are ordinary fields a collection either declares or does not — contract
 *    A is untouched. A collection that declares none of them renders this
 *    panel as nothing at all, same as `FaqSchemaPanel` on a site with no
 *    block zone.
 * 2. **The aperçu never lies.** Every character count is arithmetic this
 *    file may do (`value.length`), but the *rendered* title, description,
 *    canonical and robots decision only ever come from `POST
 *    /api/seo/preview` — the same `buildMetaTags` the public page calls.
 *    Reimplementing that here is the one mistake this fiche names by name.
 * 3. **R2.** The two "propose a …" buttons (Task 4) call existing writing
 *    tools (`assist.titles`, `assist.meta_description`) and disappear
 *    outright when `GET /api/assistant` answers `available: false` — the
 *    panel above them keeps editing, publishing and previewing working with
 *    no AI configured at all.
 */

/** Google truncates a title near this width in a search result. */
const RECOMMENDED_TITLE_LENGTH = 60
/** Google truncates a description near this width. */
const RECOMMENDED_DESCRIPTION_LENGTH = 155

const PREVIEW_DEBOUNCE_MS = 300

const TEXTAREA_CLASSES =
  'w-full appearance-none rounded-md border border-input bg-card px-3 py-2 font-sans text-sm ' +
  'leading-5 text-card-foreground shadow-card transition-colors placeholder:text-muted-foreground ' +
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ' +
  'disabled:cursor-default disabled:opacity-60'

export interface SeoPanelProps {
  readonly token: string
  readonly collection: CollectionSummary
  /** `null` for an entry that has never been saved: there is nothing to preview yet. */
  readonly entryId: string | null
  /** The entry's current status, only used to warn about `noindex` on a published page. */
  readonly status: string
  readonly values: Readonly<Record<string, unknown>>
  /** Plain text for the "propose a title/description" buttons — the same text the other assist panels use. */
  readonly entryText: string
  /** Fiche 70 task 1 — the raw value of the collection's first `richText` field, for the content score below. `undefined` when the collection has none. */
  readonly bodyValue?: unknown
  onChange(name: string, value: unknown): void
  readonly disabled?: boolean
}

/** In document order — the checklist renders every evaluated check in this fixed sequence, never the order `analyseContent` happened to push them in. */
const CHECK_ORDER: readonly ContentCheckId[] = [
  'keywordInTitle',
  'keywordInDescription',
  'keywordInFirstSentence',
  'keywordDensity',
  'sentenceLength',
  'subheadings',
  'contentLength',
]

function fieldOf(collection: CollectionSummary, name: string): SchemaField | undefined {
  return collection.fields.find((field) => field.name === name)
}

function stringValue(values: Readonly<Record<string, unknown>>, name: string): string {
  const value = values[name]
  return typeof value === 'string' ? value : ''
}

function counterTone(length: number, recommended: number): 'muted' | 'warning' {
  return length > recommended ? 'warning' : 'muted'
}

export function SeoPanel({
  token,
  collection,
  entryId,
  status,
  values,
  entryText,
  bodyValue,
  onChange,
  disabled = false,
}: SeoPanelProps): JSX.Element | null {
  const { t } = useTranslation()

  const titleField = fieldOf(collection, 'seoTitle')
  const descriptionField = fieldOf(collection, 'seoDescription')
  const imageField = fieldOf(collection, 'seoImage')
  const noindexField = fieldOf(collection, 'seoNoindex')
  const canonicalField = fieldOf(collection, 'seoCanonical')
  const focusKeywordField = fieldOf(collection, 'seoFocusKeyword')

  const hasAnyField =
    titleField !== undefined ||
    descriptionField !== undefined ||
    imageField !== undefined ||
    noindexField !== undefined ||
    canonicalField !== undefined ||
    focusKeywordField !== undefined

  const [expanded, setExpanded] = useState(true)
  const [advancedOpen, setAdvancedOpen] = useState(false)

  const [preview, setPreview] = useState<SeoPreview | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewError, setPreviewError] = useState<string | null>(null)

  const [titlesAvailable, setTitlesAvailable] = useState(false)
  const [descriptionsAvailable, setDescriptionsAvailable] = useState(false)
  const [titleSuggestions, setTitleSuggestions] = useState<readonly string[] | null>(null)
  const [descriptionSuggestions, setDescriptionSuggestions] = useState<readonly string[] | null>(
    null,
  )
  const [suggestingTitle, setSuggestingTitle] = useState(false)
  const [suggestingDescription, setSuggestingDescription] = useState(false)
  const [suggestError, setSuggestError] = useState<string | null>(null)

  useEffect(() => {
    if (!hasAnyField) return
    let cancelled = false
    getAssistCapabilities(token)
      .then((capabilities) => {
        if (cancelled) return
        const tools = new Set(capabilities.tools.map((tool) => tool.tool))
        setTitlesAvailable(capabilities.available && tools.has('assist.titles'))
        setDescriptionsAvailable(capabilities.available && tools.has('assist.meta_description'))
      })
      .catch(() => {
        if (!cancelled) {
          setTitlesAvailable(false)
          setDescriptionsAvailable(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [token, hasAnyField])

  const runPreview = useCallback(async () => {
    if (entryId === null) return
    setPreviewLoading(true)
    setPreviewError(null)
    try {
      setPreview(
        await runSeoPreview(token, { collection: collection.name, id: entryId, overrides: values }),
      )
    } catch (caught) {
      setPreviewError(caught instanceof ApiError ? caught.message : t('seo.previewError'))
    } finally {
      setPreviewLoading(false)
    }
  }, [token, collection.name, entryId, values, t])

  // Debounced, not on every keystroke (L16's own "aperçu se met à jour après
  // un aller-retour serveur débattu" — the same trade-off, for the same
  // reason: the truncation and the robots decision are real server logic,
  // never re-derived here).
  useEffect(() => {
    if (entryId === null || !hasAnyField) return
    const timer = setTimeout(() => void runPreview(), PREVIEW_DEBOUNCE_MS)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entryId, hasAnyField, JSON.stringify(values)])

  /**
   * Fiche 70 task 1 — recomputed on every render, never debounced and never
   * an API call: `analyseContent` is a pure, synchronous function, which is
   * exactly what lets the score "changer en direct pendant la frappe" (the
   * fiche's own acceptance criterion) rather than trailing the 300ms preview
   * above. Falls back to the entry's own `title`/`excerpt` fields when no
   * `seoTitle`/`seoDescription` override has been typed — the same
   * "what will actually render" question `preview` answers server-side,
   * approximated here without a round trip.
   */
  const contentAnalysis = useMemo(() => {
    if (focusKeywordField === undefined && bodyValue === undefined) return null
    const titleForAnalysis =
      stringValue(values, 'seoTitle') || stringValue(values, 'title') || preview?.title || ''
    const descriptionForAnalysis =
      stringValue(values, 'seoDescription') ||
      stringValue(values, 'excerpt') ||
      preview?.description
    return analyseContent({
      title: titleForAnalysis,
      ...(descriptionForAnalysis ? { description: descriptionForAnalysis } : {}),
      focusKeyword: stringValue(values, 'seoFocusKeyword'),
      body: bodyValue,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusKeywordField, bodyValue, JSON.stringify(values), preview?.title, preview?.description])

  if (!hasAnyField) return null

  const titleValue = stringValue(values, 'seoTitle')
  const descriptionValue = stringValue(values, 'seoDescription')
  const canonicalValue = stringValue(values, 'seoCanonical')
  const noindexValue = values['seoNoindex'] === true
  const focusKeywordValue = stringValue(values, 'seoFocusKeyword')

  async function suggestTitles(): Promise<void> {
    if (suggestingTitle) return
    setSuggestingTitle(true)
    setSuggestError(null)
    setTitleSuggestions(null)
    try {
      const result = await runAssistTool<AssistSuggestion>(token, 'assist.titles', {
        text: entryText || titleValue,
      })
      setTitleSuggestions(result.suggestions)
    } catch (caught) {
      setSuggestError(caught instanceof ApiError ? caught.message : t('seo.suggestError'))
    } finally {
      setSuggestingTitle(false)
    }
  }

  async function suggestDescriptions(): Promise<void> {
    if (suggestingDescription) return
    setSuggestingDescription(true)
    setSuggestError(null)
    setDescriptionSuggestions(null)
    try {
      const result = await runAssistTool<AssistSuggestion>(token, 'assist.meta_description', {
        text: entryText || descriptionValue,
        ...(stringValue(values, 'title') === '' ? {} : { title: stringValue(values, 'title') }),
      })
      setDescriptionSuggestions(result.suggestions)
    } catch (caught) {
      setSuggestError(caught instanceof ApiError ? caught.message : t('seo.suggestError'))
    } finally {
      setSuggestingDescription(false)
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4">
        <CardTitle>
          <h2>{t('seo.panelHeading')}</h2>
        </CardTitle>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-expanded={expanded}
          onClick={() => setExpanded((current) => !current)}
        >
          {expanded ? t('seo.collapse') : t('seo.expand')}
        </Button>
      </CardHeader>

      {expanded && (
        <CardBody className="flex flex-col gap-5">
          {entryId === null && (
            <Notice tone="info">
              <p>{t('seo.saveFirst')}</p>
            </Notice>
          )}

          {titleField !== undefined && (
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="seo-title">{t('seo.titleLabel')}</Label>
                <span
                  className={`text-xs ${counterTone(titleValue.length, RECOMMENDED_TITLE_LENGTH) === 'warning' ? 'text-destructive' : 'text-muted-foreground'}`}
                >
                  {titleValue.length} / {RECOMMENDED_TITLE_LENGTH}
                </span>
              </div>
              <Input
                id="seo-title"
                value={titleValue}
                disabled={disabled}
                placeholder={preview?.title ?? ''}
                onChange={(event) => onChange('seoTitle', event.target.value)}
              />
              {titlesAvailable && (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={suggestingTitle || entryText === ''}
                  onClick={() => void suggestTitles()}
                >
                  {suggestingTitle ? t('seo.suggesting') : t('seo.suggestTitle')}
                </Button>
              )}
              {titleSuggestions !== null && (
                <ul className="flex flex-col gap-1">
                  {titleSuggestions.map((suggestion) => (
                    <li key={suggestion}>
                      <button
                        type="button"
                        className="text-left text-sm text-primary underline"
                        onClick={() => {
                          onChange('seoTitle', suggestion)
                          setTitleSuggestions(null)
                        }}
                      >
                        {suggestion}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {descriptionField !== undefined && (
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="seo-description">{t('seo.descriptionLabel')}</Label>
                <span
                  className={`text-xs ${counterTone(descriptionValue.length, RECOMMENDED_DESCRIPTION_LENGTH) === 'warning' ? 'text-destructive' : 'text-muted-foreground'}`}
                >
                  {descriptionValue.length} / {RECOMMENDED_DESCRIPTION_LENGTH}
                </span>
              </div>
              <textarea
                id="seo-description"
                className={TEXTAREA_CLASSES}
                rows={3}
                value={descriptionValue}
                disabled={disabled}
                placeholder={preview?.description ?? ''}
                onChange={(event) => onChange('seoDescription', event.target.value)}
              />
              {descriptionsAvailable && (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={suggestingDescription || entryText === ''}
                  onClick={() => void suggestDescriptions()}
                >
                  {suggestingDescription ? t('seo.suggesting') : t('seo.suggestDescription')}
                </Button>
              )}
              {descriptionSuggestions !== null && (
                <ul className="flex flex-col gap-1">
                  {descriptionSuggestions.map((suggestion) => (
                    <li key={suggestion}>
                      <button
                        type="button"
                        className="text-left text-sm text-primary underline"
                        onClick={() => {
                          onChange('seoDescription', suggestion)
                          setDescriptionSuggestions(null)
                        }}
                      >
                        {suggestion}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {suggestError !== null && (
            <Notice tone="danger" live="assertive">
              <p>{suggestError}</p>
            </Notice>
          )}

          {focusKeywordField !== undefined && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="seo-focus-keyword">{t('seo.focusKeywordLabel')}</Label>
              <Input
                id="seo-focus-keyword"
                value={focusKeywordValue}
                disabled={disabled}
                placeholder={t('seo.focusKeywordPlaceholder')}
                onChange={(event) => onChange('seoFocusKeyword', event.target.value)}
              />
              <p className="text-xs text-muted-foreground">{t('seo.focusKeywordHint')}</p>
            </div>
          )}

          {imageField !== undefined && (
            <FieldInput
              id="seo-image"
              field={imageField}
              value={values['seoImage'] ?? null}
              onChange={(value) => onChange('seoImage', value)}
              disabled={disabled}
            />
          )}

          {noindexField !== undefined && (
            <div className="flex flex-col gap-1.5">
              <label className="flex items-center gap-2 font-sans text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={noindexValue}
                  disabled={disabled}
                  onChange={(event) => onChange('seoNoindex', event.target.checked)}
                />
                {t('seo.noindexLabel')}
              </label>
              {noindexValue && status === 'published' && (
                <Notice tone="warning" live="assertive">
                  <p>{t('seo.noindexPublishedWarning')}</p>
                </Notice>
              )}
            </div>
          )}

          {canonicalField !== undefined && (
            <div className="flex flex-col gap-2 border-t border-border pt-4">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="self-start"
                aria-expanded={advancedOpen}
                onClick={() => setAdvancedOpen((current) => !current)}
              >
                {advancedOpen ? t('seo.hideAdvanced') : t('seo.showAdvanced')}
              </Button>
              {advancedOpen && (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="seo-canonical">{t('seo.canonicalLabel')}</Label>
                  <Input
                    id="seo-canonical"
                    value={canonicalValue}
                    disabled={disabled}
                    placeholder="https://…"
                    onChange={(event) => onChange('seoCanonical', event.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">{t('seo.canonicalHint')}</p>
                </div>
              )}
            </div>
          )}

          <div className="flex flex-col gap-2 border-t border-border pt-4">
            <h3 className="m-0 text-sm font-semibold text-foreground">{t('seo.previewHeading')}</h3>
            {entryId === null && (
              <p className="text-sm text-muted-foreground">{t('seo.saveFirst')}</p>
            )}
            {previewError !== null && (
              <Notice tone="danger" live="assertive">
                <p>{previewError}</p>
              </Notice>
            )}
            {entryId !== null && previewLoading && preview === null && (
              <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
            )}
            {preview !== null && (
              <div className="flex flex-col gap-2 rounded-md border border-border bg-card p-3">
                <p className="truncate text-base text-[#1a0dab]">{preview.title}</p>
                {preview.canonical !== null && (
                  <p className="truncate text-xs text-[#006621]">{preview.canonical}</p>
                )}
                {preview.description !== null && (
                  <p className="text-sm text-muted-foreground">{preview.description}</p>
                )}
                {preview.robots === 'noindex' && (
                  <Notice tone="warning">
                    <p>{t('seo.previewNoindex')}</p>
                  </Notice>
                )}
              </div>
            )}
          </div>

          {contentAnalysis !== null && (
            <ContentScoreCard
              analysis={contentAnalysis}
              hasFocusKeyword={focusKeywordValue !== ''}
            />
          )}
        </CardBody>
      )}
    </Card>
  )
}

const SCORE_TONE: Readonly<Record<'red' | 'orange' | 'green', string>> = {
  red: 'bg-destructive/15 text-destructive',
  orange: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
  green: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
}

/**
 * Fiche 70 task 1 — TruSEO-style real-time content score, rendered under the
 * Google preview per the fiche's own placement instruction. Three levels,
 * never a percentage: the fiche names the piège by name — "un faux
 * sentiment de précision est pire qu'une absence de score" — so this card
 * never prints `analysis.passedCount / analysis.totalCount` as a number,
 * only the closed red/orange/green union `analyseContent` itself returns.
 */
function ContentScoreCard({
  analysis,
  hasFocusKeyword,
}: {
  readonly analysis: ReturnType<typeof analyseContent>
  readonly hasFocusKeyword: boolean
}): JSX.Element {
  const { t } = useTranslation()

  return (
    <div className="flex flex-col gap-2 border-t border-border pt-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="m-0 text-sm font-semibold text-foreground">
          {t('seo.contentScoreHeading')}
        </h3>
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-medium ${SCORE_TONE[analysis.score]}`}
        >
          {t(`seo.scoreLevel.${analysis.score}`)}
        </span>
      </div>
      {!hasFocusKeyword && (
        <p className="text-xs text-muted-foreground">{t('seo.contentScoreNoKeywordHint')}</p>
      )}
      <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
        {CHECK_ORDER.map((id) => {
          const check = analysis.checks.find((candidate) => candidate.id === id)
          if (check === undefined) return null
          return (
            <li key={id} className="flex items-start gap-2 text-sm">
              <span
                aria-hidden="true"
                className={
                  check.passed ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive'
                }
              >
                {check.passed ? '✓' : '✗'}
              </span>
              <span className={check.passed ? 'text-foreground' : 'text-foreground'}>
                {t(`seo.contentCheck.${id}`)}
                <span className="sr-only">
                  {check.passed ? t('seo.contentCheckPassed') : t('seo.contentCheckFailed')}
                </span>
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
