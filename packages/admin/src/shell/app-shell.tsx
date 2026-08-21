import {
  type ComponentType,
  type CSSProperties,
  type JSX,
  type KeyboardEvent as ReactKeyboardEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useTranslation } from 'react-i18next'
import { NavLink, Outlet, useLocation } from 'react-router'
import { fetchMediaBlobUrl } from '../api/media-client.js'
import { AgentChatWidget } from '../assist/agent-chat-widget.js'
import { useAuth } from '../auth/auth-context.js'
import { NoticeBoard } from '../notices/notice-board.js'
import { NotificationCenter } from '../notices/notification-center.js'
import { useSchema } from '../schema/schema-context.js'
import {
  useBrandingSettings,
  useSiteSettingsState,
  useSiteTitle,
} from '../settings/site-settings-context.js'
import { useAdminTheme } from '../theme/admin-theme-context.js'
import { useTheme } from '../theme/theme-context.js'
import {
  AgentsIcon,
  ApiKeysIcon,
  AssistantIcon,
  AuditIcon,
  CollectionsIcon,
  CommentsIcon,
  CommerceOrdersIcon,
  CommercePaymentIcon,
  CommerceProductsIcon,
  CommerceShippingIcon,
  CommerceShopIcon,
  CommerceSubscriptionsIcon,
  CommerceTaxIcon,
  CommerceTicketIcon,
  DashboardIcon,
  DocumentationIcon,
  EditIcon,
  ExternalLinkIcon,
  FormSubmissionsIcon,
  FormsIcon,
  HealthIcon,
  type IconProps,
  ImportIcon,
  LogoutIcon,
  MarketplaceIcon,
  McpIcon,
  MediaIcon,
  MenusIcon,
  ProfileIcon,
  ReviewIcon,
  RolesIcon,
  ScheduledIcon,
  SeoIcon,
  SettingsIcon,
  SitePlanIcon,
  TaxonomiesIcon,
  ToolsIcon,
  TranslationsIcon,
  TrashIcon,
  TrendIcon,
  UsersIcon,
} from '../ui/icons.js'
import { breadcrumbFor, documentTitleFor } from './breadcrumb.js'
import { GlobalSearch } from './global-search.js'
import type { NavGroupId, NavItem } from './nav-items.js'
import {
  applyNavLayout,
  EMPTY_NAV_LAYOUT_OVERRIDES,
  parseNavLayoutOverrides,
} from './nav-layout.js'
import { visibleNavGroups } from './nav-visibility.js'
import { chromeStatusOrFallback, useChromeStatus } from './shell-status-context.js'
import '../styles/shell.css'
import { ThemeToggle } from './theme-toggle.js'

const MAIN_CONTENT_ID = 'main-content'
const SIDEBAR_ID = 'app-shell-sidebar'
const NAV_GROUPS_STORAGE_KEY = 'cogenta.admin.navGroups'
const SIDEBAR_COLLAPSED_STORAGE_KEY = 'cogenta.admin.sidebarCollapsed'

/**
 * One icon per nav entry, wherever a distinct one exists (fiche 22 tâche 8,
 * part 6 — the sidebar icon audit). Before this, everything not listed here
 * fell back to `GROUP_ICONS`, which is how "Menus", "Comments" and
 * "Translations" all ended up showing the exact same three-bar glyph as
 * "Content", and six commerce screens all showed the same bar chart — the
 * real user complaint this task fixes. An entry genuinely without its own
 * meaningful mark (there are none left after this pass) would still fall
 * back to its group's icon rather than force a glyph onto it.
 */
