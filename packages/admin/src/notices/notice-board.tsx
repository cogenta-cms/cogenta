import { type JSX, useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import {
  type AdminNotice,
  dismissNotice,
  listNotices,
  restoreNotice,
} from '../api/notices-client.js'
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

/** How long "Undo" stays on screen after a recommendation is hidden. */
const UNDO_WINDOW_MS = 8_000

/**
 * Where on the profile screen each notice's action actually leads: the
 * server only knows the screen (`/profile`), and a link that opens it at the
 * top leaves the person hunting for the section the notice was about.
 */
const ACTION_ANCHORS: Readonly<Record<string, string>> = {
  'security.mfa-recommended': 'security',
  'security.recovery-code-used': 'recovery-codes',
}

/** A notice action's target, with the profile section it concerns appended. */
export function noticeActionHref(code: string, href: string): string {
  const anchor = ACTION_ANCHORS[code]
  return anchor === undefined || href.includes('#') ? href : `${href}#${anchor}`
}

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
  // The notice just hidden, kept for a few seconds so "Undo" can bring it back.
  const [justHidden, setJustHidden] = useState<AdminNotice | null>(null)

  const fetchNotices = useCallback(
    (isLive: () => boolean = () => true): void => {
      if (token === null) return
      listNotices(token).then(
        (found) => {
          if (isLive()) setNotices(found)
        },
        () => undefined,
      )
    },
    [token],
  )

  useEffect(() => {
    if (token === null) {
      setNotices([])
      return
    }
    let live = true
    fetchNotices(() => live)
    const timer = setInterval(() => fetchNotices(() => live), POLL_INTERVAL_MS)
    return () => {
      live = false
      clearInterval(timer)
    }
  }, [token, fetchNotices])

  // The undo offer lapses on its own: a hidden recommendation stays reachable
  // in the notification centre, this is only the moment to change your mind.
  useEffect(() => {
    if (justHidden === null) return
    const timer = setTimeout(() => setJustHidden(null), UNDO_WINDOW_MS)
    return () => clearTimeout(timer)
  }, [justHidden])

  const dismiss = useCallback(
    (id: string) => {
      if (token === null) return
      // Removed from the screen first, then recorded. The recommendation is
      // recomputed on the server on every page load anyway, so the worst case
      // of a failed write is that it comes back next time — which is a great
      // deal better than a notice that refuses to go away while a request is
      // in flight.
      const hidden = notices.find((notice) => notice.id === id)
      if (hidden !== undefined) setJustHidden(hidden)
      setNotices((current) => current.filter((notice) => notice.id !== id))
      void dismissNotice(token, id).catch(() => undefined)
    },
    [token, notices],
  )

  const undo = useCallback(() => {
    if (token === null || justHidden === null) return
    const restored = justHidden
    setJustHidden(null)
    setNotices((current) =>
      current.some((n) => n.id === restored.id) ? current : [restored, ...current],
    )
    void restoreNotice(token, restored.id).then(
      () => fetchNotices(),
      () => fetchNotices(),
    )
  }, [token, justHidden, fetchNotices])

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

  if (notices.length === 0 && justHidden === null) return null

  return (
    <div className="mb-5 flex flex-col gap-2">
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
                    to={noticeActionHref(notice.code, notice.action.href)}
                    className={buttonVariants({ variant: 'secondary', size: 'sm' })}
                  >
                    {t(`notices.${notice.action.code}`, { defaultValue: notice.action.code })}
                  </Link>
                ),
              })}
        >
          {notice.severity === 'danger' ? (
            <p>
              {t(`notices.${notice.code}.body`, { ...notice.params, defaultValue: notice.code })}
            </p>
          ) : (
            <details>
              <summary className="cursor-pointer text-sm text-muted-foreground underline-offset-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
                {t('notices.details')}
              </summary>
              <p className="mt-2 mb-0">
                {t(`notices.${notice.code}.body`, {
                  ...notice.params,
                  defaultValue: notice.code,
                })}
              </p>
            </details>
          )}
        </Notice>
      ))}
      {justHidden !== null && (
        <div
          role="status"
          className="flex items-center gap-3 rounded-md border border-border bg-card px-3 py-2 text-sm text-muted-foreground"
        >
          <span>{t('notices.hidden')}</span>
          <button
            type="button"
            onClick={undo}
            className="cursor-pointer border-0 bg-transparent p-0 text-sm font-medium text-primary underline-offset-2 hover:underline"
          >
            {t('notices.undo')}
          </button>
        </div>
      )}
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
