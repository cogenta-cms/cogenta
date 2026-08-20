import { type JSX, useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useSearchParams } from 'react-router'
import {
  type AssistCapabilities,
  type ChatAnswer,
  getAssistCapabilities,
  runChat,
} from '../api/assist-client.js'
import { listOrders, type Order } from '../api/commerce-client.js'
import { listMarketplaceItems, type MarketplaceCatalogItem } from '../api/marketplace-client.js'
import { listMedia, type MediaAsset } from '../api/media-client.js'
import { listMenus, type Menu } from '../api/menu-client.js'
import { type SearchHit, searchContent } from '../api/search-client.js'
import { listTerms, type Term } from '../api/taxonomy-client.js'
import { type AdminUser, listUsers } from '../api/users-client.js'
import { useAuth } from '../auth/auth-context.js'
import { formatMinor } from '../commerce/money.js'
import { canPerformOnTerms, readableCollections } from '../schema/permissions.js'
import { useSchema } from '../schema/schema-context.js'
import { matchesQuery } from '../search/fold.js'
import { HighlightedExcerpt } from '../search/highlighted-excerpt.js'
import { parseInlineFilters } from '../search/inline-filters.js'
import { Field, Input, Notice, Select } from '../ui/index.js'

/**
 * `/search?q=…` — the page a shareable, back-button-friendly URL needs
 * (fiche 36 task 2). The popover (`shell/global-search.tsx`) is deliberately
 * kept thin and small; every source it can show, this page shows in full,
 * with real filters, real sort and real pagination for the one source that
 * has a page size worth paginating — content.
 */

type Tab =
  | 'all'
  | 'content'
  | 'media'
  | 'users'
  | 'menus'
  | 'orders'
  | 'extensions'
  | 'taxonomies'
  | 'semantic'

type SortMode = 'relevance' | 'date'
type Period = '' | 'week' | 'month' | 'year'

const CONTENT_PAGE_SIZE = 20
const OTHER_LIMIT = 20

function periodStartsAt(period: Period): Date | null {
  if (period === '') return null
  const now = new Date()
  const start = new Date(now)
  if (period === 'week') start.setDate(now.getDate() - 7)
  else if (period === 'month') start.setMonth(now.getMonth() - 1)
  else start.setFullYear(now.getFullYear() - 1)
  return start
}

