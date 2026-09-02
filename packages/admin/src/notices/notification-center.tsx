import { type JSX, useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import {
  listNoticeHistory,
  markNoticesRead,
  type NoticeHistoryEntry,
  type NoticeSeverity,
} from '../api/notices-client.js'
import { useAuth } from '../auth/auth-context.js'
import { BellIcon, CloseIcon } from '../ui/icons.js'
import { buttonVariants } from '../ui/index.js'

/**
 * The notification centre — fiche 38 task 2's "on retrouve une notice
 * rejetée dans l'historique". A bell in the topbar, a badge with the unread
 * count, and a popover listing everything `NoticeHistoryStore` has ever
 * recorded for this account: resolved or not, dismissed from the board or
 * not, filterable by severity and by period, with a group "mark all read".
 *
 * Same polling cadence as `NoticeBoard` (once a minute) and the same
 * silent-on-failure rule — a notification centre that could not refresh is
 * not worth an error banner either.
 */

const POLL_INTERVAL_MS = 60_000

const SEVERITIES: readonly NoticeSeverity[] = ['info', 'success', 'warning', 'danger']

/** Fiche 35 audit T05 — the period filter the file's own docstring already claimed. `''` means "no lower bound", never "0 days". */
const PERIODS = ['7', '30', '90', ''] as const
type Period = (typeof PERIODS)[number]

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString()
}

/** The `since` boundary `listNoticeHistory` wants for a period option — `undefined` for "all", never an arbitrary epoch. */
function sinceFor(period: Period): string | undefined {
  if (period === '') return undefined
  const days = Number(period)
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
}

export function NotificationCenter(): JSX.Element | null {
  const { t } = useTranslation()
  const auth = useAuth()
  const token = auth.state.status === 'authenticated' ? auth.state.token : null

  const [entries, setEntries] = useState<readonly NoticeHistoryEntry[]>([])
  const [open, setOpen] = useState(false)
  const [severity, setSeverity] = useState<NoticeSeverity | ''>('')
  const [period, setPeriod] = useState<Period>('')
  const rootRef = useRef<HTMLDivElement>(null)

  const load = useCallback(() => {
    if (token === null) return
    const since = sinceFor(period)
    listNoticeHistory(token, {
      ...(severity === '' ? {} : { severity }),
      ...(since === undefined ? {} : { since }),
    }).then(
      (found) => setEntries(found),
      () => undefined,
    )
  }, [token, severity, period])

  useEffect(() => {
    if (token === null) {
      setEntries([])
      return
    }
    load()
    const timer = setInterval(load, POLL_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [token, load])

  useEffect(() => {
    function onPointerDown(event: MouseEvent): void {
      if (rootRef.current !== null && !rootRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [])

  if (token === null) return null

  const unreadCount = entries.filter((entry) => entry.readAt === null).length

  const markAllRead = async (): Promise<void> => {
    setEntries((current) =>
      current.map((entry) => ({ ...entry, readAt: new Date().toISOString() })),
    )
    await markNoticesRead(token, 'all').catch(() => undefined)
  }

  const markOneRead = async (id: string): Promise<void> => {
    setEntries((current) =>
      current.map((entry) =>
        entry.id === id ? { ...entry, readAt: new Date().toISOString() } : entry,
      ),
    )
    await markNoticesRead(token, [id]).catch(() => undefined)
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        className="relative inline-flex size-8 items-center justify-center rounded-md border border-transparent text-muted-foreground hover:bg-foreground/5 hover:text-foreground"
        aria-label={t('notifications.trigger', { count: unreadCount })}
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <BellIcon className="size-4" />
        {unreadCount > 0 && (
          <span
            aria-hidden="true"
            className="absolute top-0.5 right-0.5 inline-flex min-w-[1rem] items-center justify-center rounded-full bg-destructive px-1 font-sans text-[10px] font-semibold text-destructive-foreground"
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>
      {open && (
        <div
          role="dialog"
          aria-label={t('notifications.title')}
          className="absolute top-full right-0 z-50 mt-1 flex max-h-[28rem] w-96 flex-col overflow-hidden rounded-md border border-border bg-card shadow-overlay"
        >
          <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
            <span className="font-sans text-sm font-semibold text-card-foreground">
              {t('notifications.title')}
            </span>
            <div className="flex items-center gap-2">
              <label className="sr-only" htmlFor="notification-center-severity">
                {t('notifications.filterSeverity')}
              </label>
              <select
                id="notification-center-severity"
                value={severity}
                onChange={(event) => setSeverity(event.target.value as NoticeSeverity | '')}
                className="rounded-md border border-border bg-background px-1.5 py-1 font-sans text-xs text-foreground"
              >
                <option value="">{t('notifications.allSeverities')}</option>
                {SEVERITIES.map((s) => (
                  <option key={s} value={s}>
                    {t(`notifications.severity.${s}`)}
                  </option>
                ))}
              </select>
              <label className="sr-only" htmlFor="notification-center-period">
                {t('notifications.filterPeriod')}
              </label>
              <select
                id="notification-center-period"
                value={period}
                onChange={(event) => setPeriod(event.target.value as Period)}
                className="rounded-md border border-border bg-background px-1.5 py-1 font-sans text-xs text-foreground"
              >
                <option value="7">{t('notifications.period.7')}</option>
                <option value="30">{t('notifications.period.30')}</option>
                <option value="90">{t('notifications.period.90')}</option>
                <option value="">{t('notifications.period.all')}</option>
              </select>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label={t('notifications.close')}
                className="inline-flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-foreground/5 hover:text-foreground"
              >
                <CloseIcon className="size-3.5" />
              </button>
            </div>
          </div>
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={() => void markAllRead()}
              className="border-b border-border px-3 py-1.5 text-left font-sans text-xs font-medium text-accent-foreground hover:underline"
            >
              {t('notifications.markAllRead')}
            </button>
          )}
          <ul className="flex-1 overflow-y-auto">
            {entries.length === 0 && (
              <li className="px-3 py-6 text-center font-sans text-sm text-muted-foreground">
                {t('notifications.empty')}
              </li>
            )}
            {entries.map((entry) => (
              <li
                key={entry.id}
                className={`border-b border-border px-3 py-2 last:border-b-0 ${
                  entry.readAt === null ? 'bg-accent/10' : ''
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="m-0 font-sans text-sm font-medium text-card-foreground">
                    {t(`notices.${entry.code}.title`, {
                      ...entry.params,
                      defaultValue: entry.code,
                    })}
                  </p>
                  {entry.readAt === null && (
                    <button
                      type="button"
                      onClick={() => void markOneRead(entry.id)}
                      className="shrink-0 font-sans text-xs text-muted-foreground hover:text-foreground hover:underline"
                    >
                      {t('notifications.markRead')}
                    </button>
                  )}
                </div>
                <p className="m-0 font-sans text-xs text-muted-foreground">
                  {t(`notices.${entry.code}.body`, { ...entry.params, defaultValue: entry.code })}
                </p>
                <div className="mt-1 flex items-center gap-2 font-sans text-[11px] text-muted-foreground">
                  <span>{formatDate(entry.lastSeenAt)}</span>
                  <span>
                    {entry.resolvedAt !== null
                      ? t('notifications.status.resolved')
                      : t('notifications.status.active')}
                  </span>
                  {entry.action !== undefined && (
                    <Link
                      to={entry.action.href}
                      onClick={() => setOpen(false)}
                      className={buttonVariants({ variant: 'ghost', size: 'sm' })}
                    >
                      {t(`notices.${entry.action.code}`, { defaultValue: entry.action.code })}
                    </Link>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
