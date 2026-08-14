import type { JSX } from 'react'
import { useTranslation } from 'react-i18next'
import { NavLink, Outlet } from 'react-router'
import { useAuth } from '../auth/auth-context.js'
import { NAV_ITEMS } from './nav-items.js'
import '../styles/shell.css'

const MAIN_CONTENT_ID = 'main-content'

/**
 * The layout every route renders inside: a skip link, a sidebar of the
 * top-level sections, and the routed page as `<main>`.
 *
 * The skip link is not decoration — L2's acceptance criterion is full
 * keyboard navigation, and a sighted keyboard user hitting Tab through the
 * whole sidebar before reaching page content on every single navigation is
 * the kind of failure that only shows up when someone actually tries it.
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
        <span className="app-shell__brand">{t('shell.brand')}</span>
        {email !== null && (
          <div className="app-shell__account">
            <span>{email}</span>
            <button type="button" onClick={() => void auth.logout()}>
              {t('shell.logout')}
            </button>
          </div>
        )}
      </header>
      <nav className="app-shell__sidebar" aria-label={t('shell.nav')}>
        <ul>
          {NAV_ITEMS.map((item) => (
            <li key={item.to}>
              <NavLink to={item.to} end={item.to === '/'}>
                {t(item.labelKey)}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
      <main id={MAIN_CONTENT_ID} className="app-shell__content" tabIndex={-1}>
        <Outlet />
      </main>
    </div>
  )
}