export function SearchRoute(): JSX.Element {
  const { t, i18n } = useTranslation()
  const auth = useAuth()
  const schema = useSchema()
  const token = auth.state.status === 'authenticated' ? auth.state.token : null
  const roles = auth.state.status === 'authenticated' ? auth.state.user.roles : []
  const isAdmin = roles.includes('admin')
  const isSignedIn = roles.length > 0

  const [searchParams, setSearchParams] = useSearchParams()
  const rawQuery = searchParams.get('q') ?? ''
  const tab = (searchParams.get('type') as Tab | null) ?? 'all'
  const collectionFilter = searchParams.get('collection') ?? ''
  const statusFilter = searchParams.get('status') ?? ''
  const localeFilter = searchParams.get('locale') ?? ''
  const period = (searchParams.get('period') as Period | null) ?? ''
  const sort = (searchParams.get('sort') as SortMode | null) ?? 'relevance'

  const [inputValue, setInputValue] = useState(rawQuery)
  useEffect(() => setInputValue(rawQuery), [rawQuery])

  const parsed = useMemo(() => parseInlineFilters(rawQuery), [rawQuery])
  const freeText = parsed.text.trim()

  const [contentHits, setContentHits] = useState<readonly SearchHit[]>([])
  const [contentHasMore, setContentHasMore] = useState(false)
  const [media, setMedia] = useState<readonly MediaAsset[]>([])
  const [users, setUsers] = useState<readonly AdminUser[]>([])
  const [menus, setMenus] = useState<readonly Menu[]>([])
  const [orders, setOrders] = useState<readonly Order[]>([])
  const [extensions, setExtensions] = useState<readonly MarketplaceCatalogItem[]>([])
  const [terms, setTerms] = useState<readonly { readonly taxonomy: string; readonly term: Term }[]>(
    [],
  )
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const effectiveStatus = statusFilter !== '' ? statusFilter : parsed.status
  const effectiveCollection = collectionFilter !== '' ? collectionFilter : parsed.collection
  const effectiveLocale = localeFilter !== '' ? localeFilter : parsed.locale

  const load = useCallback(async () => {
    if (token === null || freeText.length === 0) {
      setContentHits([])
      setContentHasMore(false)
      setMedia([])
      setUsers([])
      setMenus([])
      setOrders([])
      setExtensions([])
      setTerms([])
      return
    }

    setLoading(true)
    setError(null)
    try {
      const readableTaxonomies =
        schema.status === 'ready'
          ? (schema.schema.taxonomies ?? []).filter((taxonomy) =>
              canPerformOnTerms('read', taxonomy, roles),
            )
          : []

      const [
        contentResult,
        mediaResult,
        usersResult,
        menusResult,
        ordersResult,
        extensionsResult,
        ...taxonomyResults
      ] = await Promise.allSettled([
        searchContent(token, freeText, {
          limit: CONTENT_PAGE_SIZE,
          ...(effectiveStatus === undefined ? {} : { status: effectiveStatus }),
          ...(effectiveCollection === undefined ? {} : { collections: [effectiveCollection] }),
          ...(effectiveLocale === undefined ? {} : { locale: effectiveLocale }),
        }),
        listMedia(token, { q: freeText, limit: OTHER_LIMIT }),
        isAdmin ? listUsers(token, { q: freeText }) : Promise.resolve([]),
        isSignedIn ? listMenus(token) : Promise.resolve([]),
        isSignedIn ? listOrders(token, undefined, freeText) : Promise.resolve({ orders: [] }),
        isAdmin ? listMarketplaceItems(token, { q: freeText }) : Promise.resolve([]),
        ...readableTaxonomies.map((taxonomy) => listTerms(token, taxonomy.name)),
      ])

      if (contentResult.status === 'fulfilled') {
        let hits = contentResult.value.hits
        const start = periodStartsAt(period)
        if (start !== null) {
          hits = hits.filter((hit) => hit.updatedAt !== null && new Date(hit.updatedAt) >= start)
        }
        if (sort === 'date') {
          hits = [...hits].sort((left, right) => {
            const a = left.updatedAt === null ? 0 : new Date(left.updatedAt).getTime()
            const b = right.updatedAt === null ? 0 : new Date(right.updatedAt).getTime()
            return b - a
          })
        }
        setContentHits(hits)
        setContentHasMore(contentResult.value.hasMore)
      } else {
        setContentHits([])
        setContentHasMore(false)
      }

      setMedia(mediaResult.status === 'fulfilled' ? mediaResult.value.items : [])
      setUsers(usersResult.status === 'fulfilled' ? usersResult.value : [])
      setMenus(
        menusResult.status === 'fulfilled'
          ? menusResult.value.filter((menu) => matchesQuery(menu.label, freeText))
          : [],
      )
      setOrders(ordersResult.status === 'fulfilled' ? ordersResult.value.orders : [])
      setExtensions(extensionsResult.status === 'fulfilled' ? extensionsResult.value : [])

      const nextTerms: { readonly taxonomy: string; readonly term: Term }[] = []
      readableTaxonomies.forEach((taxonomy, index) => {
        const result = taxonomyResults[index]
        if (result === undefined || result.status !== 'fulfilled') return
        for (const term of result.value) {
          const label = term.labels[i18n.language] ?? Object.values(term.labels)[0] ?? term.slug
          if (matchesQuery(label, freeText) || matchesQuery(term.slug, freeText)) {
            nextTerms.push({ taxonomy: taxonomy.name, term })
          }
        }
      })
      setTerms(nextTerms)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('searchPage.loadError'))
    } finally {
      setLoading(false)
    }
  }, [
    token,
    freeText,
    effectiveStatus,
    effectiveCollection,
    effectiveLocale,
    period,
    sort,
    schema,
    roles,
    isAdmin,
    isSignedIn,
    i18n.language,
    t,
  ])

  useEffect(() => {
    void load()
  }, [load])

  function updateParam(key: string, value: string): void {
    const next = new URLSearchParams(searchParams)
    if (value === '') next.delete(key)
    else next.set(key, value)
    setSearchParams(next, { replace: true })
  }

  function onSubmit(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault()
    updateParam('q', inputValue)
  }

  const counts = {
    content: contentHits.length,
    media: media.length,
    users: users.length,
    menus: menus.length,
    orders: orders.length,
    extensions: extensions.length,
    taxonomies: terms.length,
  }
  const totalCount = Object.values(counts).reduce((sum, value) => sum + value, 0)

  const collections =
    schema.status === 'ready' ? readableCollections(schema.schema.collections, roles) : []
  const locales = schema.status === 'ready' ? (schema.schema.site?.locales ?? []) : []

  const showTab = (candidate: Tab): boolean => tab === 'all' || tab === candidate

  return (
    <section aria-labelledby="search-heading" className="flex flex-col gap-6">
      <h1 id="search-heading" className="m-0 text-xl leading-7 font-semibold">
        {freeText.length > 0 || rawQuery.length > 0
          ? t('searchPage.heading', { query: rawQuery })
          : t('searchPage.headingEmpty')}
      </h1>

      <search aria-label={t('searchPage.title')}>
        <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-3">
          <Field label={t('searchPage.title')} className="min-w-[16rem] flex-1">
            {(control) => (
              <Input
                {...control}
                type="search"
                value={inputValue}
                placeholder={t('searchPage.placeholder')}
                onChange={(event) => setInputValue(event.target.value)}
              />
            )}
          </Field>

          <Field label={t('searchPage.filters.collection')}>
            {(control) => (
              <Select
                {...control}
                value={collectionFilter}
                onChange={(event) => updateParam('collection', event.target.value)}
              >
                <option value="">{t('searchPage.filters.collectionAny')}</option>
                {collections.map((collection) => (
                  <option key={collection.name} value={collection.name}>
                    {collection.labels.plural}
                  </option>
                ))}
              </Select>
            )}
          </Field>

          <Field label={t('searchPage.filters.status')}>
            {(control) => (
              <Select
                {...control}
                value={statusFilter}
                onChange={(event) => updateParam('status', event.target.value)}
              >
                <option value="">{t('searchPage.filters.statusAny')}</option>
                <option value="published">published</option>
                <option value="draft">draft</option>
                <option value="scheduled">scheduled</option>
                <option value="archived">archived</option>
              </Select>
            )}
          </Field>

          {locales.length > 0 && (
            <Field label={t('searchPage.filters.locale')}>
              {(control) => (
                <Select
                  {...control}
                  value={localeFilter}
                  onChange={(event) => updateParam('locale', event.target.value)}
                >
                  <option value="">{t('searchPage.filters.localeAny')}</option>
                  {locales.map((locale) => (
                    <option key={locale} value={locale}>
                      {locale}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          )}

          <Field label={t('searchPage.filters.period')}>
            {(control) => (
              <Select
                {...control}
                value={period}
                onChange={(event) => updateParam('period', event.target.value)}
              >
                <option value="">{t('searchPage.filters.periodAny')}</option>
                <option value="week">{t('searchPage.filters.periodWeek')}</option>
                <option value="month">{t('searchPage.filters.periodMonth')}</option>
                <option value="year">{t('searchPage.filters.periodYear')}</option>
              </Select>
            )}
          </Field>

          <Field label={t('searchPage.sortLabel')}>
            {(control) => (
              <Select
                {...control}
                value={sort}
                onChange={(event) => updateParam('sort', event.target.value)}
              >
                <option value="relevance">{t('searchPage.sortRelevance')}</option>
                <option value="date">{t('searchPage.sortDate')}</option>
              </Select>
            )}
          </Field>
        </form>
      </search>

      <div
        role="tablist"
        aria-label={t('searchPage.title')}
        className="flex flex-wrap gap-1 border-b border-border"
      >
        {(
          [
            ['all', t('searchPage.tabs.all')],
            ['content', t('searchPage.tabs.content')],
            ['media', t('searchPage.tabs.media')],
            ...(isAdmin ? ([['users', t('searchPage.tabs.users')]] as const) : []),
            ['menus', t('searchPage.tabs.menus')],
            ['orders', t('searchPage.tabs.orders')],
            ...(isAdmin ? ([['extensions', t('searchPage.tabs.extensions')]] as const) : []),
            ['taxonomies', t('searchPage.tabs.taxonomies')],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            className="rounded-t-md border border-b-0 border-transparent px-3 py-2 font-sans text-sm font-medium aria-selected:border-border aria-selected:bg-card"
            onClick={() => updateParam('type', id === 'all' ? '' : id)}
          >
            {label}
          </button>
        ))}
        <SemanticTab
          active={tab === 'semantic'}
          token={token}
          onActivate={() => updateParam('type', 'semantic')}
        />
      </div>

      {error !== null && (
        <Notice tone="danger" live="assertive">
          <p>{error}</p>
        </Notice>
      )}

      {loading && <p>{t('common.loading')}</p>}

      {!loading && freeText.length === 0 && (
        <p className="text-muted-foreground">{t('searchPage.typeToSearch')}</p>
      )}

      {!loading && freeText.length > 0 && (
        <p role="status" aria-live="polite" className="text-sm text-muted-foreground">
          {t('searchPage.resultsCount', { count: totalCount })}
        </p>
      )}

      {!loading && freeText.length > 0 && totalCount === 0 && tab !== 'semantic' && (
        <p>{t('searchPage.noResults', { query: freeText })}</p>
      )}

      {tab === 'semantic' ? (
        <SemanticPanel token={token} question={freeText} />
      ) : (
        <div className="flex flex-col gap-8">
          {showTab('content') && contentHits.length > 0 && (
            <ResultSection title={t('searchPage.tabs.content')}>
              <ul className="m-0 flex list-none flex-col gap-3 p-0">
                {contentHits.map((hit) => (
                  <li key={`${hit.collection}:${hit.id}`}>
                    <Link
                      to={`/collections/${encodeURIComponent(hit.collection)}/${encodeURIComponent(hit.id)}`}
                      className="font-medium"
                    >
                      {hit.title.trim().length > 0 ? hit.title : hit.id}
                    </Link>
                    <div className="text-xs text-muted-foreground">{hit.collection}</div>
                    {hit.excerpt.length > 0 && (
                      <p className="m-0 text-sm text-muted-foreground">
                        <HighlightedExcerpt text={hit.excerpt} matches={hit.highlights} />
                      </p>
                    )}
                  </li>
                ))}
              </ul>
              {contentHasMore && (
                <p className="text-xs text-muted-foreground">
                  {t('searchPage.resultsCount', { count: contentHits.length })}
                </p>
              )}
            </ResultSection>
          )}

          {showTab('media') && media.length > 0 && (
            <ResultSection title={t('searchPage.tabs.media')}>
              <ul className="m-0 flex list-none flex-col gap-2 p-0">
                {media.map((asset) => (
                  <li key={asset.id}>
                    <Link to="/media">{asset.filename}</Link>
                    <span className="ml-2 text-xs text-muted-foreground">{asset.kind}</span>
                  </li>
                ))}
              </ul>
            </ResultSection>
          )}

          {isAdmin && showTab('users') && users.length > 0 && (
            <ResultSection title={t('searchPage.tabs.users')}>
              <ul className="m-0 flex list-none flex-col gap-2 p-0">
                {users.map((user) => (
                  <li key={user.id}>
                    <Link to="/users">{user.email}</Link>
                    <span className="ml-2 text-xs text-muted-foreground">
                      {user.roles.join(', ')}
                    </span>
                  </li>
                ))}
              </ul>
            </ResultSection>
          )}

          {showTab('menus') && menus.length > 0 && (
            <ResultSection title={t('searchPage.tabs.menus')}>
              <ul className="m-0 flex list-none flex-col gap-2 p-0">
                {menus.map((menu) => (
                  <li key={menu.id}>
                    <Link to="/menus">{menu.label}</Link>
                    <span className="ml-2 text-xs text-muted-foreground">{menu.locale}</span>
                  </li>
                ))}
              </ul>
            </ResultSection>
          )}

          {showTab('orders') && orders.length > 0 && (
            <ResultSection title={t('searchPage.tabs.orders')}>
              <ul className="m-0 flex list-none flex-col gap-2 p-0">
                {orders.map((order) => (
                  <li key={order.id}>
                    <Link to={`/commerce/orders/${encodeURIComponent(order.id)}`}>
                      {order.reference}
                    </Link>
                    <span className="ml-2 text-xs text-muted-foreground">
                      {order.email} — {formatMinor(order.totalMinor, order.currency, i18n.language)}
                    </span>
                  </li>
                ))}
              </ul>
            </ResultSection>
          )}

          {isAdmin && showTab('extensions') && extensions.length > 0 && (
            <ResultSection title={t('searchPage.tabs.extensions')}>
              <ul className="m-0 flex list-none flex-col gap-2 p-0">
                {extensions.map((item) => (
                  <li key={item.id}>
                    <Link to="/marketplace">{item.displayName}</Link>
                    <span className="ml-2 text-xs text-muted-foreground">{item.kind}</span>
                  </li>
                ))}
              </ul>
            </ResultSection>
          )}

          {showTab('taxonomies') && terms.length > 0 && (
            <ResultSection title={t('searchPage.tabs.taxonomies')}>
              <ul className="m-0 flex list-none flex-col gap-2 p-0">
                {terms.map(({ taxonomy, term }) => (
                  <li key={`${taxonomy}:${term.id}`}>
                    <Link to="/taxonomies">
                      {term.labels[i18n.language] ?? Object.values(term.labels)[0] ?? term.slug}
                    </Link>
                    <span className="ml-2 text-xs text-muted-foreground">{taxonomy}</span>
                  </li>
                ))}
              </ul>
            </ResultSection>
          )}
        </div>
      )}
    </section>
  )
}

function ResultSection({
  title,
  children,
}: {
  readonly title: string
  readonly children: React.ReactNode
}): JSX.Element {
  return (
    <section aria-label={title} className="flex flex-col gap-2">
      <h2 className="m-0 text-sm font-semibold text-muted-foreground uppercase">{title}</h2>
      {children}
    </section>
  )
}

/**
 * The "by meaning" tab (task 6) — present only once we know a provider
 * exists at all, and only reached by clicking it: the lexical tabs above
 * remain the working default with no AI configured (R2).
 */
function SemanticTab({
  active,
  token,
  onActivate,
}: {
  readonly active: boolean
  readonly token: string | null
  readonly onActivate: () => void
}): JSX.Element | null {
  const { t } = useTranslation()
  const [capabilities, setCapabilities] = useState<AssistCapabilities | null>(null)

  useEffect(() => {
    if (token === null) return
    let cancelled = false
    getAssistCapabilities(token)
      .then((value) => {
        if (!cancelled) setCapabilities(value)
      })
      .catch(() => {
        if (!cancelled) setCapabilities(null)
      })
    return () => {
      cancelled = true
    }
  }, [token])

  const available =
    capabilities?.available === true &&
    capabilities.tools.some((tool) => tool.tool === 'assist.chat')
  if (!available) return null

  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      className="rounded-t-md border border-b-0 border-transparent px-3 py-2 font-sans text-sm font-medium aria-selected:border-border aria-selected:bg-card"
      onClick={onActivate}
    >
      {t('searchPage.tabs.semantic')}
    </button>
  )
}

function SemanticPanel({
  token,
  question,
}: {
  readonly token: string | null
  readonly question: string
}): JSX.Element {
  const { t } = useTranslation()
  const schema = useSchema()
  const [answer, setAnswer] = useState<ChatAnswer | null>(null)
  const [asking, setAsking] = useState(false)
  const [askError, setAskError] = useState<string | null>(null)

  async function ask(): Promise<void> {
    if (token === null || question.trim().length === 0 || schema.status !== 'ready') return
    setAsking(true)
    setAskError(null)
    try {
      const result = await runChat(token, {
        question,
        locale: schema.schema.site?.defaultLocale ?? 'en',
        collections: schema.schema.collections.map((collection) => collection.name),
        siteId: 'admin',
      })
      setAnswer(result)
    } catch (caught) {
      setAskError(caught instanceof Error ? caught.message : t('searchPage.loadError'))
    } finally {
      setAsking(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Notice tone="info">
        <p>{t('searchPage.semanticIntro')}</p>
      </Notice>
      <button
        type="button"
        className="w-fit rounded-md border border-input bg-card px-3 py-2 text-sm"
        onClick={() => void ask()}
        disabled={asking || question.trim().length === 0}
      >
        {t('searchPage.semanticAsk')}
      </button>
      {askError !== null && (
        <Notice tone="danger">
          <p>{askError}</p>
        </Notice>
      )}
      {answer !== null && (
        <div className="flex flex-col gap-3">
          <p>{answer.answer}</p>
          {answer.sources.length === 0 ? (
            <p className="text-muted-foreground">{t('searchPage.semanticEmpty')}</p>
          ) : (
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              {answer.sources.map((source) => (
                <li key={`${source.collection}:${source.entryId}`}>
                  <Link
                    to={`/collections/${encodeURIComponent(source.collection)}/${encodeURIComponent(source.entryId)}`}
                  >
                    {source.title}
                  </Link>
                  <p className="m-0 text-sm text-muted-foreground">{source.excerpt}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