const NAV_ICONS: Record<string, ComponentType<IconProps>> = {
  '/': DashboardIcon,
  '/review': ReviewIcon,
  '/collections': CollectionsIcon,
  '/taxonomies': TaxonomiesIcon,
  '/menus': MenusIcon,
  '/comments': CommentsIcon,
  '/translations': TranslationsIcon,
  '/trash': TrashIcon,
  '/forms': FormsIcon,
  '/form-submissions': FormSubmissionsIcon,
  '/media': MediaIcon,
  '/appearance': EditIcon,
  '/admin-appearance': EditIcon,
  '/seo': SeoIcon,
  '/commerce/products': CommerceProductsIcon,
  '/commerce/orders': CommerceOrdersIcon,
  '/commerce/coupons': CommerceTicketIcon,
  '/commerce/subscriptions': CommerceSubscriptionsIcon,
  '/commerce/settings': CommerceShopIcon,
  '/commerce/tax': CommerceTaxIcon,
  '/commerce/shipping': CommerceShippingIcon,
  '/commerce/payment': CommercePaymentIcon,
  '/assistant': AssistantIcon,
  '/agents': AgentsIcon,
  '/mcp': McpIcon,
  '/create-site': SitePlanIcon,
  '/users': UsersIcon,
  '/api-keys': ApiKeysIcon,
  '/roles': RolesIcon,
  '/audit': AuditIcon,
  '/analytics': TrendIcon,
  '/import': ImportIcon,
  '/marketplace': MarketplaceIcon,
  '/ops-settings': SettingsIcon,
  '/health': HealthIcon,
  '/tools': ToolsIcon,
  '/scheduled': ScheduledIcon,
  '/settings': SettingsIcon,
  '/profile': ProfileIcon,
  '/documentation': DocumentationIcon,
}

/** Only reached by a future nav entry this map has not caught up with yet. */
const GROUP_ICONS: Record<NavGroupId, ComponentType<IconProps>> = {
  content: CollectionsIcon,
  appearance: EditIcon,
  commerce: CommerceShopIcon,
  ai: AgentsIcon,
  accounts: UsersIcon,
  ops: SettingsIcon,
  settings: SettingsIcon,
}

function iconFor(item: NavItem): ComponentType<IconProps> {
  return NAV_ICONS[item.to] ?? GROUP_ICONS[item.group]
}

function readStoredGroupOpen(): Partial<Record<NavGroupId, boolean>> {
  try {
    const raw = localStorage.getItem(NAV_GROUPS_STORAGE_KEY)
    if (raw === null) return {}
    const parsed: unknown = JSON.parse(raw)
    return typeof parsed === 'object' && parsed !== null
      ? (parsed as Partial<Record<NavGroupId, boolean>>)
      : {}
  } catch {
    return {}
  }
}

function readStoredSidebarCollapsed(): boolean {
  return localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === '1'
}

/**
 * Cogenta's own logo — trimmed to its real content (no padding) from the
 * 500×500 sources in `docs/logo/`, kept as two theme-matched variants
 * (`logo-cogenta-light.png`: icon + dark "COGENTA" wordmark, for a light
 * topbar/footer; `logo-cogenta-dark.png`: icon + white wordmark, for a dark
 * one) rather than one small icon plus a separate HTML "Cogenta" label — the
 * icon-only 64×64 mark this replaced (fiche L21 task 8) read as blurry once
 * shown at any real size, and the wordmark is already part of the real
 * asset, not something to reconstruct in CSS. `BASE_URL` is what keeps this
 * correct in both dev (`/`) and the production build `cogenta serve` serves
 * under `/admin/` (`vite.config.ts`'s own `base` comment).
 */
const COGENTA_LOGO_LIGHT_URL = `${import.meta.env.BASE_URL}branding/logo-cogenta-light.png`
const COGENTA_LOGO_DARK_URL = `${import.meta.env.BASE_URL}branding/logo-cogenta-dark.png`
/** The plain mark shown when branding is off and no white-label logo was uploaded — the original, pre-task-8 placeholder, unlabelled rather than named "Cogenta". */
const BRAND_MARK_FALLBACK = '//'

/**
 * Resolves a media id to a `blob:` URL through the authenticated
 * `/api/media/{id}/file` route (a plain `<img src>` cannot carry a bearer
 * token) — shared by the admin theme's own personalised logo below and by
 * the white-label logo of fiche L21 task 8, the two places this admin shows
 * an uploaded media asset as a decorative mark rather than through a real
 * `MediaPicker` preview.
 */
