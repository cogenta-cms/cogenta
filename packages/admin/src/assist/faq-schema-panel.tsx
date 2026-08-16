import { type JSX, useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { FaqDraft, SchemaDraft } from '../api/assist-client.js'
import { getAssistCapabilities, runFaqDraft, runSchemaOrgDraft } from '../api/assist-client.js'
import { ApiError } from '../api/client.js'
import type { ContentBlock } from '../api/content-client.js'
import { freshKey } from '../rich-text/portable-text.js'

/**
 * `assist.faq_draft` and `assist.schema_org_draft` given a screen — both
 * "toujours en brouillon proposé, jamais publié automatiquement" by the tool's
 * own output shape (`status: 'draft'` as a literal), and this panel keeps that
 * property rather than just displaying it: nothing here writes to the entry
 * until the editor clicks to accept.
 *
 * The FAQ draft has a real place to go — contract B's `faq` block
 * (`packages/blocks/src/vocabulary.ts`) — so accepting it appends one real
 * block to the page's block zone, through the same `onAccept` callback the
 * page builder itself uses to change `blocks` state; saving the entry is
 * still the editor's own separate submit.
 *
 * The Schema.org draft has **no** field to land in: contract A/B have no slot
 * for a page's *extra* JSON-LD (`@cogenta/seo` already builds the one every
 * page gets from the entry itself, wired in L10), and adding one is a
 * vocabulary change that needs an RFC (AGENTS.md), out of scope here. So this
 * half is shown for a human to read and copy by hand — never silently
 * discarded, but also never claiming an "Accept" button that would have
 * nowhere real to write.
 */

/** Hand-mirrored from `packages/agents/src/assist/faq.ts`'s `SCHEMA_TYPES` — this bundle does not import that Node package. */
const SCHEMA_TYPES = ['FAQPage', 'HowTo', 'Article', 'Recipe', 'Event'] as const

export interface FaqSchemaPanelProps {
  readonly token: string
  readonly text: string
  readonly title?: string
  /** The collection's block zone field name, when it has one. `null` disables the FAQ "accept" action, not the draft itself. */
  readonly blockZone: string | null
  onAcceptFaq(zone: string, block: ContentBlock): void
}

export function FaqSchemaPanel({
  token,
  text,
  title,
  blockZone,
  onAcceptFaq,
}: FaqSchemaPanelProps): JSX.Element | null {
  const { t } = useTranslation()
  const [faqAvailable, setFaqAvailable] = useState<boolean | null>(null)
  const [schemaAvailable, setSchemaAvailable] = useState<boolean | null>(null)
  const [faqRunning, setFaqRunning] = useState(false)
  const [faqDraft, setFaqDraft] = useState<FaqDraft | null>(null)
  const [faqApplied, setFaqApplied] = useState(false)
  const [faqError, setFaqError] = useState<string | null>(null)
  const [schemaType, setSchemaType] = useState<(typeof SCHEMA_TYPES)[number]>('Article')
  const [schemaRunning, setSchemaRunning] = useState(false)
  const [schemaDraft, setSchemaDraft] = useState<SchemaDraft | null>(null)
  const [schemaError, setSchemaError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const capabilities = await getAssistCapabilities(token)
      const tools = new Set(capabilities.tools.map((tool) => tool.tool))
      setFaqAvailable(capabilities.available && tools.has('assist.faq_draft'))
      setSchemaAvailable(capabilities.available && tools.has('assist.schema_org_draft'))
    } catch {
      setFaqAvailable(false)
      setSchemaAvailable(false)
    }
  }, [token])

  useEffect(() => {
    void load()
  }, [load])

  const hasText = text.trim().length > 0

  async function draftFaq(): Promise<void> {
    if (!hasText || faqRunning) return
    setFaqRunning(true)
    setFaqError(null)
    setFaqDraft(null)
    setFaqApplied(false)
    try {
      setFaqDraft(await runFaqDraft(token, { text }))
    } catch (caught) {
      setFaqError(caught instanceof ApiError ? caught.message : t('assist.faqError'))
    } finally {
      setFaqRunning(false)
    }
  }

  function acceptFaq(): void {
    if (faqDraft === null || blockZone === null || faqApplied) return
    const block: ContentBlock = {
      key: freshKey(),
      type: 'faq',
      data: {
        title: '',
        items: faqDraft.items.map((item) => ({
          _key: freshKey(),
          question: item.question,
          answer: paragraphOf(item.answer),
        })),
      },
    }
    onAcceptFaq(blockZone, block)
    setFaqApplied(true)
  }

  async function draftSchema(): Promise<void> {
    if (!hasText || schemaRunning) return
    setSchemaRunning(true)
    setSchemaError(null)
    setSchemaDraft(null)
    try {
      setSchemaDraft(
        await runSchemaOrgDraft(token, {
          text,
          type: schemaType,
          ...(title === undefined ? {} : { title }),
        }),
      )
    } catch (caught) {
      setSchemaError(caught instanceof ApiError ? caught.message : t('assist.schemaOrgError'))
    } finally {
      setSchemaRunning(false)
    }
  }

  if (faqAvailable !== true && schemaAvailable !== true) return null

  return (
    <section aria-labelledby="faq-schema-panel-heading">
      <h2 id="faq-schema-panel-heading">{t('assist.faqSchemaHeading')}</h2>

      {faqAvailable === true && (
        <div>
          <h3>{t('assist.faqButton')}</h3>
          {!hasText && <p>{t('assist.needsText')}</p>}
          <button type="button" disabled={!hasText || faqRunning} onClick={() => void draftFaq()}>
            {faqRunning ? t('assist.running') : t('assist.faqButton')}
          </button>
          {faqError !== null && <p role="alert">{faqError}</p>}
          {faqDraft !== null && (
            <div>
              <ul>
                {faqDraft.items.map((item) => (
                  <li key={item.question}>
                    <strong>{item.question}</strong>
                    <p>{item.answer}</p>
                  </li>
                ))}
              </ul>
              {blockZone !== null ? (
                <button type="button" disabled={faqApplied} onClick={acceptFaq}>
                  {faqApplied ? t('assist.faqAccepted') : t('assist.faqAccept')}
                </button>
              ) : (
                <p>{t('assist.faqNoBlockZone')}</p>
              )}
              <p>{t('assist.notApplied')}</p>
            </div>
          )}
        </div>
      )}

      {schemaAvailable === true && (
        <div>
          <h3>{t('assist.schemaOrgButton')}</h3>
          <label htmlFor="schema-org-type">{t('assist.schemaOrgType')}</label>{' '}
          <select
            id="schema-org-type"
            value={schemaType}
            onChange={(event) => setSchemaType(event.target.value as (typeof SCHEMA_TYPES)[number])}
          >
            {SCHEMA_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>{' '}
          {!hasText && <p>{t('assist.needsText')}</p>}
          <button
            type="button"
            disabled={!hasText || schemaRunning}
            onClick={() => void draftSchema()}
          >
            {schemaRunning ? t('assist.running') : t('assist.schemaOrgButton')}
          </button>
          {schemaError !== null && <p role="alert">{schemaError}</p>}
          {schemaDraft !== null && (
            <div>
              <pre>{JSON.stringify(schemaDraft.jsonLd, null, 2)}</pre>
              <p>{t('assist.schemaOrgNoTarget')}</p>
            </div>
          )}
        </div>
      )}
    </section>
  )
}

/** A single-paragraph rich-text document from a plain-text answer — contract A's minimum valid shape, per `packages/blocks/src/rich-text.ts`. */
function paragraphOf(text: string): readonly unknown[] {
  return [
    {
      _key: freshKey(),
      _type: 'block',
      style: 'normal',
      children: [{ _key: freshKey(), _type: 'span', text, marks: [] }],
      markDefs: [],
    },
  ]
}
