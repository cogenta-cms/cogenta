import { type JSX, useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { ClassificationResult } from '../api/assist-client.js'
import { getAssistCapabilities, runClassify } from '../api/assist-client.js'
import { describeApiError } from '../api/describe-error.js'
import { Button, Card, CardBody, CardHeader, CardTitle, Notice } from '../ui/index.js'

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
      setError(describeApiError(caught, t('assist.classifyError')).message)
    } finally {
      setRunning(false)
    }
  }

  function accept(label: string): void {
    if (currentValue.includes(label)) return
    onAccept(field.name, [...currentValue, label])
  }

  return (
    <Card aria-labelledby="classify-panel-heading">
      <CardHeader>
        <CardTitle>
          <h2 id="classify-panel-heading">{t('assist.classifyHeading')}</h2>
        </CardTitle>
      </CardHeader>
      <CardBody className="flex flex-col gap-3">
        {!hasText && <p className="m-0 text-sm text-muted-foreground">{t('assist.needsText')}</p>}
        <div>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={!hasText || running}
            onClick={() => void run()}
          >
            {running ? t('assist.running') : t('assist.classifyButton')}
          </Button>
        </div>

        {error !== null && (
          <Notice tone="danger" live="assertive">
            <p>{error}</p>
          </Notice>
        )}

        {result !== null && (
          <div className="flex flex-col gap-2">
            {result.labels.length === 0 && (
              <p className="m-0 text-sm">{t('assist.classifyEmpty')}</p>
            )}
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              {result.labels.map((suggestion) => (
                <li
                  key={suggestion.label}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-input px-3 py-2 text-sm"
                >
                  <span>
                    {suggestion.label}{' '}
                    <span className="text-muted-foreground">
                      ({Math.round(suggestion.confidence * 100)} %)
                    </span>
                  </span>
                  {currentValue.includes(suggestion.label) ? (
                    <span className="text-muted-foreground">
                      {t('assist.classifyAlreadyApplied')}
                    </span>
                  ) : (
                    <Button type="button" size="sm" onClick={() => accept(suggestion.label)}>
                      {t('assist.use')}
                    </Button>
                  )}
                </li>
              ))}
            </ul>
            {result.rejected.length > 0 && (
              <p className="m-0 text-sm text-muted-foreground">
                {t('assist.classifyRejected', { labels: result.rejected.join(', ') })}
              </p>
            )}
            <p className="m-0 text-xs text-muted-foreground">{t('assist.notApplied')}</p>
          </div>
        )}
      </CardBody>
    </Card>
  )
}
