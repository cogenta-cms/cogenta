import { type JSX, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { type AnalyticsSummary, getAnalyticsSummary } from '../api/analytics-client.js'
import { ApiError } from '../api/client.js'
import { useAuth } from '../auth/auth-context.js'

const WINDOW_OPTIONS = [7, 30, 90] as const
type WindowDays = (typeof WINDOW_OPTIONS)[number]

const CHART_WIDTH = 640
const CHART_HEIGHT = 160
const CHART_PADDING = 24

/**
 * A hand-built SVG bar chart of daily page views — no charting library
 * (R9: zero new dependency for something this small). Bars rather than a
 * line because the data is a small, discrete number of days, and a bar's
 * height is legible without hovering for a tooltip this static export
 * cannot offer anyway.
 */
function DailyViewsChart({ data }: { readonly data: AnalyticsSummary['dailyViews'] }): JSX.Element {
  const { t } = useTranslation()
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

/**
 * L10 analytics gap. `@cogenta/analytics`'s self-hosted, cookie-free
 * page-view data, restricted to `admin` — the server-side route already
 * refuses anyone else with 403, this only avoids issuing the request.
 */
export function AnalyticsRoute(): JSX.Element {
  const { t } = useTranslation()
  const auth = useAuth()
  const token = auth.state.status === 'authenticated' ? auth.state.token : null
  const roles = auth.state.status === 'authenticated' ? auth.state.user.roles : []
  const isAdmin = roles.includes('admin')

  const [days, setDays] = useState<WindowDays>(30)
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (token === null || !isAdmin) return
    let cancelled = false
    setLoading(true)
    setError(null)
    getAnalyticsSummary(token, days)
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
  }, [token, isAdmin, days, t])

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

      <fieldset>
        <legend>{t('analytics.windowLabel')}</legend>
        {WINDOW_OPTIONS.map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={days === option}
            onClick={() => setDays(option)}
          >
            {option} {t('analytics.days')}
          </button>
        ))}
      </fieldset>

      {error !== null && <p role="alert">{error}</p>}
      {loading && <p>{t('common.loading')}</p>}

      {!loading && error === null && summary !== null && (
        <>
          <section aria-labelledby="analytics-totals-heading">
            <h2 id="analytics-totals-heading">{t('analytics.totalsHeading')}</h2>
            <ul>
              <li>
                {t('analytics.totalViews')}: {summary.totalViews}
              </li>
              <li>
                {t('analytics.uniqueVisitors')}: {summary.uniqueVisitors}
              </li>
            </ul>
          </section>

          <section aria-labelledby="analytics-chart-heading">
            <h2 id="analytics-chart-heading">{t('analytics.chartHeading')}</h2>
            <DailyViewsChart data={summary.dailyViews} />
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
                      <td>{page.path}</td>
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
