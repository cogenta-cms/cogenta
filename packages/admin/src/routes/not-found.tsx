import type { JSX } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { buttonVariants, cn } from '../ui/index.js'

/**
 * The wildcard route (`app.tsx`'s `path="*"`, last child, inside `AppShell`).
 *
 * Before this existed, any unmatched `/admin/*` URL — a typo, a bookmark to a
 * route that moved, a deliberately CLI-only feature someone still tried to
 * reach by URL — rendered a totally blank page: no sidebar, no heading, no
 * way back except the browser's own Back button, because react-router
 * renders nothing at all when no `<Route>` in the tree matches. This is the
 * one route that always matches, so the shell (sidebar, header) keeps
 * rendering around it and the page says what happened.
 */
export function NotFoundRoute(): JSX.Element {
  const { t } = useTranslation()

  return (
    <main className="reveal flex min-h-[60vh] flex-col items-center justify-center gap-3 p-6 text-center">
      <p
        aria-hidden="true"
        className="m-0 font-mono text-7xl leading-none font-bold tracking-tight text-primary sm:text-8xl"
      >
        404
      </p>
      <h1 className="m-0 text-xl leading-7 font-semibold tracking-tight">
        {t('notFound.heading')}
      </h1>
      <p className="m-0 max-w-prose text-sm text-muted-foreground">{t('notFound.body')}</p>
      <Link className={cn(buttonVariants({ variant: 'primary' }), 'mt-2 rounded-full px-6')} to="/">
        {t('notFound.backToDashboard')}
      </Link>
    </main>
  )
}
