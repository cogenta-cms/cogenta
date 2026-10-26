import {
  type FormEvent,
  type JSX,
  type KeyboardEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { describeAiErrorLine } from '../ai/server-text.js'
import { shorten } from '../ai/shorten.js'
import type { ChatAnswer, ChatSource } from '../api/assist-client.js'
import { getAssistCapabilities, runChat } from '../api/assist-client.js'
import { useAuth } from '../auth/auth-context.js'
import { readableCollections } from '../schema/permissions.js'
import { useSchema } from '../schema/schema-context.js'
import { Button, Card, CardBody, CopyButton, Notice } from '../ui/index.js'

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

/** One question and what became of it: an answer, or the reason there is none. */
interface Turn {
  readonly question: string
  readonly answer?: string
  readonly sources?: readonly ChatSource[]
  readonly answeredFromSources?: boolean
  readonly error?: string
}

export function AssistantChatRoute({
  onOpenIndex,
}: {
  /** Goes to the Index tab, where a stale or empty index is fixed. Absent when the index is not shown. */
  readonly onOpenIndex?: () => void
} = {}): JSX.Element | null {
  const { t } = useTranslation()
  const auth = useAuth()
  const schemaState = useSchema()

  const token = auth.state.status === 'authenticated' ? auth.state.token : null
  const roles = auth.state.status === 'authenticated' ? auth.state.user.roles : []
  const isAdmin = roles.includes('admin')
  const locale =
    schemaState.status === 'ready' ? (schemaState.schema.site?.defaultLocale ?? 'en') : 'en'
  const readable =
    schemaState.status === 'ready' ? readableCollections(schemaState.schema.collections, roles) : []
  const collections = readable.map((collection) => collection.name)

  const [referenceCollection, setReferenceCollection] = useState<string | null>(null)
  const searchCollections = [
    ...collections,
    ...(referenceCollection === null ? [] : [referenceCollection]),
  ]

  const [available, setAvailable] = useState<boolean | null>(null)
  const [question, setQuestion] = useState('')
  const [turns, setTurns] = useState<readonly Turn[]>([])
  const [asking, setAsking] = useState(false)
  const endRef = useRef<HTMLDivElement | null>(null)

  const load = useCallback(async () => {
    if (token === null) return
    try {
      const capabilities = await getAssistCapabilities(token)
      setReferenceCollection(isAdmin ? (capabilities.vector?.referenceCollection ?? null) : null)
      setAvailable(
        capabilities.available && capabilities.tools.some((tool) => tool.tool === 'assist.chat'),
      )
    } catch {
      // Treated exactly like "not configured" — see AssistantPanel's own note.
      setAvailable(false)
    }
  }, [token, isAdmin])

  useEffect(() => {
    void load()
  }, [load])

  // The newest exchange stays in view, like any chat.
  const turnCount = turns.length
  // biome-ignore lint/correctness/useExhaustiveDependencies: a new turn or the "asking" state is the trigger.
  useEffect(() => {
    endRef.current?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' })
  }, [turnCount, asking])

  if (token === null) return null

  if (available === null) {
    return (
      <section aria-labelledby="assistant-chat-heading">
        <h2 id="assistant-chat-heading" className="m-0 text-lg font-semibold">
          {t('assistChat.heading')}
        </h2>
        <p>{t('common.loading')}</p>
      </section>
    )
  }

  if (available === false) {
    return (
      <section aria-labelledby="assistant-chat-heading">
        <h2 id="assistant-chat-heading" className="m-0 text-lg font-semibold">
          {t('assistChat.heading')}
        </h2>
        <p role="status">{t('assistChat.unavailable')}</p>
      </section>
    )
  }

  async function ask(event: FormEvent): Promise<void> {
    event.preventDefault()
    const asked = question.trim()
    if (asked === '' || token === null || searchCollections.length === 0 || asking) return

    setAsking(true)
    setQuestion('')
    try {
      // The server states which site this is (its own configured address) and
      // replaces this value: a browser only knows the origin it was served
      // from, which differs behind a proxy or on a second host name.
      const answer: ChatAnswer = await runChat(token, {
        question: asked,
        locale,
        collections: searchCollections,
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
    } catch (caught) {
      // A failed question stays on screen with its reason, instead of vanishing.
      setTurns((current) => [
        ...current,
        { question: asked, error: describeAiErrorLine(caught, t, t('assistChat.error')) },
      ])
    } finally {
      setAsking(false)
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      void ask(event)
    }
  }

  // The scope in the words the admin uses everywhere else, not identifiers.
  const scopeLabels = readable.map((collection) => collection.labels.plural).join(', ')

  return (
    <section aria-labelledby="assistant-chat-heading" className="flex min-w-0 flex-col gap-4">
      <div>
        <h2 id="assistant-chat-heading" className="m-0 text-lg font-semibold">
          {t('assistChat.heading')}
        </h2>
        <p className="m-0 mt-1 text-sm text-muted-foreground">{t('assistChat.intro')}</p>
        <p className="m-0 mt-1 text-sm text-muted-foreground">
          {t('assistChat.scopeContent', { collections: scopeLabels, locale })}
        </p>
        {referenceCollection !== null && (
          <p className="m-0 mt-1 text-sm text-muted-foreground">
            {t('assistChat.scopeReferences')}
          </p>
        )}
      </div>

      {turns.length > 0 && (
        <ol
          aria-label={t('assistChat.historyLabel')}
          className="m-0 flex list-none flex-col gap-4 p-0"
        >
          {turns.map((turn, index) => (
            <li key={`${index}-${turn.question}`} className="flex min-w-0 flex-col gap-2">
              <div className="flex justify-end">
                <p className="m-0 max-w-[85%] rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground shadow-card">
                  <span className="sr-only">{t('assistChat.you')} </span>
                  {turn.question}
                </p>
              </div>
              {turn.error !== undefined ? (
                <Notice tone="danger" live="polite">
                  <p>{turn.error}</p>
                </Notice>
              ) : (
                <Card>
                  <CardBody className="flex flex-col gap-3">
                    <p className="m-0 whitespace-pre-wrap text-sm leading-6">
                      <span className="sr-only">{t('assistChat.assistant')} </span>
                      {turn.answer}
                    </p>
                    {turn.answeredFromSources === true && (turn.sources?.length ?? 0) > 0 ? (
                      <div>
                        <p className="m-0 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                          {t('assistChat.sourcesHeading')}
                        </p>
                        <ul className="m-0 mt-2 flex list-none flex-col gap-2 p-0">
                          {(turn.sources ?? []).map((source) => (
                            <li
                              key={`${source.collection}/${source.entryId}`}
                              className="min-w-0 rounded-md border border-border p-3 text-sm"
                            >
                              {source.collection === referenceCollection ? (
                                <span className="font-medium">{source.title}</span>
                              ) : (
                                <Link
                                  className="font-medium"
                                  to={`/collections/${encodeURIComponent(source.collection)}/${encodeURIComponent(source.entryId)}`}
                                >
                                  {source.title}
                                </Link>
                              )}
                              {/* The excerpt is data quoted from the site's own content,
                                  shown for a human to check the answer against — never
                                  re-interpreted as anything but text (R8). */}
                              <p className="m-0 mt-1 text-xs text-muted-foreground">
                                “{shorten(source.excerpt, 320)}”
                              </p>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : (
                      <p className="m-0 text-xs text-muted-foreground">
                        {t('assistChat.noSources')}{' '}
                        {onOpenIndex !== undefined && (
                          <button
                            type="button"
                            className="cursor-pointer appearance-none border-0 bg-transparent p-0 text-xs text-primary underline"
                            onClick={onOpenIndex}
                          >
                            {t('assistChat.checkIndex')}
                          </button>
                        )}
                      </p>
                    )}
                    {turn.answer !== undefined && (
                      <div>
                        <CopyButton
                          value={turn.answer}
                          label={t('assistChat.copyAnswer')}
                          copiedLabel={t('assistChat.copied')}
                        />
                      </div>
                    )}
                  </CardBody>
                </Card>
              )}
            </li>
          ))}
          {asking && (
            <li className="text-sm text-muted-foreground italic" aria-live="polite">
              {t('assistChat.asking')}
            </li>
          )}
        </ol>
      )}
      {turns.length === 0 && !asking && (
        <p className="m-0 text-sm text-muted-foreground">{t('assistChat.empty')}</p>
      )}

      <form onSubmit={(event) => void ask(event)} className="flex flex-col gap-2">
        <label htmlFor="assistant-chat-question" className="text-sm font-medium">
          {t('assistChat.questionLabel')}
        </label>
        <textarea
          id="assistant-chat-question"
          rows={3}
          className="w-full min-w-0 resize-y rounded-md border border-input bg-card px-3 py-2 font-sans text-sm leading-5 text-card-foreground shadow-card"
          value={question}
          disabled={asking}
          placeholder={t('assistChat.placeholder')}
          onChange={(event) => setQuestion(event.target.value)}
          onKeyDown={onKeyDown}
        />
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={asking || question.trim() === ''}>
            {asking ? t('assistChat.asking') : t('assistChat.ask')}
          </Button>
          {turns.length > 0 && (
            <Button type="button" variant="ghost" disabled={asking} onClick={() => setTurns([])}>
              {t('assistChat.clear')}
            </Button>
          )}
          <span className="text-xs text-muted-foreground">{t('assistChat.composerHint')}</span>
        </div>
      </form>
      <div ref={endRef} />
    </section>
  )
}
