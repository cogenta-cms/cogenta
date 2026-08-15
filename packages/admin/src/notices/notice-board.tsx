import { type JSX, useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { type AdminNotice, dismissNotice, listNotices } from '../api/notices-client.js'
import { useAuth } from '../auth/auth-context.js'
import { buttonVariants, Notice } from '../ui/index.js'

/**
 * The admin's notice board — L11 task 2, ADR-0021.
 *
 * It sits above the routed page in the shell, so a recommendation is visible
 * wherever someone happens to be, and it is never a modal, never a route guard
 * and never a redirect: the whole point of the mechanism is that it informs
 * without standing in the way.
 *
 * Failing to fetch is silent. A recommendation that could not be loaded is
 * worth nothing to shout about, and a red error bar at the top of every screen
 * because a notice endpoint hiccuped is strictly worse than no bar at all.
 */
export function NoticeBoard(): JSX.Element | null {
  const { t } = useTranslation()
  const auth = useAuth()
  const token = auth.state.status === 'authenticated' ? auth.state.token : null
  const [notices, setNotices] = useState<readonly AdminNotice[]>([])

  useEffect(() => {
    if (token === null) {
      setNotices([])
      return
    }
    let live = true
    listNotices(token).then(
      (found) => {
        if (live) setNotices(found)
      },
      () => undefined,
    )
    return () => {
      live = false
    }
  }, [token])

  const dismiss = useCallback(
    (id: string) => {
      if (token === null) return
      // Removed from the screen first, then recorded. The recommendation is
      // recomputed on the server on every page load anyway, so the worst case
      // of a failed write is that it comes back next time — which is a great
      // deal better than a notice that refuses to go away while a request is
      // in flight.
      setNotices((current) => current.filter((notice) => notice.id !== id))
      void dismissNotice(token, id).catch(() => undefined)
    },
    [token],
  )

  if (notices.length === 0) return null

  return (
    <div className="mb-6 flex flex-col gap-3">
      {notices.map((notice) => (
        <Notice
          key={notice.id}
          tone={notice.severity}
          // Already on screen when the page rendered: part of the page, not a
          // change to it, so it is not announced as an update.
          live="off"
          title={t(`notices.${notice.code}.title`, {
            ...notice.params,
            defaultValue: notice.code,
          })}
          {...(notice.dismissible
            ? { onDismiss: () => dismiss(notice.id), dismissLabel: t('notices.dismiss') }
            : {})}
          {...(notice.action === undefined
            ? {}
            : {
                actions: (
                  <Link
                    to={notice.action.href}
                    className={buttonVariants({ variant: 'secondary', size: 'sm' })}
                  >
                    {t(`notices.${notice.action.code}`, { defaultValue: notice.action.code })}
                  </Link>
                ),
              })}
        >
          <p>{t(`notices.${notice.code}.body`, { ...notice.params, defaultValue: notice.code })}</p>
        </Notice>
      ))}
    </div>
  )
}
