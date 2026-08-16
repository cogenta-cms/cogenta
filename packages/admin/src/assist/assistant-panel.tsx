import { type JSX, useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { AssistCapability, AssistSuggestion } from '../api/assist-client.js'
import { getAssistCapabilities, runAssistTool } from '../api/assist-client.js'
import { ApiError } from '../api/client.js'
import { Button, Card, CardBody, CardHeader, CardTitle, Input, Label, Notice } from '../ui/index.js'

/**
 * L18 task 3 — the assistant panel on a content entry.
 *
 * Built from the shadcn/ui components L11 introduced, and it obeys the lot's
 * hardest interface rule: **when no AI provider is configured, this renders
 * absolutely nothing.** Not a disabled button, not a "configure AI" upsell, not
 * an error — `null`. The editor of a site that made the R2 choice never learns
 * this feature exists, which is the point.
 *
 * Nothing in here writes to the entry. A suggestion is text with an "Use this"
 * button that hands it to the form through `onApply`; the editor still has to
 * save, through the same route and the same permission check that an edit typed
 * by hand goes through (R6). The panel says so, in the footer, every time.
 */

/** Inputs this panel knows how to fill on its own, beyond the entry text. */
const SUPPLIED_BY_PANEL: ReadonlySet<string> = new Set(['targetLocale'])

/** One plain-text field of the entry the assistant can work on. */
export interface AssistField {
  readonly name: string
  readonly label: string
  readonly value: string
}

export interface AssistantPanelProps {
  readonly token: string
  /** The entry's plain-text fields. The editor picks which one to work on. */
  readonly fields: readonly AssistField[]
  readonly locale: string
  readonly siteLocales: readonly string[]
  /** Called when the editor accepts a suggestion. The panel never applies one itself. */
  onApply(field: string, text: string): void
}

interface RunState {
  readonly tool: string
  readonly suggestion: AssistSuggestion
}

export function AssistantPanel({
  token,
  fields,
  locale,
  siteLocales,
  onApply,
}: AssistantPanelProps): JSX.Element | null {
  const { t } = useTranslation()
  const [tools, setTools] = useState<readonly AssistCapability[] | null>(null)
  const [available, setAvailable] = useState<boolean | null>(null)
  const [running, setRunning] = useState<string | null>(null)
  const [result, setResult] = useState<RunState | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [targetLocale, setTargetLocale] = useState(
    siteLocales.find((candidate) => candidate !== locale) ?? locale,
  )
  const [goal, setGoal] = useState('')
  const [fieldName, setFieldName] = useState(fields[0]?.name ?? '')

  const load = useCallback(async () => {
    try {
      const capabilities = await getAssistCapabilities(token)
      setAvailable(capabilities.available)
      setTools(capabilities.tools)
    } catch {
      // A failure to *ask* is treated exactly like "not configured": the panel
      // disappears. An editor who never enabled AI must not be shown an error
      // about a feature they do not have, and one who did will see it come back
      // on the next load.
      setAvailable(false)
      setTools([])
    }
  }, [token])

  useEffect(() => {
    void load()
  }, [load])

  // The whole point of the lot's degradation rule: nothing at all.
  if (available !== true || tools === null) return null

  // Only the tools this panel can actually drive. A tool whose `needs` this
  // panel cannot fill — `assist.chat` wants a question and a collection scope,
  // `assist.find_duplicates` wants a site id, `assist.generate_image` wants its
  // own prompt box — is not rendered as a button that would fail when pressed.
  // Those live on `/api/assistant` and get their own surfaces; this panel is the
  // writing assistant on a field, which is exactly what L18 task 3 describes.
  const renderable = tools.filter((tool) => tool.needs.every((need) => SUPPLIED_BY_PANEL.has(need)))
  if (renderable.length === 0 || fields.length === 0) return null

  const field = fields.find((candidate) => candidate.name === fieldName) ?? fields[0]
  const text = field?.value ?? ''
  const hasText = text.trim().length > 0

  async function run(tool: AssistCapability): Promise<void> {
    setRunning(tool.tool)
    setError(null)
    setResult(null)
    try {
      const input: Record<string, unknown> = { text, locale }
      if (tool.needs.includes('targetLocale')) input['targetLocale'] = targetLocale
      if (tool.tool === 'assist.rewrite' && goal.trim().length > 0) input['goal'] = goal.trim()
      if (tool.tool === 'assist.alt_text') {
        input['context'] = text
        delete input['text']
      }
      setResult({ tool: tool.tool, suggestion: await runAssistTool(token, tool.tool, input) })
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : t('assist.runError'))
    } finally {
      setRunning(null)
    }
  }

  return (
    <Card aria-labelledby="assistant-panel-title">
      <CardHeader>
        <CardTitle id="assistant-panel-title">{t('assist.title')}</CardTitle>
      </CardHeader>
      <CardBody className="flex flex-col gap-4">
        {fields.length > 1 && (
          <div className="flex flex-col gap-1">
            <Label htmlFor="assist-field">{t('assist.fieldLabel')}</Label>
            <select
              id="assist-field"
              value={field?.name ?? ''}
              onChange={(event) => {
                setFieldName(event.target.value)
                setResult(null)
              }}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            >
              {fields.map((candidate) => (
                <option key={candidate.name} value={candidate.name}>
                  {candidate.label}
                </option>
              ))}
            </select>
          </div>
        )}

        {!hasText && <p className="m-0 text-sm text-muted-foreground">{t('assist.needsText')}</p>}

        <div className="flex flex-wrap gap-2">
          {renderable.map((tool) => (
            <Button
              key={tool.tool}
              type="button"
              variant="secondary"
              size="sm"
              disabled={!hasText || running !== null}
              title={tool.description}
              onClick={() => {
                void run(tool)
              }}
            >
              {running === tool.tool ? t('assist.running') : tool.label}
            </Button>
          ))}
        </div>

        {renderable.some((tool) => tool.tool === 'assist.rewrite') && (
          <div className="flex flex-col gap-1">
            <Label htmlFor="assist-goal">{t('assist.goalLabel')}</Label>
            <Input
              id="assist-goal"
              value={goal}
              placeholder={t('assist.goalPlaceholder')}
              onChange={(event) => setGoal(event.target.value)}
            />
          </div>
        )}

        {renderable.some((tool) => tool.needs.includes('targetLocale')) &&
          siteLocales.length > 1 && (
            <div className="flex flex-col gap-1">
              <Label htmlFor="assist-target-locale">{t('assist.targetLocale')}</Label>
              <select
                id="assist-target-locale"
                value={targetLocale}
                onChange={(event) => setTargetLocale(event.target.value)}
                className="h-9 rounded-md border border-input bg-background px-3 text-sm"
              >
                {siteLocales
                  .filter((candidate) => candidate !== locale)
                  .map((candidate) => (
                    <option key={candidate} value={candidate}>
                      {candidate}
                    </option>
                  ))}
              </select>
            </div>
          )}

        {error !== null && (
          <Notice tone="danger" live="assertive" title={t('assist.errorTitle')}>
            <p>{error}</p>
          </Notice>
        )}

        {result !== null && (
          <div className="flex flex-col gap-3">
            {result.suggestion.note !== undefined && (
              <p className="m-0 text-sm text-muted-foreground">{result.suggestion.note}</p>
            )}
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              {result.suggestion.suggestions.map((candidate) => (
                <li
                  key={candidate}
                  className="flex flex-col gap-2 rounded-md border border-input p-3"
                >
                  <p className="m-0 whitespace-pre-wrap text-sm">{candidate}</p>
                  <div>
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => {
                        if (field !== undefined) onApply(field.name, candidate)
                      }}
                    >
                      {t('assist.use')}
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
            {/* Said out loud, every time, because it is the whole contract of
                this panel: nothing here has changed the entry. */}
            <p className="m-0 text-xs text-muted-foreground">{t('assist.notApplied')}</p>
          </div>
        )}
      </CardBody>
    </Card>
  )
}
