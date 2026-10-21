import { type JSX, useCallback, useEffect, useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { ModerationVerdict } from '../api/assist-client.js'
import { getAssistCapabilities, runModerate } from '../api/assist-client.js'
import { describeApiError } from '../api/describe-error.js'
import { Button, Card, CardBody, CardHeader, CardTitle, Notice } from '../ui/index.js'

/**
 * `assist.moderate` given a screen — a signal, never an action.
 *
 * The tool's own output can only ever say `none` or `review`
 * (`packages/agents/src/assist/classify.ts`'s `RECOMMENDED_ACTIONS`): there is
 * no member of that union that means "remove" or "unpublish", so nothing this
 * component renders can be a delete button wearing a different label. A
 * flagged verdict is a badge a human reads, nothing more.
 */

export interface ModerationCheckProps {
  readonly token: string
  readonly text: string
  readonly contextLabel?: string
}

export function ModerationCheck({
  token,
  text,
  contextLabel,
}: ModerationCheckProps): JSX.Element | null {
  const { t } = useTranslation()
  const headingId = useId()
  const [available, setAvailable] = useState<boolean | null>(null)
  const [running, setRunning] = useState(false)
  const [verdict, setVerdict] = useState<ModerationVerdict | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const capabilities = await getAssistCapabilities(token)
      setAvailable(
        capabilities.available &&
          capabilities.tools.some((tool) => tool.tool === 'assist.moderate'),
      )
    } catch {
      setAvailable(false)
    }
  }, [token])

  useEffect(() => {
    void load()
  }, [load])

  if (available !== true) return null

  const hasText = text.trim().length > 0

  async function check(): Promise<void> {
    if (!hasText || running) return
    setRunning(true)
    setError(null)
    setVerdict(null)
    try {
      setVerdict(await runModerate(token, { text }))
    } catch (caught) {
      setError(describeApiError(caught, t('assist.moderateError')).message)
    } finally {
      setRunning(false)
    }
  }

  const result = (
    <>
      <div>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={!hasText || running}
          onClick={() => void check()}
        >
          {running
            ? t('assist.running')
            : t(contextLabel === undefined ? 'assist.moderateButton' : 'assist.moderateInlineButton')}
        </Button>
      </div>

      {error !== null && (
        <Notice tone="danger" live="assertive">
          <p>{error}</p>
        </Notice>
      )}

      {verdict !== null && !verdict.flagged && (
        <p className="m-0 text-sm">{t('assist.moderateClear')}</p>
      )}
      {verdict?.flagged === true && (
        <p role="status" className="m-0 text-sm">
          {/* A badge, in words rather than colour alone, so the signal survives
              without relying on sight (a11y). */}
          <strong>
            {t('assist.moderateFlagged', { severity: t(`assist.severity.${verdict.severity}`) })}
          </strong>
          {' — '}
          {verdict.reason}
          {verdict.categories.length > 0 && ` (${verdict.categories.join(', ')})`}
        </p>
      )}
    </>
  )

  // Inside a list row (the comments queue) the check is a small button with
  // its outcome beside it; on an entry it is a card of its own, like the other
  // assistant panels.
  if (contextLabel !== undefined) {
    return (
      <section aria-label={contextLabel} className="flex flex-col gap-2 pt-2">
        {result}
      </section>
    )
  }

  return (
    <Card aria-labelledby={headingId}>
      <CardHeader>
        <CardTitle>
          <h2 id={headingId}>{t('assist.moderateHeading')}</h2>
        </CardTitle>
      </CardHeader>
      <CardBody className="flex flex-col gap-3">{result}</CardBody>
    </Card>
  )
}
