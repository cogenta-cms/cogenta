import { type JSX, useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { FaqDraft, SchemaDraft } from '../api/assist-client.js'
import { getAssistCapabilities, runFaqDraft, runSchemaOrgDraft } from '../api/assist-client.js'
import type { ContentBlock } from '../api/content-client.js'
import { describeApiError } from '../api/describe-error.js'
import { Button, Card, CardBody, CardHeader, CardTitle, Label, Notice } from '../ui/index.js'
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
      setFaqError(describeApiError(caught, t('assist.faqError')).message)
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
      setSchemaError(describeApiError(caught, t('assist.schemaOrgError')).message)
    } finally {
      setSchemaRunning(false)
    }
  }

  if (faqAvailable !== true && schemaAvailable !== true) return null

  return (
    <Card aria-labelledby="faq-schema-panel-heading">
      <CardHeader>
        <CardTitle>
          <h2 id="faq-schema-panel-heading">{t('assist.faqSchemaHeading')}</h2>
        </CardTitle>
      </CardHeader>
      <CardBody className="flex flex-col gap-5">
        {!hasText && <p className="m-0 text-sm text-muted-foreground">{t('assist.needsText')}</p>}

        {faqAvailable === true && (
          <div className="flex flex-col gap-3">
            <h3 className="m-0 text-sm font-semibold">{t('assist.faqButton')}</h3>
            <div>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={!hasText || faqRunning}
                onClick={() => void draftFaq()}
              >
                {faqRunning ? t('assist.running') : t('assist.faqButton')}
              </Button>
            </div>
            {faqError !== null && (
              <Notice tone="danger" live="assertive">
                <p>{faqError}</p>
              </Notice>
            )}
            {faqDraft !== null && (
              <div className="flex flex-col gap-3">
                <ul className="m-0 flex list-none flex-col gap-2 p-0">
                  {faqDraft.items.map((item) => (
                    <li key={item.question} className="rounded-md border border-input p-3 text-sm">
                      <strong>{item.question}</strong>
                      <p className="m-0 mt-1">{item.answer}</p>
                    </li>
                  ))}
                </ul>
                {blockZone !== null ? (
                  <div>
                    <Button type="button" size="sm" disabled={faqApplied} onClick={acceptFaq}>
                      {faqApplied ? t('assist.faqAccepted') : t('assist.faqAccept')}
                    </Button>
                  </div>
                ) : (
                  <p className="m-0 text-sm text-muted-foreground">{t('assist.faqNoBlockZone')}</p>
                )}
                <p className="m-0 text-xs text-muted-foreground">{t('assist.notApplied')}</p>
              </div>
            )}
          </div>
        )}

        {schemaAvailable === true && (
          <div className="flex flex-col gap-3">
            <h3 className="m-0 text-sm font-semibold">{t('assist.schemaOrgButton')}</h3>
            <div className="flex flex-col gap-1">
              <Label htmlFor="schema-org-type">{t('assist.schemaOrgType')}</Label>
              <select
                id="schema-org-type"
                value={schemaType}
                onChange={(event) =>
                  setSchemaType(event.target.value as (typeof SCHEMA_TYPES)[number])
                }
                className="h-9 rounded-md border border-input bg-background px-3 text-sm"
              >
                {SCHEMA_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {t(`assist.schemaTypes.${type}`)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={!hasText || schemaRunning}
                onClick={() => void draftSchema()}
              >
                {schemaRunning ? t('assist.running') : t('assist.schemaOrgButton')}
              </Button>
            </div>
            {schemaError !== null && (
              <Notice tone="danger" live="assertive">
                <p>{schemaError}</p>
              </Notice>
            )}
            {schemaDraft !== null && (
              <div className="flex flex-col gap-2">
                <pre className="m-0 max-h-72 overflow-auto rounded-md border border-input bg-muted p-3 text-xs">
                  {JSON.stringify(schemaDraft.jsonLd, null, 2)}
                </pre>
                <p className="m-0 text-xs text-muted-foreground">{t('assist.schemaOrgNoTarget')}</p>
              </div>
            )}
          </div>
        )}
      </CardBody>
    </Card>
  )
}
