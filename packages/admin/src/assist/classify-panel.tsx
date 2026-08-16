import { type JSX, useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { ClassificationResult } from '../api/assist-client.js'
import { getAssistCapabilities, runClassify } from '../api/assist-client.js'
import { ApiError } from '../api/client.js'

/**
 * `assist.classify` given a screen — a "Suggest categories" button on the
 * entry editor.
 *
 * The tool's vocabulary is the site's own, not an invented taxonomy: this
 * panel offers it a `select` field's own declared choices (the multi-value
 * one if the collection has one, since that is what a set of category tags
 * actually is on contract A today — `defineTaxonomy`'s hierarchical terms are
 * a different vocabulary, identified by id rather than by label, which is not
 * what `assist.classify`'s flat string vocabulary matches). A collection with
 * no `select` field has nothing for this panel to offer into, so it renders
 * nothing, same as with no AI provider at all.
 *
 * Every suggestion needs its own click (R6): accepting one calls `onAccept`
 * with a single label added, never a bulk "apply all", and a label the model
 * proposed outside the vocabulary is shown as rejected — never a button.
 */

export interface ClassifyField {
  readonly name: string
  readonly label: string
  readonly options: readonly string[]
}

export interface ClassifyPanelProps {
  readonly token: string
  readonly text: string
  readonly field: ClassifyField
  readonly currentValue: readonly string[]
  onAccept(field: string, next: readonly string[]): void
}

export function ClassifyPanel({
  token,
  text,
  field,
  currentValue,
  onAccept,
}: ClassifyPanelProps): JSX.Element | null {
  const { t } = useTranslation()
  const [available, setAvailable] = useState<boolean | null>(null)
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<ClassificationResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const capabilities = await getAssistCapabilities(token)
      setAvailable(
        capabilities.available &&
          capabilities.tools.some((tool) => tool.tool === 'assist.classify'),
      )
    } catch {
      setAvailable(false)
    }
  }, [token])

  useEffect(() => {
    void load()
  }, [load])

  if (available !== true || field.options.length === 0) return null

  const hasText = text.trim().length > 0

  async function run(): Promise<void> {
    if (!hasText || running) return
    setRunning(true)
    setError(null)
    setResult(null)
    try {
      setResult(await runClassify(token, { text, taxonomy: field.options }))
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : t('assist.classifyError'))
    } finally {
      setRunning(false)
    }
  }

  function accept(label: string): void {
    if (currentValue.includes(label)) return
    onAccept(field.name, [...currentValue, label])
  }

  return (
    <section aria-labelledby="classify-panel-heading">
      <h2 id="classify-panel-heading">{t('assist.classifyHeading')}</h2>
      {!hasText && <p>{t('assist.needsText')}</p>}
      <button type="button" disabled={!hasText || running} onClick={() => void run()}>
        {running ? t('assist.running') : t('assist.classifyButton')}
      </button>

      {error !== null && <p role="alert">{error}</p>}

      {result !== null && (
        <div>
          {result.labels.length === 0 && <p>{t('assist.classifyEmpty')}</p>}
          <ul>
            {result.labels.map((suggestion) => (
              <li key={suggestion.label}>
                {suggestion.label} ({Math.round(suggestion.confidence * 100)}%){' '}
                {currentValue.includes(suggestion.label) ? (
                  <span>{t('assist.classifyAlreadyApplied')}</span>
                ) : (
                  <button type="button" onClick={() => accept(suggestion.label)}>
                    {t('assist.use')}
                  </button>
                )}
              </li>
            ))}
          </ul>
          {result.rejected.length > 0 && (
            <p>{t('assist.classifyRejected', { labels: result.rejected.join(', ') })}</p>
          )}
          <p>{t('assist.notApplied')}</p>
        </div>
      )}
    </section>
  )
}