function useMediaBlobUrl(mediaId: string | null, token: string | null): string | null {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    if (mediaId === null || token === null) {
      setUrl(null)
      return
    }
    let cancelled = false
    let objectUrl: string | null = null
    fetchMediaBlobUrl(token, mediaId)
      .then((resolved) => {
        if (cancelled) {
          URL.revokeObjectURL(resolved)
          return
        }
        objectUrl = resolved
        setUrl(resolved)
      })
      .catch(() => setUrl(null))
    return () => {
      cancelled = true
      if (objectUrl !== null) URL.revokeObjectURL(objectUrl)
    }
  }, [mediaId, token])
  return url
}

/** Every focusable element inside a container, in DOM order — the pool a focus trap cycles through. */
function focusableIn(container: HTMLElement): readonly HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  )
}

/**
 * The layout every route renders inside: a skip link, a header, a grouped
 * and permission-filtered sidebar, the routed page as `<main>`, and a
 * footer.
 *
 * The skip link is not decoration — L2's acceptance criterion is full
 * keyboard navigation, and a sighted keyboard user hitting Tab through the
 * whole sidebar before reaching page content on every single navigation is
 * the kind of failure that only shows up when someone actually tries it.
 *
 * Fiche 35's six tasks live here: grouped + permission/feature-filtered nav
 * (task 1), a collapsible sidebar with a mobile drawer (task 2), badges from
 * one aggregated read (task 3), a breadcrumb and a distinguishing document
 * title (task 4), and `⌘K`/`Ctrl+K` handed to `GlobalSearch` (task 5) — the
 * public admin bar of task 6 lives server-side, in `theme-render.ts`, since
 * it has to be rendered without this SPA ever loading.
 */
