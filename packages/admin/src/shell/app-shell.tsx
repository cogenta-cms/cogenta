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
import { useAuth } from '../auth/auth-context.js'
import { NoticeBoard } from '../notices/notice-board.js'
import { NotificationCenter } from '../notices/notification-center.js'
import { useSchema } from '../schema/schema-context.js'
import { useBrandingSettings, useSiteTitle } from '../settings/site-settings-context.js'
import { useAdminTheme } from '../theme/admin-theme-context.js'
import {
  AgentsIcon,
  AuditIcon,
  CollectionsIcon,
  DashboardIcon,
  DocumentationIcon,
  EditIcon,
  type IconProps,
  LogoutIcon,
  MediaIcon,
  ProfileIcon,
  SettingsIcon,
  SitePlanIcon,
  TaxonomiesIcon,
  TrashIcon,
  TrendIcon,
  UsersIcon,
} from '../ui/icons.js'
import { breadcrumbFor, documentTitleFor } from './breadcrumb.js'
import { GlobalSearch } from './global-search.js'
import type { NavGroupId, NavItem } from './nav-items.js'
import { visibleNavGroups } from './nav-visibility.js'
import { chromeStatusOrFallback, useChromeStatus } from './shell-status-context.js'
import '../styles/shell.css'
import { ThemeToggle } from './theme-toggle.js'

const MAIN_CONTENT_ID = 'main-content'
const SIDEBAR_ID = 'app-shell-sidebar'
const NAV_GROUPS_STORAGE_KEY = 'cogenta.admin.navGroups'
const SIDEBAR_COLLAPSED_STORAGE_KEY = 'cogenta.admin.sidebarCollapsed'

const NAV_ICONS: Record<string, ComponentType<IconProps>> = {
  '/': DashboardIcon,
  '/collections': CollectionsIcon,
  '/taxonomies': TaxonomiesIcon,
  '/trash': TrashIcon,
  '/media': MediaIcon,
  '/audit': AuditIcon,
  '/agents': AgentsIcon,
  '/create-site': SitePlanIcon,
  '/users': UsersIcon,
  '/profile': ProfileIcon,
  '/settings': SettingsIcon,
  '/documentation': DocumentationIcon,
}

/** Every item without its own icon falls back to its group's — a coherent mark beats a mismatched one, and drawing eleven more glyphs is L11's job, not this fiche's. */
const GROUP_ICONS: Record<NavGroupId, ComponentType<IconProps>> = {
  content: CollectionsIcon,
  appearance: EditIcon,
  commerce: TrendIcon,
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
 * The vendored, pre-resized Cogenta mark (fiche L21 task 8) — 64×64,
 * compressed down from the 500×500 source (`docs/logo/`) with the project's
 * own WASM image driver rather than served at its full size, which is too
 * large for a topbar. `BASE_URL` is what keeps this correct in both dev
 * (`/`) and the production build `cogenta serve` serves under `/admin/`
 * (`vite.config.ts`'s own `base` comment).
 */
const COGENTA_LOGO_URL = `${import.meta.env.BASE_URL}branding/logo-cogenta-small.png`
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

  const groups = useMemo(
    () =>
      visibleNavGroups({
        roles,
        collections,
        taxonomiesPresent,
        assistantTools: chromeState.status === 'ready' ? chrome.assistantTools : null,
        commerceActive: chromeState.status === 'ready' ? chrome.shellStatus.commerceActive : null,
      }),
    [roles, collections, taxonomiesPresent, chromeState],
  )

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
   * (`logoUrl`, above); (2) Cogenta's real logo plus its name, the default;
   * (3) a white-label logo once Cogenta's credit is turned off and a
   * replacement was uploaded — deliberately never paired with the literal
   * word "Cogenta" (the whole point of turning its credit off), so the
   * image carries the accessible name itself via `alt`, falling back to the
   * site's own title and then to nothing rather than the product's name;
   * (4) a bare, unlabelled mark, the honest result of turning branding off
   * with no replacement uploaded.
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
      return (
        <>
          <img src={COGENTA_LOGO_URL} alt="" aria-hidden="true" className="app-shell__brand-logo" />
          {t('shell.brand')}
        </>
      )
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
      <footer className="app-shell__footer">{t('shell.footer')}</footer>
    </div>
  )
}
