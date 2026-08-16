import { type JSX, useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { ModerationVerdict } from '../api/assist-client.js'
import { getAssistCapabilities, runModerate } from '../api/assist-client.js'
import { ApiError } from '../api/client.js'

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
}

export function ModerationCheck({ token, text }: ModerationCheckProps): JSX.Element | null {
  const { t } = useTranslation()
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
      setError(caught instanceof ApiError ? caught.message : t('assist.moderateError'))
    } finally {
      setRunning(false)
    }
  }

  return (
    <section aria-labelledby="moderation-check-heading">
      <h2 id="moderation-check-heading">{t('assist.moderateHeading')}</h2>
      <button type="button" disabled={!hasText || running} onClick={() => void check()}>
        {running ? t('assist.running') : t('assist.moderateButton')}
      </button>

      {error !== null && <p role="alert">{error}</p>}

      {verdict !== null && !verdict.flagged && <p>{t('assist.moderateClear')}</p>}
      {verdict?.flagged === true && (
        <p role="status">
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
    </section>
  )
}
