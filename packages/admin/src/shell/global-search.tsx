import {
  type JSX,
  type KeyboardEvent,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import { listOrders } from '../api/commerce-client.js'
import { listMarketplaceItems } from '../api/marketplace-client.js'
import { listMedia } from '../api/media-client.js'
import { listMenus } from '../api/menu-client.js'
import { searchContent } from '../api/search-client.js'
import { listTerms } from '../api/taxonomy-client.js'
import { listUsers } from '../api/users-client.js'
import { useAuth } from '../auth/auth-context.js'
import { formatMinor } from '../commerce/money.js'
import { canPerform, canPerformOnTerms } from '../schema/permissions.js'
import { useSchema } from '../schema/schema-context.js'
import { matchesQuery } from '../search/fold.js'
import { parseInlineFilters } from '../search/inline-filters.js'
import { recentSearches, rememberSearch } from '../search/recent-searches.js'
import { useTheme } from '../theme/theme-context.js'
import { SearchIcon } from '../ui/icons.js'
import { Input } from '../ui/index.js'
import { NAV_ITEMS } from './nav-items.js'
import { isNavItemVisible } from './nav-visibility.js'
import { chromeStatusOrFallback, useChromeStatus } from './shell-status-context.js'
import { NEXT_MODE } from './theme-toggle.js'

/**
 * The admin's global search — L11 task 4, extended by fiche 35 task 5
 * (command-palette actions, gated by the same nav visibility every sidebar
 * entry already obeys) and fiche 36 (more sources, inline filters, recent
 * searches, a full results page).
 *
 * Independent endpoints, called in parallel from the browser rather than one
 * aggregated server route: the reasoning from L11 still holds, and each new
 * source (task 4) keeps its own permission gate rather than widening an
 * existing one — a source an actor may not read is never called at all,
 * never called-then-filtered. The call count is now content, media, users,
 * up to three taxonomies, menus, orders, extensions and a static settings
 * list — eight at most, still under the five-to-six threshold the plan names
 * as the point to reopen "no aggregated route" (fiche 36 §7), but close
 * enough that a ninth source should revisit it rather than add a ninth call.
 */

const DEBOUNCE_MS = 300
const GROUP_LIMIT = 5
const MAX_TAXONOMIES_SEARCHED = 3

interface ResultItem {
  readonly id: string
  readonly label: string
  readonly sublabel: string
  readonly href?: string
  run?(): void
}

interface ResultGroup {
  readonly key: string
  readonly titleKey: string
  readonly items: readonly ResultItem[]
}

const SETTINGS_DESTINATIONS: readonly { readonly to: string; readonly labelKey: string }[] = [
  { to: '/settings', labelKey: 'nav.settings' },
  { to: '/ops-settings', labelKey: 'nav.opsSettings' },
  { to: '/api-keys', labelKey: 'nav.apiKeys' },
  { to: '/seo', labelKey: 'nav.seo' },
]

export function GlobalSearch(): JSX.Element {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const auth = useAuth()
  const schema = useSchema()
  const chromeState = useChromeStatus()
  const theme = useTheme()
  const token = auth.state.status === 'authenticated' ? auth.state.token : null
  const roles = auth.state.status === 'authenticated' ? auth.state.user.roles : []
  const isAdmin = roles.includes('admin')
  const isSignedIn = roles.length > 0

  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [groups, setGroups] = useState<readonly ResultGroup[]>([])
  const [activeIndex, setActiveIndex] = useState(-1)
  const [announcement, setAnnouncement] = useState('')

  const rootRef = useRef<HTMLDivElement>(null)
  const listboxId = useId()
  const inputId = useId()
  const restoreFocusRef = useRef<HTMLElement | null>(null)

  const flatItems = groups.flatMap((group) => group.items)

  const collections = schema.status === 'ready' ? schema.schema.collections : null
  const taxonomiesPresent =
    schema.status === 'ready' ? (schema.schema.taxonomies?.length ?? 0) > 0 : null
  const chrome = chromeStatusOrFallback(chromeState)

  const actionsFor = useCallback(
    (freeText: string): readonly ResultItem[] => {
      const actions: ResultItem[] = []

      // Gated by the same visibility every sidebar entry already obeys
      // (fiche 35 task 5): the palette must never offer "go to X" for a
      // screen this actor cannot currently see.
      for (const item of NAV_ITEMS) {
        const visible = isNavItemVisible(item.visibleWhen, {
          roles,
          collections,
          taxonomiesPresent,
          assistantTools: chromeState.status === 'ready' ? chrome.assistantTools : null,
          commerceActive: chromeState.status === 'ready' ? chrome.shellStatus.commerceActive : null,
        })
        if (!visible) continue
        const label = t('globalSearch.actions.goTo', { name: t(item.labelKey) })
        if (!matchesQuery(label, freeText) && !matchesQuery(t(item.labelKey), freeText)) continue
        actions.push({
          id: `go-to:${item.to}`,
          label,
          sublabel: t('globalSearch.actions.goToHint'),
          run: () => navigate(item.to),
        })
      }

      if (schema.status === 'ready') {
        for (const collection of schema.schema.collections) {
          if (!canPerform('create', collection, roles)) continue
          const label = t('globalSearch.actions.create', { name: collection.labels.singular })
          if (
            !matchesQuery(label, freeText) &&
            !matchesQuery(collection.labels.singular, freeText)
          ) {
            continue
          }
          actions.push({
            id: `create:${collection.name}`,
            label,
            sublabel: t('globalSearch.actions.createHint'),
            run: () => navigate(`/collections/${encodeURIComponent(collection.name)}/new`),
          })
        }
      }

      const themeLabel = t('globalSearch.actions.toggleTheme')
      if (matchesQuery(themeLabel, freeText)) {
        actions.push({
          id: 'toggle-theme',
          label: themeLabel,
          sublabel: t('globalSearch.actions.commandHint'),
          run: () => theme.setMode(NEXT_MODE[theme.mode]),
        })
      }

      const logoutLabel = t('globalSearch.actions.logout')
      if (matchesQuery(logoutLabel, freeText)) {
        actions.push({
          id: 'logout',
          label: logoutLabel,
          sublabel: t('globalSearch.actions.commandHint'),
          run: () => void auth.logout(),
        })
      }

      return actions.slice(0, GROUP_LIMIT + 3)
    },
    [t, navigate, schema, roles, theme, auth, collections, taxonomiesPresent, chromeState, chrome],
  )

  const runSearch = useCallback(
    async (raw: string) => {
      if (token === null || raw.trim().length === 0) {
        setGroups([])
        return
      }

      const parsed = parseInlineFilters(raw)
      const freeText = parsed.text.trim()
      const next: ResultGroup[] = []

      const actions = actionsFor(freeText.length > 0 ? freeText : raw)
      if (actions.length > 0) {
        next.push({ key: 'actions', titleKey: 'globalSearch.groups.actions', items: actions })
      }

      // A filter with nothing left to search for (e.g. just "status:draft")
      // still searches — an empty free text is a valid, if broad, query for
      // every source below except content, whose route requires `q`.
      if (freeText.length > 0) {
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
          marketplaceResult,
          ...taxonomyResults
        ] = await Promise.allSettled([
          searchContent(token, freeText, {
            limit: GROUP_LIMIT,
            ...(parsed.status === undefined ? {} : { status: parsed.status }),
            ...(parsed.collection === undefined ? {} : { collections: [parsed.collection] }),
            ...(parsed.locale === undefined ? {} : { locale: parsed.locale }),
          }),
          listMedia(token, { q: freeText, limit: GROUP_LIMIT }),
          isAdmin ? listUsers(token, { q: freeText }) : Promise.resolve([]),
          isSignedIn ? listMenus(token) : Promise.resolve([]),
          isSignedIn ? listOrders(token, undefined, freeText) : Promise.resolve({ orders: [] }),
          isAdmin ? listMarketplaceItems(token, { q: freeText }) : Promise.resolve([]),
          ...readableTaxonomies
            .slice(0, MAX_TAXONOMIES_SEARCHED)
            .map((taxonomy) => listTerms(token, taxonomy.name)),
        ])

        if (contentResult.status === 'fulfilled' && contentResult.value.hits.length > 0) {
          next.push({
            key: 'content',
            titleKey: 'globalSearch.groups.content',
            items: contentResult.value.hits.map((hit) => ({
              id: `content:${hit.collection}:${hit.id}`,
              label: hit.title.trim().length > 0 ? hit.title : hit.id,
              sublabel: hit.collection,
              href: `/collections/${encodeURIComponent(hit.collection)}/${encodeURIComponent(hit.id)}`,
            })),
          })
        }

        if (mediaResult.status === 'fulfilled' && mediaResult.value.items.length > 0) {
          next.push({
            key: 'media',
            titleKey: 'globalSearch.groups.media',
            items: mediaResult.value.items.slice(0, GROUP_LIMIT).map((asset) => ({
              id: `media:${asset.id}`,
              label: asset.filename,
              sublabel: asset.kind,
              href: '/media',
            })),
          })
        }

        if (usersResult.status === 'fulfilled' && usersResult.value.length > 0) {
          next.push({
            key: 'users',
            titleKey: 'globalSearch.groups.users',
            items: usersResult.value.slice(0, GROUP_LIMIT).map((user) => ({
              id: `users:${user.id}`,
              label: user.email,
              sublabel: user.roles.join(', '),
              href: '/users',
            })),
          })
        }

        if (menusResult.status === 'fulfilled') {
          const matched = menusResult.value.filter((menu) => matchesQuery(menu.label, freeText))
          if (matched.length > 0) {
            next.push({
              key: 'menus',
              titleKey: 'globalSearch.groups.menus',
              items: matched.slice(0, GROUP_LIMIT).map((menu) => ({
                id: `menu:${menu.id}`,
                label: menu.label,
                sublabel: menu.locale,
                href: '/menus',
              })),
            })
          }
        }

        if (ordersResult.status === 'fulfilled' && ordersResult.value.orders.length > 0) {
          next.push({
            key: 'orders',
            titleKey: 'globalSearch.groups.orders',
            items: ordersResult.value.orders.slice(0, GROUP_LIMIT).map((order) => ({
              id: `order:${order.id}`,
              label: order.reference,
              sublabel: `${order.email} — ${formatMinor(order.totalMinor, order.currency)}`,
              href: `/commerce/orders/${encodeURIComponent(order.id)}`,
            })),
          })
        }

        if (marketplaceResult.status === 'fulfilled' && marketplaceResult.value.length > 0) {
          next.push({
            key: 'extensions',
            titleKey: 'globalSearch.groups.extensions',
            items: marketplaceResult.value.slice(0, GROUP_LIMIT).map((item) => ({
              id: `marketplace:${item.id}`,
              label: item.displayName,
              sublabel: item.kind,
              href: '/marketplace',
            })),
          })
        }

        const termItems: ResultItem[] = []
        readableTaxonomies.slice(0, MAX_TAXONOMIES_SEARCHED).forEach((taxonomy, index) => {
          const result = taxonomyResults[index]
          if (result === undefined || result.status !== 'fulfilled') return
          // No server-side `q` on `/api/taxonomies/{name}` (unlike media and
          // marketplace) — a term list is small enough per taxonomy that
          // filtering the already-fetched tree client-side costs nothing extra.
          const matched = result.value.filter((term) => {
            const label = term.labels[i18n.language] ?? Object.values(term.labels)[0] ?? term.slug
            return matchesQuery(label, freeText) || matchesQuery(term.slug, freeText)
          })
          for (const term of matched.slice(0, GROUP_LIMIT)) {
            const label = term.labels[i18n.language] ?? Object.values(term.labels)[0] ?? term.slug
            termItems.push({
              id: `term:${taxonomy.name}:${term.id}`,
              label,
              sublabel: taxonomy.labels.singular[i18n.language] ?? taxonomy.name,
              href: '/taxonomies',
            })
          }
        })
        if (termItems.length > 0) {
          next.push({
            key: 'taxonomies',
            titleKey: 'globalSearch.groups.taxonomies',
            items: termItems.slice(0, GROUP_LIMIT),
          })
        }

        if (isAdmin) {
          const settingsMatches = SETTINGS_DESTINATIONS.filter((destination) =>
            matchesQuery(t(destination.labelKey), freeText),
          )
          if (settingsMatches.length > 0) {
            next.push({
              key: 'settings',
              titleKey: 'globalSearch.groups.settings',
              items: settingsMatches.map((destination) => ({
                id: `settings:${destination.to}`,
                label: t(destination.labelKey),
                sublabel: t('globalSearch.groups.settings'),
                href: destination.to,
              })),
            })
          }
        }
      }

      // Always reachable, always last: the free text may be empty (a filter
      // alone, e.g. "status:draft") and this is still where "see everything"
      // belongs.
      next.push({
        key: 'view-all',
        titleKey: 'globalSearch.groups.more',
        items: [
          {
            id: 'view-all',
            label: t('globalSearch.actions.viewAllResults', { query: raw }),
            sublabel: t('globalSearch.actions.viewAllResultsHint'),
            run: () => {
              rememberSearch(raw)
              navigate(`/search?q=${encodeURIComponent(raw)}`)
            },
          },
        ],
      })

      setGroups(next)
      setActiveIndex(-1)
      const resultCount = next.reduce(
        (sum, group) => sum + (group.key === 'view-all' ? 0 : group.items.length),
        0,
      )
      setAnnouncement(t('globalSearch.resultsAnnouncement', { count: resultCount }))
    },
    [token, isAdmin, isSignedIn, actionsFor, schema, roles, i18n.language, t, navigate],
  )

  // Debounced on every keystroke; `onKeyDown` below runs it immediately on
  // Enter instead of waiting the extra 300ms out.
  useEffect(() => {
    if (query.trim().length === 0) return
    const timer = window.setTimeout(() => void runSearch(query), DEBOUNCE_MS)
    return () => window.clearTimeout(timer)
  }, [query, runSearch])

  // The default palette (task 1): actions and recent searches, visible the
  // moment the box opens, before anything is typed — the "half of a command
  // palette that costs no request" the plan asks for.
  useEffect(() => {
    if (!open || query.trim().length > 0) return
    const actions = actionsFor('')
    const recent = recentSearches()
    const next: ResultGroup[] = []
    if (recent.length > 0) {
      next.push({
        key: 'recent',
        titleKey: 'globalSearch.groups.recent',
        items: recent.map((entry) => ({
          id: `recent:${entry}`,
          label: entry,
          sublabel: t('globalSearch.actions.recentHint'),
          run: () => setQuery(entry),
        })),
      })
    }
    if (actions.length > 0) {
      next.push({ key: 'actions', titleKey: 'globalSearch.groups.actions', items: actions })
    }
    setGroups(next)
  }, [open, query, actionsFor, t])

  useEffect(() => {
    function onPointerDown(event: MouseEvent): void {
      if (rootRef.current !== null && !rootRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [])

  // `⌘K` / `Ctrl+K` from anywhere (task 1) — except while typing in some
  // other field, so it never steals a keystroke from an entry form. Typing
  // inside this component's own input is not "some other field": the
  // shortcut still opens (harmlessly, it already is) rather than being
  // silently eaten.
  useEffect(() => {
    function onGlobalKeyDown(event: globalThis.KeyboardEvent): void {
      if (event.key.toLowerCase() !== 'k' || !(event.metaKey || event.ctrlKey)) return

      const active = document.activeElement
      const ownInput = document.getElementById(inputId)
      const isEditable =
        active instanceof HTMLElement &&
        (active.tagName === 'INPUT' ||
          active.tagName === 'TEXTAREA' ||
          active.tagName === 'SELECT' ||
          active.isContentEditable)

      if (isEditable && active !== ownInput) return

      event.preventDefault()
      if (active !== ownInput) restoreFocusRef.current = active as HTMLElement | null
      setOpen(true)
      document.getElementById(inputId)?.focus()
    }
    window.addEventListener('keydown', onGlobalKeyDown)
    return () => window.removeEventListener('keydown', onGlobalKeyDown)
  }, [inputId])

  const select = useCallback(
    (item: ResultItem) => {
      setOpen(false)
      setQuery('')
      setGroups([])
      if (query.trim().length > 0) rememberSearch(query)
      if (item.run !== undefined) {
        item.run()
        return
      }
      if (item.href !== undefined) navigate(item.href)
    },
    [navigate, query],
  )

  function closeAndRestoreFocus(): void {
    setOpen(false)
    const target = restoreFocusRef.current
    restoreFocusRef.current = null
    target?.focus()
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key === 'Escape') {
      closeAndRestoreFocus()
      return
    }
    if (event.key === 'Enter') {
      event.preventDefault()
      if (activeIndex >= 0 && activeIndex < flatItems.length) {
        select(flatItems[activeIndex] as ResultItem)
      } else if (query.trim().length > 0) {
        rememberSearch(query)
        navigate(`/search?q=${encodeURIComponent(query)}`)
        setOpen(false)
        setQuery('')
        setGroups([])
      } else {
        void runSearch(query)
      }
      return
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      if (flatItems.length > 0) setActiveIndex((index) => (index + 1) % flatItems.length)
      return
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      if (flatItems.length > 0) {
        setActiveIndex((index) => (index <= 0 ? flatItems.length - 1 : index - 1))
      }
    }
  }

  const showPopover = open && groups.length > 0

  return (
    <div ref={rootRef} className="app-shell__search relative w-full max-w-sm">
      <label htmlFor={inputId} className="sr-only">
        {t('globalSearch.label')}
      </label>
      {/* Command-bar look: a leading search glyph and a trailing `Ctrl K`
          hint (the shortcut this component already wires up below, in the
          `⌘K`/`Ctrl+K` effect) sit inside the same rounded pill as the
          input, both purely decorative (`aria-hidden`) — the accessible
          name and the shortcut itself are unchanged. */}
      <div className="relative">
        <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          id={inputId}
          type="search"
          role="combobox"
          aria-expanded={showPopover}
          aria-controls={listboxId}
          aria-autocomplete="list"
          autoComplete="off"
          placeholder={t('globalSearch.placeholder')}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          className="rounded-full pr-14 pl-9"
        />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 rounded border border-border px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground"
        >
          Ctrl K
        </span>
      </div>
      {announcement !== '' && (
        <div className="sr-only" role="status" aria-live="polite">
          {announcement}
        </div>
      )}
      {showPopover && (
        <div
          id={listboxId}
          role="listbox"
          aria-label={t('globalSearch.resultsLabel')}
          className="absolute top-full left-0 z-50 mt-1 max-h-96 w-full min-w-[20rem] overflow-y-auto rounded-md border border-border bg-card py-1 shadow-overlay"
        >
          {groups.map((group) => (
            // A grouping of `option`s inside `listbox`, not a form control
            // grouping — `<fieldset>` would be the wrong element here.
            // biome-ignore lint/a11y/useSemanticElements: see comment above.
            <div key={group.key} role="group" aria-label={t(group.titleKey)}>
              {group.key !== 'view-all' && (
                <div className="px-3 pt-2 pb-1 font-sans text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                  {t(group.titleKey)}
                </div>
              )}
              {group.items.map((item) => {
                const index = flatItems.indexOf(item)
                const active = index === activeIndex
                return (
                  <button
                    key={item.id}
                    type="button"
                    role="option"
                    aria-selected={active}
                    className={`flex w-full flex-col items-start gap-0.5 px-3 py-1.5 text-left font-sans text-sm ${
                      active ? 'bg-accent text-accent-foreground' : 'text-card-foreground'
                    }`}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => select(item)}
                  >
                    <span>{item.label}</span>
                    <span className="text-xs text-muted-foreground">{item.sublabel}</span>
                  </button>
                )
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
