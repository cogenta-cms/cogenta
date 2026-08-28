import { type JSX, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  type AssistSuggestion,
  getAssistCapabilities,
  runAssistTool,
} from '../api/assist-client.js'
import { ApiError } from '../api/client.js'
import { Button, Notice } from '../ui/index.js'

/**
 * Fiche 44 task 3 — "Generate the excerpt with AI", rendered next to the
 * `excerpt` field in `EntryForm`. Calques `seo-panel.tsx`'s own suggest
 * blocks (bouton → `runAssistTool` → suggestion list → apply on click) —
 * the same motif, a second real usage rather than a shared helper: the two
 * call sites differ enough (a server-computed preview and a whole optional
 * panel there, one plain field here) that factoring them now would cost more
 * than the handful of duplicated lines saves (AGENTS.md: no abstraction
 * before three real usages).
 *
 * R2: renders nothing until `GET /api/assistant` names `assist.summarise`
 * among the tools an actual provider makes available — no provider, no
 * button, and the rest of the form is unaffected either way.
 *
 * R7: this component never sees a secret — the token it is handed is the
 * signed-in actor's own session token, the same one every other admin
 * request already carries; the LLM provider credentials themselves live
 * server-side, injected by `createAssistToolset`'s runtime, never here.
 */
export interface ExcerptAssistButtonProps {
  readonly token: string
  /** Plain text of the entry's `body` field, computed by the caller — never the portable-text document itself. */
  readonly bodyText: string
  onChange(value: string): void
  readonly disabled?: boolean
  readonly maxWords?: number
}

export function ExcerptAssistButton({
  token,
  bodyText,
  onChange,
  disabled = false,
  maxWords = 50,
}: ExcerptAssistButtonProps): JSX.Element | null {
  const { t } = useTranslation()
  const [available, setAvailable] = useState(false)
  const [suggesting, setSuggesting] = useState(false)
  const [suggestions, setSuggestions] = useState<readonly string[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    getAssistCapabilities(token)
      .then((capabilities) => {
        if (cancelled) return
        const tools = new Set(capabilities.tools.map((tool) => tool.tool))
        setAvailable(capabilities.available && tools.has('assist.summarise'))
      })
      .catch(() => {
        if (!cancelled) setAvailable(false)
      })
    return () => {
      cancelled = true
    }
  }, [token])

  if (!available) return null

  async function suggest(): Promise<void> {
    if (suggesting) return
    setSuggesting(true)
    setError(null)
    setSuggestions(null)
    try {
      const result = await runAssistTool<AssistSuggestion>(token, 'assist.summarise', {
        text: bodyText,
        maxWords,
      })
      setSuggestions(result.suggestions)
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : t('excerptAssist.error'))
    } finally {
      setSuggesting(false)
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <Button
        type="button"
        variant="secondary"
        size="sm"
        disabled={disabled || suggesting || bodyText === ''}
        onClick={() => void suggest()}
      >
        {suggesting ? t('excerptAssist.suggesting') : t('excerptAssist.suggestButton')}
      </Button>
      {error !== null && (
        <Notice tone="danger" live="assertive">
          <p>{error}</p>
        </Notice>
      )}
      {suggestions !== null && (
        <ul className="flex flex-col gap-1">
          {suggestions.map((suggestion) => (
            <li key={suggestion}>
              <button
                type="button"
                className="text-left text-sm text-primary underline"
                onClick={() => {
                  onChange(suggestion)
                  setSuggestions(null)
                }}
              >
                {suggestion}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
