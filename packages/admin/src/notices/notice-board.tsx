import { type JSX, useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { type AdminNotice, dismissNotice, listNotices } from '../api/notices-client.js'
import { useAuth } from '../auth/auth-context.js'
import { buttonVariants, Notice } from '../ui/index.js'

/**
 * How often the board re-polls `/api/notices` while a screen stays open —
 * fiche 38 task 6. A plain interval, not SSE or a WebSocket: a persistent
 * connection per open tab is an infrastructure cost (R1) for a gain a
 * once-a-minute refresh already gets for free.
 */
const POLL_INTERVAL_MS = 60_000

/**
 * Beyond this many non-critical notices, the rest collapse behind "see N
 * more" (fiche 38 task 5) — a screen with a dozen banners trains people to
 * stop reading any of them. A `danger` notice never collapses: it stays more
 * visible, never more authoritative (ADR-0021 — it does not block anything),
 * so it is excluded from the count that triggers collapsing.
 */
const VISIBLE_WITHOUT_EXPANDING = 3

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
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    if (token === null) {
      setNotices([])
      return
    }
    let live = true
    const fetchNotices = (): void => {
      listNotices(token).then(
        (found) => {
          if (live) setNotices(found)
        },
        () => undefined,
      )
    }
    fetchNotices()
    const timer = setInterval(fetchNotices, POLL_INTERVAL_MS)
    return () => {
      live = false
      clearInterval(timer)
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

  // Critical (`danger`) notices are always shown in full; everything else
  // collapses past `VISIBLE_WITHOUT_EXPANDING` until the person asks for
  // more. Never the other way round: collapsing is about noise, not about
  // hiding the notices that matter most.
  const { visible, hiddenCount } = useMemo(() => {
    const critical = notices.filter((notice) => notice.severity === 'danger')
    const rest = notices.filter((notice) => notice.severity !== 'danger')
    if (expanded || rest.length <= VISIBLE_WITHOUT_EXPANDING) {
      return { visible: notices, hiddenCount: 0 }
    }
    const shown = rest.slice(0, VISIBLE_WITHOUT_EXPANDING)
    return {
      visible: [...critical, ...shown],
      hiddenCount: rest.length - shown.length,
    }
  }, [notices, expanded])

  if (notices.length === 0) return null

  return (
    <div className="mb-6 flex flex-col gap-3">
      {visible.map((notice) => (
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
      {hiddenCount > 0 && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="self-start text-sm font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
        >
          {t('notices.see-more', { count: hiddenCount })}
        </button>
      )}
    </div>
  )
}
