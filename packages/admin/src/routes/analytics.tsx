import { type FormEvent, type JSX, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import {
  type AnalyticsSummary,
  type AnalyticsWindow,
  getAnalyticsSummary,
} from '../api/analytics-client.js'
import { ApiError } from '../api/client.js'
import { useAuth } from '../auth/auth-context.js'
import { downloadCsv, toCsv } from '../lib/csv.js'
import { Button, Input, Label } from '../ui/index.js'

const WINDOW_OPTIONS = [7, 30, 90] as const
type WindowDays = (typeof WINDOW_OPTIONS)[number]

const CHART_WIDTH = 640
const CHART_HEIGHT = 160
const CHART_PADDING = 24

/**
 * The server only returns rows for days that actually had a view
 * (`packages/analytics/src/store.ts`'s `group by substr(at, 1, 10)`), so a
 * quiet period arrives as a sparse array — one entry for a whole 30-day
 * window is common on a small or brand-new site. Filling in every day of
 * `[since, until]` with zero views before it ever reaches the chart is what
 * makes `barWidth` divide the plot into one slot per real day instead of
 * stretching the one data point it was given across the whole width.
 */
function fillDailyViews(
  since: string,
  until: string,
  data: AnalyticsSummary['dailyViews'],
): AnalyticsSummary['dailyViews'] {
  const viewsByDay = new Map(data.map((point) => [point.day, point.views]))
  const start = new Date(`${since.slice(0, 10)}T00:00:00Z`)
  const end = new Date(`${until.slice(0, 10)}T00:00:00Z`)
  const days: { day: string; views: number }[] = []
  for (
    let cursor = start;
    cursor.getTime() <= end.getTime();
    cursor = new Date(cursor.getTime() + 86_400_000)
  ) {
    const day = cursor.toISOString().slice(0, 10)
    days.push({ day, views: viewsByDay.get(day) ?? 0 })
  }
  return days
}

/**
 * A hand-built SVG bar chart of daily page views — no charting library
 * (R9: zero new dependency for something this small). Bars rather than a
 * line because the data is a small, discrete number of days, and a bar's
 * height is legible without hovering for a tooltip this static export
 * cannot offer anyway.
 */
function DailyViewsChart({
  since,
  until,
  data: rawData,
}: {
  readonly since: string
  readonly until: string
  readonly data: AnalyticsSummary['dailyViews']
}): JSX.Element {
  const { t } = useTranslation()
  const data = fillDailyViews(since, until, rawData)
  if (data.length === 0) {
    return <p>{t('analytics.noData')}</p>
  }

  const max = Math.max(...data.map((point) => point.views), 1)
  const plotWidth = CHART_WIDTH - CHART_PADDING * 2
  const plotHeight = CHART_HEIGHT - CHART_PADDING * 2
  const barGap = 2
  const barWidth = Math.max(plotWidth / data.length - barGap, 1)

  return (
    <svg
      viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
      width="100%"
      height={CHART_HEIGHT}
      role="img"
      aria-label={t('analytics.chartLabel')}
    >
      <title>{t('analytics.chartLabel')}</title>
      <line
        x1={CHART_PADDING}
        y1={CHART_HEIGHT - CHART_PADDING}
        x2={CHART_WIDTH - CHART_PADDING}
        y2={CHART_HEIGHT - CHART_PADDING}
        stroke="currentColor"
        strokeOpacity={0.3}
      />
      {data.map((point, index) => {
        const barHeight = (point.views / max) * plotHeight
        const x = CHART_PADDING + index * (barWidth + barGap)
        const y = CHART_HEIGHT - CHART_PADDING - barHeight
        return (
          <rect
            key={point.day}
            x={x}
            y={y}
            width={barWidth}
            height={Math.max(barHeight, 1)}
            fill="currentColor"
          >
            <title>
              {point.day}: {point.views}
            </title>
          </rect>
        )
      })}
    </svg>
  )
}

/** `+12.3%`, `−4.0%`, or a worded fallback when there is nothing to compare against (fiche 27 task 1). */
function ChangeBadge({
  percent,
  previous,
}: {
  readonly percent: number | null
  readonly previous: number
}): JSX.Element {
  const { t } = useTranslation()
  if (percent === null) {
    return (
      <span className="text-muted-foreground text-sm">
        {previous === 0 ? t('analytics.changeNew') : t('analytics.changeNoComparison')}
      </span>
    )
  }
  const rounded = Math.round(percent * 10) / 10
  const sign = rounded > 0 ? '+' : ''
  return (
    <span
      className={
        rounded >= 0 ? 'text-sm font-medium text-success' : 'text-sm font-medium text-danger'
      }
    >
      {sign}
      {rounded}% {t('analytics.changeVsPrevious')}
    </span>
  )
}

/** Today's date, `YYYY-MM-DD`, for an `<input type="date">` max attribute — never a future range. */
function todayValue(): string {
  return new Date().toISOString().slice(0, 10)
}

function csvFromSummary(summary: AnalyticsSummary): string {
  const rows: string[][] = [
    ['Cogenta analytics', `${summary.since} — ${summary.until}`],
    [],
    ['Metric', 'Value'],
    ['Total views', String(summary.totalViews)],
    ['Unique visitors', String(summary.uniqueVisitors)],
    ['Previous period views', String(summary.previousTotalViews)],
    [],
    ['Page', 'Views'],
    ...summary.topPages.map((page) => [page.path, String(page.views)]),
    [],
    ['Referrer', 'Views'],
    ...summary.topReferrers.map((referrer) => [referrer.domain, String(referrer.views)]),
    [],
    ['Day', 'Views'],
    ...summary.dailyViews.map((point) => [point.day, String(point.views)]),
  ]
  return toCsv(rows)
}

/**
 * L10 analytics gap, expanded by fiche 27: pages, referrers, a period
 * comparison, a custom date range, CSV export, the site's retention setting,
 * and an explicit statement of what this system does not do (task 5).
 * `@cogenta/analytics`'s self-hosted, cookie-free page-view data, restricted
 * to `admin` — the server-side route already refuses anyone else with 403,
 * this only avoids issuing the request.
 */
export function AnalyticsRoute(): JSX.Element {
  const { t } = useTranslation()
  const auth = useAuth()
  const token = auth.state.status === 'authenticated' ? auth.state.token : null
  const roles = auth.state.status === 'authenticated' ? auth.state.user.roles : []
  const isAdmin = roles.includes('admin')

  const [days, setDays] = useState<WindowDays>(30)
  /** A confirmed custom range — `null` means "use `days` instead" (task 1). */
  const [customRange, setCustomRange] = useState<{ since: string; until: string } | null>(null)
  const [sinceInput, setSinceInput] = useState('')
  const [untilInput, setUntilInput] = useState('')
  const [rangeError, setRangeError] = useState<string | null>(null)

  const [summary, setSummary] = useState<AnalyticsSummary | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const window: AnalyticsWindow = customRange ?? { days }

  useEffect(() => {
    if (token === null || !isAdmin) return
    let cancelled = false
    setLoading(true)
    setError(null)
    getAnalyticsSummary(token, window)
      .then((result) => {
        if (!cancelled) setSummary(result)
      })
      .catch((caught) => {
        if (!cancelled) {
          setError(caught instanceof ApiError ? caught.message : t('analytics.loadError'))
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
    // `window` is derived from `days`/`customRange` each render; comparing its
    // two possible shapes here would need a deep-equality check for no real
    // benefit, so the two source values are the actual dependencies.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, isAdmin, days, customRange, t])

  function chooseWindow(option: WindowDays): void {
    setCustomRange(null)
    setDays(option)
  }

  function applyCustomRange(event: FormEvent): void {
    event.preventDefault()
    setRangeError(null)
    if (sinceInput === '' || untilInput === '') {
      setRangeError(t('analytics.rangeBothRequired'))
      return
    }
    if (sinceInput >= untilInput) {
      setRangeError(t('analytics.rangeOrderInvalid'))
      return
    }
    setCustomRange({
      since: new Date(sinceInput).toISOString(),
      until: new Date(untilInput).toISOString(),
    })
  }

  function exportCsv(): void {
    if (summary === null) return
    downloadCsv(
      `cogenta-analytics-${summary.since.slice(0, 10)}-${summary.until.slice(0, 10)}.csv`,
      csvFromSummary(summary),
    )
  }

  if (!isAdmin) {
    return (
      <section aria-labelledby="analytics-heading">
        <h1 id="analytics-heading">{t('analytics.heading')}</h1>
        <p role="alert">{t('analytics.adminOnly')}</p>
      </section>
    )
  }

  return (
    <section aria-labelledby="analytics-heading">
      <h1 id="analytics-heading">{t('analytics.heading')}</h1>
      <p>{t('analytics.privacyNote')}</p>

      {/* What this system does not do (task 5) — a guarantee, shown, not just true. */}
      <ul aria-label={t('analytics.limitsHeading')}>
        <li>{t('analytics.limitNoCrossSite')}</li>
        <li>{t('analytics.limitNoPersistentId')}</li>
        <li>{t('analytics.limitNoProfile')}</li>
        <li>{t('analytics.limitNoSharing')}</li>
      </ul>

      <fieldset>
        <legend>{t('analytics.windowLabel')}</legend>
        {WINDOW_OPTIONS.map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={customRange === null && days === option}
            onClick={() => chooseWindow(option)}
          >
            {option} {t('analytics.days')}
          </button>
        ))}
      </fieldset>

      <form onSubmit={applyCustomRange} aria-label={t('analytics.customRangeLabel')}>
        <Label htmlFor="analytics-since">{t('analytics.rangeSince')}</Label>
        <Input
          id="analytics-since"
          type="date"
          value={sinceInput}
          max={todayValue()}
          onChange={(event) => setSinceInput(event.target.value)}
        />
        <Label htmlFor="analytics-until">{t('analytics.rangeUntil')}</Label>
        <Input
          id="analytics-until"
          type="date"
          value={untilInput}
          max={todayValue()}
          onChange={(event) => setUntilInput(event.target.value)}
        />
        <Button type="submit" variant="secondary">
          {t('analytics.rangeApply')}
        </Button>
        {rangeError !== null && <p role="alert">{rangeError}</p>}
      </form>

      {error !== null && <p role="alert">{error}</p>}
      {loading && <p>{t('common.loading')}</p>}

      {!loading && error === null && summary !== null && (
        <>
          <section aria-labelledby="analytics-totals-heading">
            <h2 id="analytics-totals-heading">{t('analytics.totalsHeading')}</h2>
            <ul>
              <li>
                {t('analytics.totalViews')}: {summary.totalViews}{' '}
                <ChangeBadge
                  percent={summary.viewsChangePercent}
                  previous={summary.previousTotalViews}
                />
              </li>
              <li>
                {t('analytics.uniqueVisitors')}: {summary.uniqueVisitors}
              </li>
            </ul>
            <Button type="button" variant="secondary" onClick={exportCsv}>
              {t('analytics.exportCsv')}
            </Button>
            <p className="text-muted-foreground text-sm">
              {summary.retentionDays === null
                ? t('analytics.retentionUnknown')
                : t('analytics.retentionNote', { days: summary.retentionDays })}
            </p>
          </section>

          <section aria-labelledby="analytics-chart-heading">
            <h2 id="analytics-chart-heading">{t('analytics.chartHeading')}</h2>
            <DailyViewsChart
              since={summary.since}
              until={summary.until}
              data={summary.dailyViews}
            />
          </section>

          <section aria-labelledby="analytics-pages-heading">
            <h2 id="analytics-pages-heading">{t('analytics.pagesHeading')}</h2>
            {summary.topPages.length === 0 ? (
              <p>{t('analytics.noData')}</p>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th scope="col">{t('analytics.page')}</th>
                    <th scope="col">{t('analytics.views')}</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.topPages.map((page) => (
                    <tr key={page.path}>
                      <td>
                        {page.editHref !== undefined ? (
                          <Link to={page.editHref}>{page.title ?? page.path}</Link>
                        ) : (
                          page.path
                        )}
                        {page.title !== undefined && (
                          <span className="text-muted-foreground text-xs"> ({page.path})</span>
                        )}
                      </td>
                      <td>{page.views}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          <section aria-labelledby="analytics-referrers-heading">
            <h2 id="analytics-referrers-heading">{t('analytics.referrersHeading')}</h2>
            {summary.topReferrers.length === 0 ? (
              <p>{t('analytics.noReferrers')}</p>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th scope="col">{t('analytics.referrer')}</th>
                    <th scope="col">{t('analytics.views')}</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.topReferrers.map((referrer) => (
                    <tr key={referrer.domain}>
                      <td>{referrer.domain}</td>
                      <td>{referrer.views}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          <section aria-labelledby="analytics-devices-heading">
            <h2 id="analytics-devices-heading">{t('analytics.devicesHeading')}</h2>
            <ul>
              {summary.deviceBreakdown.map((device) => (
                <li key={device.device}>
                  {t(`analytics.device.${device.device}`)}: {device.views}
                </li>
              ))}
              {summary.deviceBreakdown.length === 0 && <li>{t('analytics.noData')}</li>}
            </ul>
          </section>
        </>
      )}
    </section>
  )
}
