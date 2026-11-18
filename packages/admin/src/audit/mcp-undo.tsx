import { type JSX, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { AuditEntry } from '../api/audit-client.js'
import { type ApiErrorDescription, describeApiError } from '../api/describe-error.js'
import { getMcpAction, type McpAction, revertMcpAction } from '../api/mcp-actions-client.js'
import { useAuth } from '../auth/auth-context.js'
import { useDateTimeFormatter } from '../settings/site-settings-context.js'
import { Badge, Button, Notice } from '../ui/index.js'

/**
 * Whether an audit entry is a tool call an MCP client made that succeeded —
 * the only kind the server will undo (`mcp-undo.ts`). An undo is itself an
 * entry (`agent.tool.<tool>.revert`) and is not one.
 */
export function isUndoableCandidate(entry: AuditEntry): boolean {
  const diff = entry.diff
  if (diff === null || diff['origin'] !== 'mcp' || diff['ok'] !== true) return false
  const tool = diff['tool']
  return typeof tool === 'string' && entry.action === `agent.tool.${tool}`
}

type Step =
  | { readonly kind: 'checking' }
  | { readonly kind: 'hidden' }
  | { readonly kind: 'available' }
  | { readonly kind: 'confirming' }
  | { readonly kind: 'undoing' }
  | { readonly kind: 'done' }
  | { readonly kind: 'refused'; readonly error: ApiErrorDescription }
  | { readonly kind: 'reverted'; readonly at: string }

/**
 * "Annuler cette action", in the detail of an audit entry (L42, R6).
 *
 * An autonomous API key publishes without a person's approval, so the journal
 * is where an administrator takes an action back. The button asks the server
 * whether the entry can be undone (a tool that has an undo, a call that
 * succeeded, not already undone), confirms in the page, then asks it to undo —
 * the server runs the tool's own `revert` as this administrator and refuses,
 * saying why, when the content was edited since.
 */
export function McpUndo({ entry }: { readonly entry: AuditEntry }): JSX.Element | null {
  const { t } = useTranslation()
  const formatWhen = useDateTimeFormatter()
  const auth = useAuth()
  const token = auth.state.status === 'authenticated' ? auth.state.token : null
  const candidate = isUndoableCandidate(entry)
  const [step, setStep] = useState<Step>({ kind: candidate ? 'checking' : 'hidden' })

  useEffect(() => {
    if (!candidate || token === null) {
      setStep({ kind: 'hidden' })
      return
    }
    let cancelled = false
    setStep({ kind: 'checking' })
    getMcpAction(token, entry.id).then(
      (action: McpAction) => {
        if (cancelled) return
        if (action.state === 'available') setStep({ kind: 'available' })
        else if (action.state === 'reverted') setStep({ kind: 'reverted', at: action.revertedAt })
        else setStep({ kind: 'hidden' })
      },
      () => {
        // A failed look-up offers nothing: the button must never promise an undo the server did not confirm.
        if (!cancelled) setStep({ kind: 'hidden' })
      },
    )
    return () => {
      cancelled = true
    }
  }, [candidate, token, entry.id])

  async function undo(): Promise<void> {
    if (token === null) return
    setStep({ kind: 'undoing' })
    try {
      await revertMcpAction(token, entry.id)
      setStep({ kind: 'done' })
    } catch (caught) {
      setStep({ kind: 'refused', error: describeApiError(caught, t('audit.undo.refused')) })
    }
  }

  switch (step.kind) {
    case 'checking':
    case 'hidden':
      return null
    case 'reverted':
      return (
        <p className="m-0 flex flex-wrap items-center gap-2 text-sm">
          <Badge tone="neutral">{t('audit.undo.reverted')}</Badge>
          <span className="text-muted-foreground">
            {t('audit.undo.revertedAt', { at: formatWhen(step.at) })}
          </span>
        </p>
      )
    case 'done':
      return (
        <Notice tone="success" live="polite">
          <p>{t('audit.undo.done')}</p>
        </Notice>
      )
    case 'refused':
      return (
        <Notice tone="danger" live="assertive" title={t('audit.undo.refused')}>
          <p>{step.error.message}</p>
          {step.error.hint !== undefined && <p>{step.error.hint}</p>}
        </Notice>
      )
    case 'available':
      return (
        <div>
          <Button variant="secondary" onClick={() => setStep({ kind: 'confirming' })}>
            {t('audit.undo.button')}
          </Button>
        </div>
      )
    case 'confirming':
    case 'undoing':
      return (
        <Notice tone="warning" live="polite">
          <p>{t('audit.undo.confirm')}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              variant="destructive"
              disabled={step.kind === 'undoing'}
              onClick={() => void undo()}
            >
              {step.kind === 'undoing' ? t('audit.undo.undoing') : t('audit.undo.confirmButton')}
            </Button>
            <Button
              variant="secondary"
              disabled={step.kind === 'undoing'}
              onClick={() => setStep({ kind: 'available' })}
            >
              {t('audit.undo.keepButton')}
            </Button>
          </div>
        </Notice>
      )
  }
}
