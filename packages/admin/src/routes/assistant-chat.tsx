import { type FormEvent, type JSX, useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import type { ChatAnswer, ChatSource } from '../api/assist-client.js'
import { getAssistCapabilities, runChat } from '../api/assist-client.js'
import { ApiError } from '../api/client.js'
import { useAuth } from '../auth/auth-context.js'
import { readableCollections } from '../schema/permissions.js'
import { useSchema } from '../schema/schema-context.js'

/**
 * L18 task 6's chat/RAG tool, given a real screen.
 *
 * `assist.chat` was written and tested (`packages/agents/src/assist/chat.ts`)
 * but had no surface anywhere in the admin — `AssistantPanel` deliberately
 * skips it, since it needs a question and a collection scope the per-field
 * panel has no way to collect (see that file's own comment). This route is
 * that surface.
 *
 * Same degradation rule as the standalone-nav-entry days (R2): `GET
 * /api/assistant` is asked once, and until `assist.chat` is confirmed absent
 * from the list the server sent back, nothing is claimed either way.
 *
 * Fiche 30 task 2: this is no longer a standalone nav entry, it is mounted as
 * the "Interroger le site" tab of `routes/assistant.tsx`. That parent already
 * guarantees `capabilities.available` (no provider at all renders its own
 * notice before any tab exists to click) — but a provider can still be
 * configured with `assist.chat` specifically switched off, and that tab must
 * say so rather than render as a blank panel indistinguishable from a bug
 * (L20 audit, §1 point 4). So this component keeps its own independent
 * capability check, and shows an honest state for all three outcomes: still
 * checking, confirmed unavailable, and available.
 *
 * The answer's citations are the whole security argument of the underlying
 * tool: the model only ever names 1-based indices into passages retrieval
 * already found, so every source shown here traces back to a real entry this
 * actor could read (R8 — the excerpt is shown as data to read, never run).
 */

interface Turn {
  readonly question: string
  readonly answer: string
  readonly sources: readonly ChatSource[]
  readonly answeredFromSources: boolean
}

export function AssistantChatRoute(): JSX.Element | null {
  const { t } = useTranslation()
  const auth = useAuth()
  const schemaState = useSchema()

  const token = auth.state.status === 'authenticated' ? auth.state.token : null
  const roles = auth.state.status === 'authenticated' ? auth.state.user.roles : []
  const locale =
    schemaState.status === 'ready' ? (schemaState.schema.site?.defaultLocale ?? 'en') : 'en'
  const collections =
    schemaState.status === 'ready'
      ? readableCollections(schemaState.schema.collections, roles).map(
          (collection) => collection.name,
        )
      : []

  const [available, setAvailable] = useState<boolean | null>(null)
  const [question, setQuestion] = useState('')
  const [turns, setTurns] = useState<readonly Turn[]>([])
  const [asking, setAsking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (token === null) return
    try {
      const capabilities = await getAssistCapabilities(token)
      setAvailable(
        capabilities.available && capabilities.tools.some((tool) => tool.tool === 'assist.chat'),
      )
    } catch {
      // Treated exactly like "not configured" — see AssistantPanel's own note.
      setAvailable(false)
    }
  }, [token])

  useEffect(() => {
    void load()
  }, [load])

  if (token === null) return null

  if (available === null) {
    return (
      <section aria-labelledby="assistant-chat-heading">
        <h1 id="assistant-chat-heading">{t('assistChat.heading')}</h1>
        <p>{t('common.loading')}</p>
      </section>
    )
  }

  if (available === false) {
    return (
      <section aria-labelledby="assistant-chat-heading">
        <h1 id="assistant-chat-heading">{t('assistChat.heading')}</h1>
        <p role="status">{t('assistChat.unavailable')}</p>
      </section>
    )
  }

  async function ask(event: FormEvent): Promise<void> {
    event.preventDefault()
    const asked = question.trim()
    if (asked === '' || token === null || collections.length === 0 || asking) return

    setAsking(true)
    setError(null)
    try {
      // The admin's own origin is the site's own origin — `cogenta serve`
      // hosts both under one process — which is the site id the underlying
      // tool scopes retrieval by (`site.url` server-side). A documented
      // stand-in rather than a guess: there is no other place today that
      // exposes the configured `site.url` to this browser bundle.
      const answer: ChatAnswer = await runChat(token, {
        question: asked,
        locale,
        collections,
        siteId: window.location.origin,
      })
      setTurns((current) => [
        ...current,
        {
          question: asked,
          answer: answer.answer,
          sources: answer.sources,
          answeredFromSources: answer.answeredFromSources,
        },
      ])
      setQuestion('')
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : t('assistChat.error'))
    } finally {
      setAsking(false)
    }
  }

  return (
    <section aria-labelledby="assistant-chat-heading">
      <h1 id="assistant-chat-heading">{t('assistChat.heading')}</h1>
      <p>{t('assistChat.intro')}</p>

      <ol
        aria-label={t('assistChat.historyLabel')}
        className="m-0 flex list-none flex-col gap-4 p-0"
      >
        {turns.length === 0 && <li>{t('assistChat.empty')}</li>}
        {turns.map((turn, index) => (
          <li key={`${index}-${turn.question}`}>
            <p>
              <strong>{t('assistChat.you')}</strong> {turn.question}
            </p>
            <p>
              <strong>{t('assistChat.assistant')}</strong> {turn.answer}
            </p>
            {turn.answeredFromSources && turn.sources.length > 0 && (
              <div>
                <p>{t('assistChat.sourcesHeading')}</p>
                <ul>
                  {turn.sources.map((source) => (
                    <li key={`${source.collection}/${source.entryId}`}>
                      <Link
                        to={`/collections/${encodeURIComponent(source.collection)}/${encodeURIComponent(source.entryId)}`}
                      >
                        {source.title}
                      </Link>
                      {/* The excerpt is data quoted from the site's own content,
                          shown for a human to check the answer against — never
                          re-interpreted as anything but text (R8). */}
                      <p>“{source.excerpt}”</p>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </li>
        ))}
      </ol>

      {error !== null && <p role="alert">{error}</p>}

      <form onSubmit={(event) => void ask(event)}>
        <label htmlFor="assistant-chat-question">{t('assistChat.questionLabel')}</label>
        <br />
        <input
          id="assistant-chat-question"
          type="text"
          value={question}
          disabled={asking}
          onChange={(event) => setQuestion(event.target.value)}
        />{' '}
        <button type="submit" disabled={asking || question.trim() === ''}>
          {asking ? t('assistChat.asking') : t('assistChat.ask')}
        </button>
      </form>
    </section>
  )
}
