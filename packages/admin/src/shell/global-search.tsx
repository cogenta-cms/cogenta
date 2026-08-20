import {
  type JSX,
  type KeyboardEvent,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import { listMedia } from '../api/media-client.js'
import { searchContent } from '../api/search-client.js'
import { listUsers } from '../api/users-client.js'
import { useAuth } from '../auth/auth-context.js'
import { canPerform } from '../schema/permissions.js'
import { useSchema } from '../schema/schema-context.js'
import { useTheme } from '../theme/theme-context.js'
import { Input } from '../ui/index.js'
import { NAV_ITEMS } from './nav-items.js'
import { isNavItemVisible } from './nav-visibility.js'
import { chromeStatusOrFallback, useChromeStatus } from './shell-status-context.js'
import { NEXT_MODE } from './theme-toggle.js'

/**
 * The admin's global search — L11 task 4.
 *
 * Three real endpoints, called in parallel from the browser rather than one
 * aggregated server route: `/api/search` already covers content, media and
 * accounts have no full-text index of their own (just a `q` substring filter
 * added alongside this component, see `media-router.ts`/`users-router.ts`),
 * and accounts are admin-only in the first place. A route that fanned all
 * three out server-side would still need to make three separate calls
 * internally and would add a fourth permission surface for no real benefit —
 * an accepted scope trade-off, not an oversight.
 *
 * Every result the popover can show already passed the same permission check
 * the screen it links to would apply on its own: `/api/search` filters by
 * what the actor may read, `/api/media` requires a signed-in actor (checked
 * before this component ever calls it), and `/api/users` is only called at
 * all when the signed-in actor holds the `admin` role — nothing here widens
 * what any of those routes already allow (R4).
 */

const DEBOUNCE_MS = 300
const GROUP_LIMIT = 5

interface ResultItem {
  readonly id: string
  readonly label: string
  readonly sublabel: string
  /** Navigates here on selection — mutually exclusive with `onSelect`. */
  readonly href?: string
  /** Runs on selection instead of navigating — "toggle the theme", "sign out". */
  readonly onSelect?: () => void
}

interface ResultGroup {
  readonly key: 'actions' | 'content' | 'media' | 'users'
  readonly titleKey: string
  readonly items: readonly ResultItem[]
}

export function GlobalSearch(): JSX.Element {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const auth = useAuth()
  const schemaState = useSchema()
  const chromeState = useChromeStatus()
  const theme = useTheme()
  const token = auth.state.status === 'authenticated' ? auth.state.token : null
  const roles = auth.state.status === 'authenticated' ? auth.state.user.roles : []
  const isAdmin = auth.state.status === 'authenticated' && auth.state.user.roles.includes('admin')

  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [groups, setGroups] = useState<readonly ResultGroup[]>([])
  const [activeIndex, setActiveIndex] = useState(-1)

  const rootRef = useRef<HTMLDivElement>(null)
  const listboxId = useId()
  const inputId = useId()

  const flatItems = groups.flatMap((group) => group.items)

  const collections = schemaState.status === 'ready' ? schemaState.schema.collections : null
  const taxonomiesPresent =
    schemaState.status === 'ready' ? (schemaState.schema.taxonomies?.length ?? 0) > 0 : null
  const chrome = chromeStatusOrFallback(chromeState)

  /**
   * The palette's "actions" (fiche 35 task 5): "go to …" for every nav entry
   * this actor can currently see, "create a …" for every collection this
   * actor may create in, plus "toggle the theme" and "sign out" — the four
   * kinds the fiche names. Independent of the query text: filtered against
   * it below, the same way the three search groups already are.
   */
  const actionPool = useMemo<readonly ResultItem[]>(() => {
    const actions: ResultItem[] = []

    for (const item of NAV_ITEMS) {
      const visible = isNavItemVisible(item.visibleWhen, {
        roles,
        collections,
        taxonomiesPresent,
        assistantTools: chromeState.status === 'ready' ? chrome.assistantTools : null,
        commerceActive: chromeState.status === 'ready' ? chrome.shellStatus.commerceActive : null,
      })
      if (!visible) continue
      actions.push({
        id: `action:goto:${item.to}`,
        label: t('globalSearch.actions.goTo', { target: t(item.labelKey) }),
        sublabel: t(item.labelKey),
        href: item.to,
      })
    }

    for (const collection of collections ?? []) {
      if (!canPerform('create', collection, roles)) continue
      actions.push({
        id: `action:create:${collection.name}`,
        label: t('globalSearch.actions.create', { target: collection.labels.singular }),
        sublabel: collection.labels.singular,
        href: `/collections/${encodeURIComponent(collection.name)}/new`,
      })
    }

    actions.push({
      id: 'action:toggle-theme',
      label: t('globalSearch.actions.toggleTheme'),
      sublabel: t(`theme.${theme.mode}`),
      onSelect: () => theme.setMode(NEXT_MODE[theme.mode]),
    })

    actions.push({
      id: 'action:logout',
      label: t('globalSearch.actions.logout'),
      sublabel: '',
      onSelect: () => void auth.logout(),
    })

    return actions
  }, [roles, collections, taxonomiesPresent, chromeState, chrome, theme, auth, t])

  const runSearch = useCallback(
    async (text: string) => {
      if (token === null || text.trim().length === 0) {
        setGroups([])
        return
      }

      const [contentResult, mediaResult, usersResult] = await Promise.allSettled([
        searchContent(token, text, { limit: GROUP_LIMIT }),
        listMedia(token, { q: text, limit: GROUP_LIMIT }),
        isAdmin ? listUsers(token, { q: text }) : Promise.resolve([]),
      ])

      const next: ResultGroup[] = []

      // Actions rank above search results (fiche 35 task 5: "les actions
      // s'ajoutent au-dessus") — matched by a case-insensitive substring of
      // either the action's own label ("Aller à Corbeille") or the thing it
      // names ("Corbeille"), so typing either the verb or the destination
      // finds it.
      const needle = text.trim().toLowerCase()
      const matchingActions = actionPool
        .filter(
          (action) =>
            action.label.toLowerCase().includes(needle) ||
            action.sublabel.toLowerCase().includes(needle),
        )
        .slice(0, GROUP_LIMIT)
      if (matchingActions.length > 0) {
        next.push({
          key: 'actions',
          titleKey: 'globalSearch.groups.actions',
          items: matchingActions,
        })
      }

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

      setGroups(next)
      setActiveIndex(-1)
    },
    [token, isAdmin, actionPool],
  )

  // Debounced on every keystroke; `onKeyDown` below runs it immediately on
  // Enter instead of waiting the extra 300ms out.
  useEffect(() => {
    if (query.trim().length === 0) {
      setGroups([])
      return
    }
    const timer = window.setTimeout(() => void runSearch(query), DEBOUNCE_MS)
    return () => window.clearTimeout(timer)
  }, [query, runSearch])

  useEffect(() => {
    function onPointerDown(event: MouseEvent): void {
      if (rootRef.current !== null && !rootRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [])

  const select = useCallback(
    (item: ResultItem) => {
      setOpen(false)
      setQuery('')
      setGroups([])
      if (item.onSelect !== undefined) item.onSelect()
      else if (item.href !== undefined) navigate(item.href)
    },
    [navigate],
  )

  // `⌘K`/`Ctrl+K` opens this same search, enriched with actions (fiche 35
  // task 5) — a global listener rather than one scoped to this component's
  // own tree, so the shortcut works from anywhere in the admin, the way a
  // command palette is expected to.
  useEffect(() => {
    function onGlobalKeyDown(event: globalThis.KeyboardEvent): void {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setOpen(true)
        document.getElementById(inputId)?.focus()
      }
    }
    document.addEventListener('keydown', onGlobalKeyDown)
    return () => document.removeEventListener('keydown', onGlobalKeyDown)
  }, [inputId])

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key === 'Escape') {
      setOpen(false)
      return
    }
    if (event.key === 'Enter') {
      event.preventDefault()
      if (activeIndex >= 0 && activeIndex < flatItems.length) {
        select(flatItems[activeIndex] as ResultItem)
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

  const showPopover = open && query.trim().length > 0 && flatItems.length > 0

  return (
    <div ref={rootRef} className="app-shell__search relative w-full max-w-sm">
      <label htmlFor={inputId} className="sr-only">
        {t('globalSearch.label')}
      </label>
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
      />
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
              <div className="px-3 pt-2 pb-1 font-sans text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                {t(group.titleKey)}
              </div>
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
