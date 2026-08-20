import { type JSX, useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { AssistCapabilities, AssistCapability } from '../api/assist-client.js'
import { getAssistCapabilities } from '../api/assist-client.js'
import { ApiError } from '../api/client.js'
import { useAuth } from '../auth/auth-context.js'
import { Card, CardBody, CardHeader, CardTitle, Notice } from '../ui/index.js'
import { AssistantChatRoute } from './assistant-chat.js'
import { DuplicatesRoute } from './duplicates.js'

/**
 * Fiche 30 task 2 — the one screen that answers "what can the AI on this site
 * actually do?", built from **what the server says exists**, never a
 * hard-coded list — the fiche's own rule, because a constant would lie the
 * moment a site's configuration changed.
 *
 * Chat and duplicate detection are tabs here rather than their own nav
 * entries: `AssistantChatRoute`/`DuplicatesRoute` keep their own independent
 * `GET /api/assistant` check and still disappear on their own if the one tool
 * they need is missing (a site can have `assist.find_duplicates` — which
 * needs no provider at all — with every model-backed tool switched off), so
 * nesting them costs nothing beyond one extra request each.
 *
 * With no provider configured this screen does **not** disappear — task 2 is
 * explicit that this is the one place R2's silence is broken, because
 * someone has to be told where the switch is.
 */

type Tab = 'overview' | 'chat' | 'duplicates'

/** Where a tool with no dedicated tab actually shows up in this admin. Not part of any contract — purely a navigation hint. */
const TOOL_LOCATION: Readonly<Record<string, string>> = {
  'assist.rewrite': 'assistant.locationEntryEditor',
  'assist.proofread': 'assistant.locationEntryEditor',
  'assist.summarise': 'assistant.locationEntryEditor',
  'assist.translate': 'assistant.locationEntryEditor',
  'assist.meta_description': 'assistant.locationEntryEditor',
  'assist.titles': 'assistant.locationEntryEditor',
  'assist.tags': 'assistant.locationEntryEditor',
  'assist.alt_text': 'assistant.locationEntryEditor',
  'assist.classify': 'assistant.locationEntryEditor',
  'assist.moderate': 'assistant.locationEntryEditor',
  'assist.faq_draft': 'assistant.locationEntryEditor',
  'assist.schema_org_draft': 'assistant.locationEntryEditor',
  'assist.chat': 'assistant.locationChatTab',
  'assist.find_duplicates': 'assistant.locationDuplicatesTab',
  'assist.generate_image': 'assistant.locationNone',
}

function needsProvider(tool: AssistCapability): boolean {
  return tool.tool !== 'assist.find_duplicates'
}

export function AssistantRoute(): JSX.Element | null {
  const { t } = useTranslation()
  const auth = useAuth()
  const token = auth.state.status === 'authenticated' ? auth.state.token : null

  const [capabilities, setCapabilities] = useState<AssistCapabilities | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('overview')

  const load = useCallback(async () => {
    if (token === null) return
    try {
      setCapabilities(await getAssistCapabilities(token))
    } catch (caught) {
      // A failed *probe* is not "off" here (unlike the per-field panels):
      // this is the one screen whose entire job is to explain the assistant's
      // state, so an editor deserves to know the request itself failed rather
      // than being told, wrongly, that no provider is configured.
      setError(caught instanceof ApiError ? caught.message : t('assistant.loadError'))
    }
  }, [token, t])

  useEffect(() => {
    void load()
  }, [load])

  if (token === null) return null

  if (error !== null) {
    return (
      <section aria-labelledby="assistant-heading">
        <h1 id="assistant-heading">{t('assistant.heading')}</h1>
        <p role="alert">{error}</p>
      </section>
    )
  }

  if (capabilities === null) {
    return (
      <section aria-labelledby="assistant-heading">
        <h1 id="assistant-heading">{t('assistant.heading')}</h1>
        <p>{t('common.loading')}</p>
      </section>
    )
  }

  // The one screen where "no provider" is explained rather than hidden
  // (fiche 30 task 2 — everywhere else in this admin, R2 means silence).
  if (!capabilities.available) {
    return (
      <section aria-labelledby="assistant-heading">
        <h1 id="assistant-heading">{t('assistant.heading')}</h1>
        <Notice tone="info" live="off" title={t('assistant.offTitle')}>
          <p className="m-0">{capabilities.reason ?? t('assistant.offReasonFallback')}</p>
          <p className="m-0 mt-2">{t('assistant.offHowTo')}</p>
          <ul className="m-0 mt-2 list-disc pl-5">
            <li>{t('assistant.offStepConfig')}</li>
            <li>{t('assistant.offStepEnv')}</li>
          </ul>
          <p className="m-0 mt-2">{t('assistant.offNoImpact')}</p>
        </Notice>
      </section>
    )
  }

  const usage = capabilities.usage
  const vector = capabilities.vector

  return (
    <section aria-labelledby="assistant-heading" className="flex flex-col gap-6">
      <h1 id="assistant-heading" className="m-0 text-xl leading-7 font-semibold">
        {t('assistant.heading')}
      </h1>

      <div
        role="tablist"
        aria-label={t('assistant.tabsLabel')}
        className="flex gap-2 border-b border-border"
      >
        {(
          [
            ['overview', t('assistant.tabOverview')],
            ['chat', t('assistant.tabChat')],
            ['duplicates', t('assistant.tabDuplicates')],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            id={`assistant-tab-${key}`}
            aria-selected={tab === key}
            aria-controls={`assistant-panel-${key}`}
            className={
              tab === key
                ? 'border-b-2 border-primary px-3 py-2 text-sm font-semibold text-foreground'
                : 'border-b-2 border-transparent px-3 py-2 text-sm text-muted-foreground'
            }
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <div id="assistant-panel-overview" role="tabpanel" aria-labelledby="assistant-tab-overview">
          <div className="flex flex-col gap-4">
            {capabilities.model !== undefined && (
              <p className="m-0 text-sm text-muted-foreground">
                {t('assistant.modelLine', { model: capabilities.model })}
              </p>
            )}

            <Card aria-labelledby="assistant-tools-heading">
              <CardHeader>
                <CardTitle>
                  <h2 id="assistant-tools-heading">{t('assistant.toolsHeading')}</h2>
                </CardTitle>
              </CardHeader>
              <CardBody>
                <ul className="m-0 flex list-none flex-col gap-3 p-0">
                  {capabilities.tools.map((tool) => (
                    <li key={tool.tool} className="border-b border-border pb-3 last:border-b-0">
                      <p className="m-0 font-semibold text-foreground">{tool.label}</p>
                      <p className="m-0 text-sm text-muted-foreground">{tool.description}</p>
                      <p className="m-0 text-xs text-muted-foreground">
                        {t('assistant.toolWhere', {
                          location: t(TOOL_LOCATION[tool.tool] ?? 'assistant.locationNone'),
                        })}
                        {' · '}
                        {needsProvider(tool)
                          ? t('assistant.toolNeedsProvider')
                          : t('assistant.toolNoProvider')}
                      </p>
                    </li>
                  ))}
                  {capabilities.tools.length === 0 && <li>{t('assistant.noTools')}</li>}
                </ul>
              </CardBody>
            </Card>

            {usage !== undefined && (
              <Card aria-labelledby="assistant-usage-heading">
                <CardHeader>
                  <CardTitle>
                    <h2 id="assistant-usage-heading">{t('assistant.usageHeading')}</h2>
                  </CardTitle>
                </CardHeader>
                <CardBody>
                  {usage.overLimit && (
                    <Notice tone="danger" live="polite">
                      <p className="m-0">{t('assistant.usageOverLimit')}</p>
                    </Notice>
                  )}
                  {!usage.overLimit && usage.nearLimit && (
                    <Notice tone="warning" live="polite">
                      <p className="m-0">{t('assistant.usageNearLimit')}</p>
                    </Notice>
                  )}
                  <p className="m-0 text-sm text-foreground">
                    {usage.limit === undefined
                      ? t('assistant.usageNoLimit', { tokens: usage.tokensThisMonth })
                      : t('assistant.usageWithLimit', {
                          tokens: usage.tokensThisMonth,
                          limit: usage.limit,
                          percent: Math.round(usage.percentUsed ?? 0),
                        })}
                  </p>
                  {usage.byTool.length > 0 && (
                    <ul className="m-0 flex list-none flex-col gap-1 p-0 text-sm">
                      {usage.byTool.map((row) => (
                        <li key={row.tool}>
                          {row.tool} —{' '}
                          {t('assistant.usageRow', { calls: row.calls, tokens: row.tokens })}
                        </li>
                      ))}
                    </ul>
                  )}
                </CardBody>
              </Card>
            )}

            {vector !== undefined && (
              <Card aria-labelledby="assistant-vector-heading">
                <CardHeader>
                  <CardTitle>
                    <h2 id="assistant-vector-heading">{t('assistant.vectorHeading')}</h2>
                  </CardTitle>
                </CardHeader>
                <CardBody>
                  <p className="m-0 text-sm text-foreground">
                    {t('assistant.vectorDriver', {
                      driver: vector.driver,
                      dimensions: vector.dimensions,
                    })}
                  </p>
                  <p className="m-0 text-sm text-foreground">
                    {t('assistant.vectorCount', { count: vector.count })}
                  </p>
                  <p className="m-0 text-sm text-muted-foreground">
                    {vector.lastIndexedAt === null
                      ? t('assistant.vectorNeverIndexed')
                      : t('assistant.vectorLastIndexed', {
                          at: new Date(vector.lastIndexedAt).toLocaleString(),
                        })}
                  </p>
                </CardBody>
              </Card>
            )}
          </div>
        </div>
      )}

      {tab === 'chat' && (
        <div id="assistant-panel-chat" role="tabpanel" aria-labelledby="assistant-tab-chat">
          <AssistantChatRoute />
        </div>
      )}

      {tab === 'duplicates' && (
        <div
          id="assistant-panel-duplicates"
          role="tabpanel"
          aria-labelledby="assistant-tab-duplicates"
        >
          <DuplicatesRoute />
        </div>
      )}
    </section>
  )
}
