import type { ComponentType, CSSProperties, JSX } from 'react'
import { useTranslation } from 'react-i18next'
import { NavLink, Outlet } from 'react-router'
import { useAuth } from '../auth/auth-context.js'
import { NoticeBoard } from '../notices/notice-board.js'
import { NotificationCenter } from '../notices/notification-center.js'
import {
  AgentsIcon,
  AuditIcon,
  CollectionsIcon,
  DashboardIcon,
  type IconProps,
  LogoutIcon,
  MediaIcon,
  ProfileIcon,
  SettingsIcon,
  SitePlanIcon,
  TaxonomiesIcon,
  TrashIcon,
  UsersIcon,
} from '../ui/icons.js'
import { GlobalSearch } from './global-search.js'
import { NAV_ITEMS } from './nav-items.js'
import '../styles/shell.css'
import { ThemeToggle } from './theme-toggle.js'

const MAIN_CONTENT_ID = 'main-content'

const NAV_ICONS: Record<string, ComponentType<IconProps>> = {
  '/': DashboardIcon,
  '/collections': CollectionsIcon,
  '/taxonomies': TaxonomiesIcon,
  '/trash': TrashIcon,
  '/media': MediaIcon,
  '/audit': AuditIcon,
  '/agents': AgentsIcon,
  '/site-plan': SitePlanIcon,
  '/users': UsersIcon,
  '/profile': ProfileIcon,
  '/settings': SettingsIcon,
}

/**
 * The layout every route renders inside: a skip link, a header, a sidebar of
 * the top-level sections, the routed page as `<main>`, and a footer.
 *
 * The skip link is not decoration — L2's acceptance criterion is full
 * keyboard navigation, and a sighted keyboard user hitting Tab through the
 * whole sidebar before reaching page content on every single navigation is
 * the kind of failure that only shows up when someone actually tries it.
 *
 * The chrome (topbar, sidebar, footer) is styled by `../styles/shell.css` —
 * a hand-written stylesheet rather than Tailwind utilities, matching the
 * technical/editorial redesign's asymmetric grid-template-areas layout.
 * Routed content underneath still reads the same Tailwind design tokens.
 */
export function AppShell(): JSX.Element {
  const { t } = useTranslation()
  const auth = useAuth()
  const email = auth.state.status === 'authenticated' ? auth.state.user.email : null

  return (
    <div className="app-shell">
      <a className="skip-link" href={`#${MAIN_CONTENT_ID}`}>
        {t('shell.skipLink')}
      </a>
      <header className="app-shell__topbar">
        <span className="app-shell__brand">
          <span className="app-shell__brand-mark" aria-hidden="true">
            {'//'}
          </span>
          {t('shell.brand')}
        </span>
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
      <nav className="app-shell__sidebar" aria-label={t('shell.nav')}>
        <ul>
          {NAV_ITEMS.map((item, index) => {
            const Icon = NAV_ICONS[item.to] ?? DashboardIcon
            return (
              <li
                key={item.to}
                className="reveal"
                style={
                  { '--reveal-delay': `${Math.min(index, 8) * 30}ms` } as CSSProperties &
                    Record<'--reveal-delay', string>
                }
              >
                <NavLink to={item.to} end={item.to === '/'}>
                  <Icon className="size-4 shrink-0" />
                  <span>{t(item.labelKey)}</span>
                </NavLink>
              </li>
            )
          })}
        </ul>
      </nav>
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
