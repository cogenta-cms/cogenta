import { type FormEvent, type JSX, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router'
import { SearchIcon } from '../ui/icons.js'
import { Button, buttonVariants, cn, Input } from '../ui/index.js'

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
  const navigate = useNavigate()
  const [query, setQuery] = useState('')

  function search(event: FormEvent): void {
    event.preventDefault()
    const trimmed = query.trim()
    if (trimmed.length > 0) navigate(`/search?q=${encodeURIComponent(trimmed)}`)
  }

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
      {/* A dead link is often a half-remembered screen: let the reader look for it. */}
      <search className="mt-4 flex w-full max-w-sm">
        <form onSubmit={search} className="flex w-full items-center gap-2">
          <div className="relative min-w-0 flex-1">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              aria-label={t('notFound.searchLabel')}
              placeholder={t('notFound.searchPlaceholder')}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="rounded-full pl-9"
            />
          </div>
          <Button type="submit" variant="secondary" className="rounded-full">
            {t('notFound.searchSubmit')}
          </Button>
        </form>
      </search>
    </main>
  )
}
