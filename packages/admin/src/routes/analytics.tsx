import { type FormEvent, type JSX, useEffect, useId, useState } from 'react'
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
import { CheckIcon, ClockIcon, DownloadIcon, MediaIcon, TrendIcon, UsersIcon } from '../ui/icons.js'
import { Button, Card, CardBody, CardHeader, CardTitle, Input, Label } from '../ui/index.js'

const WINDOW_OPTIONS = [7, 30, 90] as const
type WindowDays = (typeof WINDOW_OPTIONS)[number]

const CHART_WIDTH = 640
const CHART_HEIGHT = 200
const CHART_PADDING_X = 8
const CHART_PADDING_TOP = 12
const CHART_PADDING_BOTTOM = 28

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
 *
 * Redesigned for fiche 22 tâche 8, part 1: a gradient fill, a dashed
 * baseline/midline grid and axis labels for the max and zero — the data
 * this draws was already right (period-over-period, zero-filled days), the
 * only thing missing was making it look like it belongs next to the rest of
 * the Nightops/Atelier admin instead of a bare debug rectangle. The bar
 * count a test asserts against (one `<rect>` per calendar day) is
 * unchanged: the grid lines below are `<line>`s, never `<rect>`s.
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
  const gradientId = useId()
  const data = fillDailyViews(since, until, rawData)
  if (data.length === 0) {
    return <p className="text-muted-foreground text-sm">{t('analytics.noData')}</p>
  }

  const max = Math.max(...data.map((point) => point.views), 1)
  const plotWidth = CHART_WIDTH - CHART_PADDING_X * 2
  const plotTop = CHART_PADDING_TOP
  const plotBottom = CHART_HEIGHT - CHART_PADDING_BOTTOM
  const plotHeight = plotBottom - plotTop
  const barGap = 3
  const barWidth = Math.max(plotWidth / data.length - barGap, 1)
  const showEveryLabel = data.length <= 10

  return (
    <svg
      viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
      width="100%"
      height={CHART_HEIGHT}
      role="img"
      aria-label={t('analytics.chartLabel')}
      className="text-primary"
    >
      <title>{t('analytics.chartLabel')}</title>
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity={0.95} />
          <stop offset="100%" stopColor="currentColor" stopOpacity={0.55} />
        </linearGradient>
      </defs>

      {/* Baseline and a midline, dashed — a reading aid, never a bar. */}
      <line
        x1={CHART_PADDING_X}
        y1={plotBottom}
        x2={CHART_WIDTH - CHART_PADDING_X}
        y2={plotBottom}
        stroke="currentColor"
        strokeOpacity={0.25}
      />
      <line
        x1={CHART_PADDING_X}
        y1={plotTop + plotHeight / 2}
        x2={CHART_WIDTH - CHART_PADDING_X}
        y2={plotTop + plotHeight / 2}
        stroke="currentColor"
        strokeOpacity={0.12}
        strokeDasharray="3 3"
      />
      <text x={CHART_PADDING_X} y={plotTop - 2} fontSize={9} fill="currentColor" opacity={0.6}>
        {max}
      </text>
      <text x={CHART_PADDING_X} y={plotBottom + 11} fontSize={9} fill="currentColor" opacity={0.6}>
        0
      </text>

      {data.map((point, index) => {
        const barHeight = (point.views / max) * plotHeight
        const x = CHART_PADDING_X + index * (barWidth + barGap)
        const y = plotBottom - barHeight
        const showLabel = showEveryLabel || index === 0 || index === data.length - 1
        return (
          <g key={point.day} className="transition-opacity hover:opacity-80">
            <rect
              x={x}
              y={y}
              width={barWidth}
              height={Math.max(barHeight, 1.5)}
              rx={Math.min(barWidth / 2, 2)}
              fill={`url(#${gradientId})`}
            >
              <title>
                {point.day}: {point.views}
              </title>
            </rect>
            {showLabel && (
              <text
                x={x + barWidth / 2}
                y={CHART_HEIGHT - 8}
                fontSize={8}
                textAnchor="middle"
                fill="currentColor"
                opacity={0.55}
              >
                {point.day.slice(5)}
              </text>
            )}
          </g>
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
    <section aria-labelledby="analytics-heading" className="flex flex-col gap-8">
      <div className="reveal border-b-2 border-foreground pb-4">
        <p className="m-0 font-mono text-xs font-medium tracking-[0.2em] text-primary uppercase">
          {t('shell.brand')}
        </p>
        <h1 id="analytics-heading" className="m-0 text-3xl leading-tight font-bold">
          {t('analytics.heading')}
        </h1>
        <p className="mt-2 mb-0 max-w-2xl text-sm text-muted-foreground">
          {t('analytics.privacyNote')}
        </p>
      </div>

      {/* What this system does not do (task 5) — a guarantee, shown, not just true. */}
      <ul
        aria-label={t('analytics.limitsHeading')}
        className="reveal m-0 grid list-none grid-cols-1 gap-2 rounded-lg border border-dashed border-border bg-card p-4 text-xs text-muted-foreground sm:grid-cols-2 lg:grid-cols-4"
      >
        <li className="flex items-start gap-1.5">
          <CheckIcon className="mt-0.5 size-3 shrink-0 text-success" />
          {t('analytics.limitNoCrossSite')}
        </li>
        <li className="flex items-start gap-1.5">
          <CheckIcon className="mt-0.5 size-3 shrink-0 text-success" />
          {t('analytics.limitNoPersistentId')}
        </li>
        <li className="flex items-start gap-1.5">
          <CheckIcon className="mt-0.5 size-3 shrink-0 text-success" />
          {t('analytics.limitNoProfile')}
        </li>
        <li className="flex items-start gap-1.5">
          <CheckIcon className="mt-0.5 size-3 shrink-0 text-success" />
          {t('analytics.limitNoSharing')}
        </li>
      </ul>

      <div className="reveal flex flex-wrap items-end justify-between gap-4 rounded-lg border border-border bg-card p-4">
        <fieldset className="m-0 flex flex-wrap items-center gap-2 border-0 p-0">
          <legend className="mb-1 w-full text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            {t('analytics.windowLabel')}
          </legend>
          {WINDOW_OPTIONS.map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={customRange === null && days === option}
              onClick={() => chooseWindow(option)}
              className={
                customRange === null && days === option
                  ? 'rounded-sm border border-foreground bg-foreground px-3 py-1.5 text-sm font-medium text-background'
                  : 'rounded-sm border border-border px-3 py-1.5 text-sm hover:bg-muted'
              }
            >
              {option} {t('analytics.days')}
            </button>
          ))}
        </fieldset>

        <form
          onSubmit={applyCustomRange}
          aria-label={t('analytics.customRangeLabel')}
          className="flex flex-wrap items-end gap-2"
        >
          <div className="flex flex-col gap-1">
            <Label htmlFor="analytics-since">{t('analytics.rangeSince')}</Label>
            <Input
              id="analytics-since"
              type="date"
              value={sinceInput}
              max={todayValue()}
              onChange={(event) => setSinceInput(event.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="analytics-until">{t('analytics.rangeUntil')}</Label>
            <Input
              id="analytics-until"
              type="date"
              value={untilInput}
              max={todayValue()}
              onChange={(event) => setUntilInput(event.target.value)}
            />
          </div>
          <Button type="submit" variant="secondary">
            {t('analytics.rangeApply')}
          </Button>
        </form>
      </div>
      {rangeError !== null && (
        <p role="alert" className="m-0 text-sm font-medium text-destructive">
          {rangeError}
        </p>
      )}

      {error !== null && (
        <p role="alert" className="m-0 text-sm font-medium text-destructive">
          {error}
        </p>
      )}
      {loading && <p className="text-sm text-muted-foreground">{t('common.loading')}</p>}

      {!loading && error === null && summary !== null && (
        <>
          <Card aria-labelledby="analytics-totals-heading" className="reveal">
            <CardHeader className="flex-row items-center justify-between gap-2">
              <CardTitle>
                <h2 id="analytics-totals-heading">{t('analytics.totalsHeading')}</h2>
              </CardTitle>
              <Button type="button" variant="secondary" size="sm" onClick={exportCsv}>
                <DownloadIcon className="size-3.5" />
                {t('analytics.exportCsv')}
              </Button>
            </CardHeader>
            <CardBody>
              <ul className="m-0 grid list-none grid-cols-1 gap-4 p-0 sm:grid-cols-2">
                <li className="flex flex-col gap-1 rounded-md border border-border bg-background p-4">
                  <span className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                    <TrendIcon className="size-3.5" />
                    {t('analytics.totalViews')}
                  </span>
                  <span className="font-mono text-3xl leading-none font-bold text-foreground">
                    {summary.totalViews}
                  </span>
                  <ChangeBadge
                    percent={summary.viewsChangePercent}
                    previous={summary.previousTotalViews}
                  />
                </li>
                <li className="flex flex-col gap-1 rounded-md border border-border bg-background p-4">
                  <span className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                    <UsersIcon className="size-3.5" />
                    {t('analytics.uniqueVisitors')}
                  </span>
                  <span className="font-mono text-3xl leading-none font-bold text-foreground">
                    {summary.uniqueVisitors}
                  </span>
                </li>
              </ul>
              <p className="m-0 mt-4 flex items-center gap-1.5 text-xs text-muted-foreground">
                <ClockIcon className="size-3.5 shrink-0" />
                {summary.retentionDays === null
                  ? t('analytics.retentionUnknown')
                  : t('analytics.retentionNote', { days: summary.retentionDays })}
              </p>
            </CardBody>
          </Card>

          <Card aria-labelledby="analytics-chart-heading" className="reveal">
            <CardHeader>
              <CardTitle>
                <h2 id="analytics-chart-heading">{t('analytics.chartHeading')}</h2>
              </CardTitle>
            </CardHeader>
            <CardBody>
              <DailyViewsChart
                since={summary.since}
                until={summary.until}
                data={summary.dailyViews}
              />
            </CardBody>
          </Card>

          <Card aria-labelledby="analytics-pages-heading" className="reveal">
            <CardHeader>
              <CardTitle>
                <h2 id="analytics-pages-heading">{t('analytics.pagesHeading')}</h2>
              </CardTitle>
            </CardHeader>
            <CardBody>
              {summary.topPages.length === 0 ? (
                <p className="m-0 text-sm text-muted-foreground">{t('analytics.noData')}</p>
              ) : (
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr>
                      <th scope="col">{t('analytics.page')}</th>
                      <th scope="col" className="text-right">
                        {t('analytics.views')}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.topPages.map((page) => (
                      <tr key={page.path}>
                        <td>
                          {page.editHref !== undefined ? (
                            <Link
                              to={page.editHref}
                              className="text-primary underline-offset-2 hover:underline"
                            >
                              {page.title ?? page.path}
                            </Link>
                          ) : (
                            page.path
                          )}
                          {page.title !== undefined && (
                            <span className="text-muted-foreground text-xs"> ({page.path})</span>
                          )}
                        </td>
                        <td className="text-right font-mono">{page.views}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardBody>
          </Card>

          <Card aria-labelledby="analytics-referrers-heading" className="reveal">
            <CardHeader>
              <CardTitle>
                <h2 id="analytics-referrers-heading">{t('analytics.referrersHeading')}</h2>
              </CardTitle>
            </CardHeader>
            <CardBody>
              {summary.topReferrers.length === 0 ? (
                <p className="m-0 text-sm text-muted-foreground">{t('analytics.noReferrers')}</p>
              ) : (
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr>
                      <th scope="col">{t('analytics.referrer')}</th>
                      <th scope="col" className="text-right">
                        {t('analytics.views')}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.topReferrers.map((referrer) => (
                      <tr key={referrer.domain}>
                        <td>{referrer.domain}</td>
                        <td className="text-right font-mono">{referrer.views}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardBody>
          </Card>

          <Card aria-labelledby="analytics-devices-heading" className="reveal">
            <CardHeader>
              <CardTitle>
                <h2 id="analytics-devices-heading">{t('analytics.devicesHeading')}</h2>
              </CardTitle>
            </CardHeader>
            <CardBody>
              <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
                {summary.deviceBreakdown.map((device) => (
                  <li
                    key={device.device}
                    className="flex items-center gap-1.5 rounded-sm border border-border bg-background px-2.5 py-1.5 text-sm"
                  >
                    <MediaIcon className="size-3.5 text-muted-foreground" />
                    {t(`analytics.device.${device.device}`)}
                    <span className="font-mono text-muted-foreground">{device.views}</span>
                  </li>
                ))}
                {summary.deviceBreakdown.length === 0 && (
                  <li className="text-sm text-muted-foreground">{t('analytics.noData')}</li>
                )}
              </ul>
            </CardBody>
          </Card>
        </>
      )}
    </section>
  )
}