export function AppShell(): JSX.Element {
  const { t } = useTranslation()
  const auth = useAuth()
  const location = useLocation()
  const schemaState = useSchema()
  const chromeState = useChromeStatus()

  const email = auth.state.status === 'authenticated' ? auth.state.user.email : null
  const roles = auth.state.status === 'authenticated' ? auth.state.user.roles : []
  const authToken = auth.state.status === 'authenticated' ? auth.state.token : null
  const chrome = chromeStatusOrFallback(chromeState)

  // The admin's own personalised logo (L21 task 2), if one has been set —
  // absent by default. This is a visual-identity lever of the admin theme
  // system (`admin-appearance.tsx`), unrelated to whether Cogenta is
  // credited at all — it wins over the branding logic below whenever it is
  // set, on the theory that an install that already chose its own admin
  // logo does not need a second, competing decision made for it.
  const adminTheme = useAdminTheme()
  const logoMediaId = adminTheme.state?.active.overrides.logoMediaId ?? null
  const logoUrl = useMediaBlobUrl(logoMediaId, authToken)
  const { resolved: colorScheme } = useTheme()

  // Cogenta's own credit, and its white-label override (fiche L21 task 8,
  // ADR-0025's editorial settings) — read from the same `SiteSettingsProvider`
  // every screen's date formatting already uses, so no extra request is paid
  // for this. Defaults to showing Cogenta (the pre-task-8 behaviour) while
  // the settings are still loading or failed to load, exactly the way
  // `useFormattingSettings` defaults rather than blocking the shell on this.
  const branding = useBrandingSettings()
  const whiteLabelLogoUrl = useMediaBlobUrl(branding.customLogoMediaId, authToken)
  const siteTitle = useSiteTitle()

  const collections = schemaState.status === 'ready' ? schemaState.schema.collections : null
  const taxonomiesPresent =
    schemaState.status === 'ready' ? (schemaState.schema.taxonomies?.length ?? 0) > 0 : null

  // Fiche 22 tâche 8, part 3 — a site-wide reorder/hide on top of the
  // permission filter above, never a replacement for it: an actor who
  // cannot read a collection never sees its entry no matter what an admin
  // configured in Réglages › Navigation, and a group hidden here is
  // independent from a group `visibleNavGroups` already dropped for having
  // zero visible items.
  const settingsState = useSiteSettingsState()
  const navLayout = useMemo(
    () =>
      settingsState.status === 'ready'
        ? parseNavLayoutOverrides(settingsState.settings)
        : EMPTY_NAV_LAYOUT_OVERRIDES,
    [settingsState],
  )

  const groups = useMemo(() => {
    const permitted = visibleNavGroups({
      roles,
      collections,
      taxonomiesPresent,
      assistantTools: chromeState.status === 'ready' ? chrome.assistantTools : null,
      commerceActive: chromeState.status === 'ready' ? chrome.shellStatus.commerceActive : null,
    })
    return applyNavLayout(permitted, navLayout)
  }, [roles, collections, taxonomiesPresent, chromeState, navLayout])

  const [groupOpen, setGroupOpen] =
    useState<Partial<Record<NavGroupId, boolean>>>(readStoredGroupOpen)
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(readStoredSidebarCollapsed)
  const [drawerOpen, setDrawerOpen] = useState(false)

  useEffect(() => {
    localStorage.setItem(NAV_GROUPS_STORAGE_KEY, JSON.stringify(groupOpen))
  }, [groupOpen])

  useEffect(() => {
    localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, sidebarCollapsed ? '1' : '0')
  }, [sidebarCollapsed])

  // A navigation closes the mobile drawer — nothing should stay open over
  // the page it just left.
  useEffect(() => {
    setDrawerOpen(false)
  }, [location.pathname])

  // The page itself scrolls (`.app-shell__content` has no height/overflow
  // of its own — see shell.css), so react-router does not reset scroll on
  // navigation the way a full page load would: clicking a nav link while
  // scrolled down on the previous screen left the next one scrolled down
  // too, showing nothing until the reader scrolled back up by hand.
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [location.pathname])

  const breadcrumb = useMemo(
    () => breadcrumbFor(location.pathname, collections),
    [location.pathname, collections],
  )

  useEffect(() => {
    document.title = documentTitleFor(breadcrumb, t, t('shell.brand'))
  }, [breadcrumb, t])

  const drawerRef = useRef<HTMLDivElement>(null)
  const drawerTriggerRef = useRef<HTMLButtonElement>(null)

  // Focus trap for the mobile drawer (fiche 35 task 2): focus moves in on
  // open, `Tab`/`Shift+Tab` cycle within it rather than escaping into the
  // page behind, `Escape` closes it and hands focus back to the button that
  // opened it.
  useEffect(() => {
    if (!drawerOpen) return
    const container = drawerRef.current
    if (container === null) return
    const items = focusableIn(container)
    items[0]?.focus()

    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        event.preventDefault()
        setDrawerOpen(false)
        drawerTriggerRef.current?.focus()
        return
      }
      if (event.key !== 'Tab' || container === null) return
      const focusable = focusableIn(container)
      if (focusable.length === 0) return
      const first = focusable[0] as HTMLElement
      const last = focusable[focusable.length - 1] as HTMLElement
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [drawerOpen])

  function isGroupOpen(group: {
    readonly id: NavGroupId
    readonly openByDefault: boolean
  }): boolean {
    const stored = groupOpen[group.id]
    return stored ?? group.openByDefault
  }

  function renderGroupList(): JSX.Element {
    return (
      <>
        {groups.map((group) => (
          <details
            key={group.id}
            className="app-shell__nav-group"
            open={isGroupOpen(group)}
            onToggle={(event) => {
              // `<details>`'s own `open` state drives this — reading it back
              // keeps a mouse click, `Space`/`Enter` on the `<summary>`, and
              // this component's own state in agreement.
              const nowOpen = (event.currentTarget as HTMLDetailsElement).open
              setGroupOpen((previous) => ({ ...previous, [group.id]: nowOpen }))
            }}
          >
            <summary className="app-shell__nav-group-summary">{t(group.labelKey)}</summary>
            <ul>
              {group.items.map((item, index) => {
                const Icon = iconFor(item)
                const badgeCount = item.badge === undefined ? null : chrome.shellStatus[item.badge]
                return (
                  <li
                    key={item.to}
                    className="reveal"
                    style={
                      {
                        '--reveal-delay': `${Math.min(index, 8) * 30}ms`,
                      } as CSSProperties & Record<'--reveal-delay', string>
                    }
                  >
                    <NavLink to={item.to} end={item.to === '/'}>
                      <Icon className="size-4 shrink-0" />
                      <span>{t(item.labelKey)}</span>
                      {badgeCount !== null && badgeCount > 0 && (
                        <span
                          className="app-shell__badge"
                          role="status"
                          aria-label={t('shell.badgeCount', { count: badgeCount })}
                        >
                          {badgeCount > 99 ? '99+' : badgeCount}
                        </span>
                      )}
                    </NavLink>
                  </li>
                )
              })}
            </ul>
          </details>
        ))}
      </>
    )
  }

  /**
   * The image/text shown in the topbar's brand slot, in priority order:
   * (1) the admin theme's own personalised logo, untouched by branding
   * (`logoUrl`, above) — a raw upload with no baked-in wordmark, so it still
   * gets `t('shell.brand')` next to it; (2) Cogenta's own logo, the default —
   * the real asset already carries the "COGENTA" wordmark, so nothing is
   * appended, and the light/dark variant follows `colorScheme` the same way
   * `theme.css` itself does; (3) a white-label logo once Cogenta's credit is
   * turned off and a replacement was uploaded — deliberately never paired
   * with the literal word "Cogenta" (the whole point of turning its credit
   * off), so the image carries the accessible name itself via `alt`, falling
   * back to the site's own title and then to nothing rather than the
   * product's name; (4) a bare, unlabelled mark, the honest result of
   * turning branding off with no replacement uploaded.
   */
  function renderBrandMark(): JSX.Element {
    if (logoUrl !== null) {
      return (
        <>
          <img src={logoUrl} alt="" aria-hidden="true" className="app-shell__brand-logo" />
          {t('shell.brand')}
        </>
      )
    }
    if (branding.showCogentaBranding) {
      const cogentaLogoUrl = colorScheme === 'dark' ? COGENTA_LOGO_DARK_URL : COGENTA_LOGO_LIGHT_URL
      return <img src={cogentaLogoUrl} alt={t('shell.brand')} className="app-shell__brand-logo" />
    }
    if (whiteLabelLogoUrl !== null) {
      return <img src={whiteLabelLogoUrl} alt={siteTitle ?? ''} className="app-shell__brand-logo" />
    }
    return (
      <span className="app-shell__brand-mark" aria-hidden="true">
        {BRAND_MARK_FALLBACK}
      </span>
    )
  }

  /**
   * The footer (fiche 22 tâche 8, part 4) — replaces the plain centred
   * "Cogenta admin" text that used to render unconditionally here, which
   * kept naming Cogenta even after `renderBrandMark()`'s white-label
   * override had already turned it off in the very same topbar above.
   * Reuses `renderBrandMark()` as-is (never a second copy of the branding
   * priority order) and only ever adds a version number next to it while
   * `branding.showCogentaBranding` is on — a white-labelled install has no
   * reason to advertise which CMS or which version runs it.
   */
  function renderFooter(): JSX.Element {
    const version = chrome.shellStatus.cogentaVersion
    return (
      <div className="app-shell__footer-inner">
        <span className="app-shell__footer-brand">
          {renderBrandMark()}
          {branding.showCogentaBranding && version !== '' && (
            <span className="app-shell__footer-version">v{version}</span>
          )}
        </span>
        <span className="app-shell__footer-site">{siteTitle ?? t('shell.footer')}</span>
      </div>
    )
  }

  function onDrawerKeyDown(event: ReactKeyboardEvent<HTMLDivElement>): void {
    // The trap above also listens at the document level (so `Escape`/`Tab`
    // work even when focus is on something React does not attach this
    // handler to), but stopping propagation here keeps a stray `Escape`
    // inside a form field from doing anything unrelated first.
    if (event.key === 'Escape') event.stopPropagation()
  }

  return (
    <div className={`app-shell${sidebarCollapsed ? ' app-shell--sidebar-collapsed' : ''}`}>
      <a className="skip-link" href={`#${MAIN_CONTENT_ID}`}>
        {t('shell.skipLink')}
      </a>
      <header className="app-shell__topbar">
        <button
          type="button"
          className="app-shell__drawer-trigger"
          ref={drawerTriggerRef}
          aria-expanded={drawerOpen}
          aria-controls={SIDEBAR_ID}
          aria-label={t('shell.openNav')}
          onClick={() => setDrawerOpen((open) => !open)}
        >
          <span aria-hidden="true">☰</span>
        </button>
        <span className="app-shell__brand">{renderBrandMark()}</span>
        {breadcrumb.length > 0 && (
          <nav aria-label={t('shell.breadcrumb')} className="app-shell__breadcrumb">
            <ol>
              {breadcrumb.map((segment, index) => {
                const label = segment.label ?? t(segment.labelKey ?? '')
                const isLast = index === breadcrumb.length - 1
                return (
                  <li key={`${segment.labelKey ?? segment.label}-${index}`}>
                    {!isLast && segment.to !== undefined ? (
                      <NavLink to={segment.to}>{label}</NavLink>
                    ) : (
                      <span aria-current={isLast ? 'page' : undefined}>{label}</span>
                    )}
                  </li>
                )
              })}
            </ol>
          </nav>
        )}
        {email !== null && <GlobalSearch />}
        <div className="app-shell__account">
          {/* Fiche 22 tâche 8, part 5 — a quick way back to what this admin
              actually manages, one click away from any screen, opened in its
              own tab so the admin session stays exactly where it was. A
              root-relative path rather than a stored site URL: the public
              site and this admin are always served from the same origin
              (`cogenta serve` mounts `/admin/*` alongside the public routes),
              so there is no second value that could ever drift from it. */}
          <a
            className="app-shell__view-site"
            href="/"
            target="_blank"
            rel="noopener noreferrer"
            title={t('shell.viewSite')}
          >
            <ExternalLinkIcon className="size-3.5" />
            <span className="app-shell__view-site-label">{t('shell.viewSite')}</span>
          </a>
          {email !== null && <NotificationCenter />}
          <ThemeToggle />
          {email !== null && (
            <>
              <span className="app-shell__account-email">{email}</span>
              <button
                type="button"
                className="app-shell__logout"
                onClick={() => void auth.logout()}
              >
                <LogoutIcon className="size-3.5" />
                {t('shell.logout')}
              </button>
            </>
          )}
        </div>
      </header>

      <nav
        id={SIDEBAR_ID}
        className="app-shell__sidebar"
        aria-label={t('shell.nav')}
        data-collapsed={sidebarCollapsed ? 'true' : undefined}
      >
        {renderGroupList()}
        <button
          type="button"
          className="app-shell__collapse-toggle"
          aria-pressed={sidebarCollapsed}
          aria-label={t(sidebarCollapsed ? 'shell.expandSidebar' : 'shell.collapseSidebar')}
          title={t(sidebarCollapsed ? 'shell.expandSidebar' : 'shell.collapseSidebar')}
          onClick={() => setSidebarCollapsed((collapsed) => !collapsed)}
        >
          <span aria-hidden="true">{sidebarCollapsed ? '»' : '«'}</span>
        </button>
      </nav>

      {drawerOpen && (
        // The drawer's real dismissal is the document-level Escape handler above;
        // this click target is a pointer-only convenience equivalent to clicking
        // outside any other popover in this admin, on a decorative backdrop with
        // no accessible role to give it.
        // biome-ignore lint/a11y/useKeyWithClickEvents: see comment above.
        // biome-ignore lint/a11y/noStaticElementInteractions: see comment above.
        <div className="app-shell__drawer-backdrop" onClick={() => setDrawerOpen(false)} />
      )}
      {drawerOpen && (
        <div
          ref={drawerRef}
          className="app-shell__drawer"
          role="dialog"
          aria-modal="true"
          aria-label={t('shell.nav')}
          onKeyDown={onDrawerKeyDown}
        >
          {renderGroupList()}
        </div>
      )}

      <main id={MAIN_CONTENT_ID} className="app-shell__content" tabIndex={-1}>
        {/* Above the routed page, inside the skip link's target: a
            recommendation follows whoever is signed in from screen to screen,
            and it never blocks the page it sits above (ADR-0021). */}
        <NoticeBoard />
        <Outlet />
      </main>
      <footer className="app-shell__footer">{renderFooter()}</footer>
      {/* L22 task 2 — floating chat, admin-only (matches `POST
          /api/agents/:name/run`'s own `requireAdmin`): a non-admin never
          sees a button that would only ever answer 403. */}
      {authToken !== null && roles.includes('admin') && <AgentChatWidget token={authToken} />}
    </div>
  )
}
