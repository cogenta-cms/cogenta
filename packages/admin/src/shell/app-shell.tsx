import type { JSX } from 'react'
import { useTranslation } from 'react-i18next'
import { NavLink, Outlet } from 'react-router'
import { useAuth } from '../auth/auth-context.js'
import { NoticeBoard } from '../notices/notice-board.js'
import { buttonVariants } from '../ui/index.js'
import { NAV_ITEMS } from './nav-items.js'
import { ThemeToggle } from './theme-toggle.js'

const MAIN_CONTENT_ID = 'main-content'

/**
 * The layout every route renders inside: a skip link, a header, a sidebar of
 * the top-level sections, the routed page as `<main>`, and a footer.
 *
 * The skip link is not decoration — L2's acceptance criterion is full
 * keyboard navigation, and a sighted keyboard user hitting Tab through the
 * whole sidebar before reaching page content on every single navigation is
 * the kind of failure that only shows up when someone actually tries it.
 *
 * Built on the same Tailwind utilities as `src/ui/` rather than the
 * hand-written `shell.css` this replaces, so the shell and its routed
 * content read as one visual language instead of two.
 */
export function AppShell(): JSX.Element {
  const { t } = useTranslation()
  const auth = useAuth()
  const email = auth.state.status === 'authenticated' ? auth.state.user.email : null

  return (
    <div className="grid min-h-full grid-cols-[220px_1fr] grid-rows-[auto_1fr_auto]">
      <a
        className="absolute -top-10 left-2 z-50 rounded-md bg-primary px-3 py-2 text-primary-foreground no-underline transition-[top] duration-150 ease-out focus:top-2"
        href={`#${MAIN_CONTENT_ID}`}
      >
        {t('shell.skipLink')}
      </a>
      <header className="col-span-2 flex items-center gap-4 border-b border-border bg-card px-4 py-3 shadow-sm">
        <span className="font-sans text-base font-semibold tracking-tight text-foreground">
          {t('shell.brand')}
        </span>
        <div className="ml-auto flex items-center gap-3">
          <ThemeToggle />
          {email !== null && (
            <div className="flex items-center gap-3 border-l border-border pl-3 text-sm text-muted-foreground">
              <span className="max-w-[16ch] truncate">{email}</span>
              <button
                type="button"
                onClick={() => void auth.logout()}
                className={buttonVariants({ variant: 'secondary', size: 'sm' })}
              >
                {t('shell.logout')}
              </button>
            </div>
          )}
        </div>
      </header>
      <nav
        className="flex flex-col border-r border-border bg-background px-2 py-4"
        aria-label={t('shell.nav')}
      >
        <ul className="m-0 flex list-none flex-col gap-1 p-0">
          {NAV_ITEMS.map((item) => (
            <li key={item.to}>
              <NavLink
                to={item.to}
                end={item.to === '/'}
                className={({ isActive }) =>
                  `block rounded-md px-3 py-2 text-sm font-medium no-underline transition-colors duration-150 ease-out ${
                    isActive
                      ? 'bg-primary text-primary-foreground'
                      : 'text-foreground hover:bg-accent hover:text-accent-foreground'
                  }`
                }
              >
                {t(item.labelKey)}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
      <main id={MAIN_CONTENT_ID} className="bg-background p-6" tabIndex={-1}>
        {/* Above the routed page, inside the skip link's target: a
            recommendation follows whoever is signed in from screen to screen,
            and it never blocks the page it sits above (ADR-0021). */}
        <NoticeBoard />
        <Outlet />
      </main>
      <footer className="col-span-2 border-t border-border bg-card px-4 py-2 text-center font-sans text-xs text-muted-foreground">
        {t('shell.footer')}
      </footer>
    </div>
  )
}
