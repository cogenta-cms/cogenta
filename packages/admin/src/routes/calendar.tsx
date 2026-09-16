import { type DragEvent, type JSX, useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import {
  type CalendarItem,
  type CalendarReport,
  getCalendar,
  unpublishEntry,
} from '../api/content-client.js'
import { describeApiError } from '../api/describe-error.js'
import { useAuth } from '../auth/auth-context.js'
import {
  dayKey,
  fromLocalInputValue,
  gridWindow,
  monthGrid,
  moveToDay,
  startOfDay,
  toLocalInputValue,
  weekStartFor,
} from '../calendar/calendar-dates.js'
import { useSchema } from '../schema/schema-context.js'
import {
  Badge,
  Button,
  Card,
  CardBody,
  Field,
  Input,
  Modal,
  Notice,
  PageHeader,
} from '../ui/index.js'

/**
 * « Calendrier éditorial » (L35) — what comes out when, across every
 * collection that can be scheduled.
 *
 * Moving a publication is the gesture this screen exists for, and it follows
 * the page builder's rule (L16): **nothing here is reachable only by
 * dragging**. Dropping an entry on a day and choosing a date in its dialog
 * call the same function, which calls the same route the entry editor uses to
 * schedule — there is no second way to set a date.
 *
 * Published entries are shown and never moved: changing the date of a page
 * that is already out is backdating it, not planning it.
 */

/** The drag payload's type, so a drop from anywhere else on the page is ignored. */
const DRAG_TYPE = 'application/x-cogenta-calendar-entry'

function itemKey(item: CalendarItem): string {
  return `${item.collection}/${item.entryId}`
}

function isMovable(item: CalendarItem): boolean {
  return item.canSchedule && item.status !== 'published'
}

export function CalendarRoute(): JSX.Element {
  const { t, i18n } = useTranslation()
  const auth = useAuth()
  const token = auth.state.status === 'authenticated' ? auth.state.token : null
  const schemaState = useSchema()

  const [month, setMonth] = useState(() => {
    const today = new Date()
    return { year: today.getFullYear(), month: today.getMonth() }
  })
  const [report, setReport] = useState<CalendarReport | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [selected, setSelected] = useState<CalendarItem | null>(null)
  const [dateValue, setDateValue] = useState('')
  const [busy, setBusy] = useState(false)
  const [dropTarget, setDropTarget] = useState<string | null>(null)

  const weekStart = weekStartFor(i18n.language)
  const days = useMemo(
    () => monthGrid(month.year, month.month, weekStart),
    [month.year, month.month, weekStart],
  )

  const load = useCallback(async (): Promise<void> => {
    if (token === null) return
    try {
      setReport(await getCalendar(token, gridWindow(days)))
      setError(null)
    } catch (caught) {
      setError(describeApiError(caught, t('calendar.loadFailed')).message)
    }
  }, [token, days, t])

  useEffect(() => {
    void load()
  }, [load])

  const labelOf = useCallback(
    (collection: string): string => {
      if (schemaState.status !== 'ready') return collection
      return (
        schemaState.schema.collections.find((candidate) => candidate.name === collection)?.labels
          .singular ?? collection
      )
    },
    [schemaState],
  )

  const byDay = useMemo(() => {
    const grouped = new Map<string, CalendarItem[]>()
    for (const item of report?.items ?? []) {
      if (item.publishedAt === null) continue
      const key = dayKey(new Date(item.publishedAt))
      grouped.set(key, [...(grouped.get(key) ?? []), item])
    }
    return grouped
  }, [report])

  const monthTitle = new Intl.DateTimeFormat(i18n.language, {
    month: 'long',
    year: 'numeric',
  }).format(new Date(month.year, month.month, 1))
  const weekdayFormat = new Intl.DateTimeFormat(i18n.language, { weekday: 'short' })
  const dayLabelFormat = new Intl.DateTimeFormat(i18n.language, { dateStyle: 'full' })
  const timeFormat = new Intl.DateTimeFormat(i18n.language, { timeStyle: 'short' })
  const dateTimeFormat = new Intl.DateTimeFormat(i18n.language, {
    dateStyle: 'full',
    timeStyle: 'short',
  })

  const shiftMonth = (delta: number): void => {
    setMonth((current) => {
      const next = new Date(current.year, current.month + delta, 1)
      return { year: next.getFullYear(), month: next.getMonth() }
    })
  }

  /** The one write this screen makes, whether the date came from a drop or from the dialog. */
  const schedule = async (item: CalendarItem, at: Date): Promise<boolean> => {
    if (token === null) return false
    if (at.getTime() <= Date.now()) {
      setError(t('calendar.inThePast'))
      return false
    }
    setBusy(true)
    setError(null)
    try {
      await unpublishEntry(token, item.collection, item.entryId, 'scheduled', at.toISOString())
      setNotice(
        t('calendar.scheduled', {
          title: item.title === '' ? t('calendar.untitled') : item.title,
          date: dateTimeFormat.format(at),
        }),
      )
      await load()
      return true
    } catch (caught) {
      setError(describeApiError(caught, t('calendar.scheduleFailed')).message)
      return false
    } finally {
      setBusy(false)
    }
  }

  const open = (item: CalendarItem): void => {
    const base =
      item.publishedAt === null
        ? moveToDay(null, new Date(Date.now() + 86_400_000), new Date())
        : new Date(item.publishedAt)
    setDateValue(base === null ? '' : toLocalInputValue(base))
    setSelected(item)
  }

  const findItem = (key: string): CalendarItem | undefined =>
    [...(report?.items ?? []), ...(report?.unscheduled ?? [])].find((item) => itemKey(item) === key)

  const onDrop = (event: DragEvent<HTMLElement>, day: Date): void => {
    event.preventDefault()
    setDropTarget(null)
    const item = findItem(event.dataTransfer.getData(DRAG_TYPE))
    if (item === undefined || !isMovable(item)) return
    const at = moveToDay(item.publishedAt, day, new Date())
    if (at === null) {
      setError(t('calendar.inThePast'))
      return
    }
    void schedule(item, at)
  }

  const chip = (item: CalendarItem, withTime: boolean): JSX.Element => {
    const movable = isMovable(item)
    const title = item.title === '' ? t('calendar.untitled') : item.title
    return (
      <button
        type="button"
        draggable={movable}
        onDragStart={(event) => {
          event.dataTransfer.setData(DRAG_TYPE, itemKey(item))
          event.dataTransfer.effectAllowed = 'move'
        }}
        onClick={() => open(item)}
        // A day cell is narrow; the full title stays one hover away.
        title={title}
        data-status={item.status}
        className={[
          'flex w-full min-w-0 flex-col gap-0.5 border-0 border-l-[3px] border-solid bg-card px-2 py-1 text-left text-xs',
          'hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring',
          item.status === 'published' ? 'border-success' : 'border-primary',
          movable ? 'cursor-grab' : 'cursor-pointer',
        ].join(' ')}
      >
        <span className="truncate font-medium">{title}</span>
        <span className="truncate text-muted-foreground">
          {withTime && item.publishedAt !== null
            ? `${timeFormat.format(new Date(item.publishedAt))} · `
            : ''}
          {labelOf(item.collection)}
        </span>
      </button>
    )
  }

  const today = startOfDay(new Date()).getTime()
  const selectedDate = fromLocalInputValue(dateValue)

  return (
    <section aria-labelledby="calendar-heading" className="flex flex-col gap-6">
      <PageHeader
        id="calendar-heading"
        title={t('calendar.heading')}
        description={t('calendar.description')}
      />

      {error !== null && (
        <Notice tone="danger" live="polite">
          <p>{error}</p>
        </Notice>
      )}
      {notice !== null && (
        <Notice tone="success" live="polite">
          <p>{notice}</p>
        </Notice>
      )}
      {report?.truncated === true && (
        <Notice tone="warning" live="off">
          <p>{t('calendar.truncated')}</p>
        </Notice>
      )}

      <div className="flex flex-col gap-6 xl:flex-row xl:items-start">
        <Card className="min-w-0 flex-1">
          <CardBody className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="m-0 text-lg font-semibold first-letter:uppercase" aria-live="polite">
                {monthTitle}
              </h2>
              <div className="flex flex-wrap items-center gap-2">
                <Button type="button" variant="secondary" onClick={() => shiftMonth(-1)}>
                  {t('calendar.previous')}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    const now = new Date()
                    setMonth({ year: now.getFullYear(), month: now.getMonth() })
                  }}
                >
                  {t('calendar.today')}
                </Button>
                <Button type="button" variant="secondary" onClick={() => shiftMonth(1)}>
                  {t('calendar.next')}
                </Button>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Badge tone="primary">{t('calendar.legendScheduled')}</Badge>
              <Badge tone="success">{t('calendar.legendPublished')}</Badge>
            </div>

            <div className="overflow-x-auto">
              <div className="grid min-w-[44rem] grid-cols-7 gap-px border border-border bg-border">
                {days.slice(0, 7).map((day) => (
                  <div
                    key={`weekday-${day.getDay()}`}
                    aria-hidden="true"
                    className="bg-muted px-2 py-1 text-xs font-medium text-muted-foreground first-letter:uppercase"
                  >
                    {weekdayFormat.format(day)}
                  </div>
                ))}
                {days.map((day) => {
                  const key = dayKey(day)
                  const items = byDay.get(key) ?? []
                  const past = day.getTime() < today
                  const inMonth = day.getMonth() === month.month
                  return (
                    <section
                      key={key}
                      aria-label={dayLabelFormat.format(day)}
                      data-day={key}
                      onDragOver={(event) => {
                        if (past || !event.dataTransfer.types.includes(DRAG_TYPE)) return
                        event.preventDefault()
                        setDropTarget(key)
                      }}
                      onDragLeave={() =>
                        setDropTarget((current) => (current === key ? null : current))
                      }
                      onDrop={(event) => {
                        if (!past) onDrop(event, day)
                      }}
                      className={[
                        'flex min-h-28 flex-col gap-1 p-1.5',
                        inMonth ? 'bg-background' : 'bg-muted/40',
                        dropTarget === key
                          ? 'outline outline-2 -outline-offset-2 outline-primary'
                          : '',
                      ].join(' ')}
                    >
                      <span
                        className={[
                          'self-end px-1 text-xs tabular-nums',
                          day.getTime() === today
                            ? 'bg-primary font-semibold text-primary-foreground'
                            : inMonth
                              ? 'text-foreground'
                              : 'text-muted-foreground',
                        ].join(' ')}
                      >
                        {day.getDate()}
                      </span>
                      <ul className="m-0 flex list-none flex-col gap-1 p-0">
                        {items.map((item) => (
                          <li key={itemKey(item)}>{chip(item, true)}</li>
                        ))}
                      </ul>
                    </section>
                  )
                })}
              </div>
            </div>
          </CardBody>
        </Card>

        <Card className="xl:w-72 xl:shrink-0">
          <CardBody className="flex flex-col gap-3">
            <h2 className="m-0 text-base font-semibold">{t('calendar.unscheduledHeading')}</h2>
            <p className="m-0 text-xs text-muted-foreground">{t('calendar.unscheduledHelp')}</p>
            {report !== null && report.unscheduled.length === 0 ? (
              <p className="m-0 text-sm text-muted-foreground">{t('calendar.noDrafts')}</p>
            ) : (
              <ul className="m-0 flex list-none flex-col gap-1 p-0">
                {(report?.unscheduled ?? []).map((item) => (
                  <li key={itemKey(item)}>{chip(item, false)}</li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>

      <Modal
        open={selected !== null}
        onOpenChange={(next) => {
          if (!next) setSelected(null)
        }}
        title={
          selected === null ? '' : selected.title === '' ? t('calendar.untitled') : selected.title
        }
        description={selected === null ? undefined : labelOf(selected.collection)}
        closeLabel={t('calendar.close')}
        footer={
          selected !== null && isMovable(selected) ? (
            <>
              <Button type="button" variant="secondary" onClick={() => setSelected(null)}>
                {t('common.cancel')}
              </Button>
              <Button
                type="button"
                variant="primary"
                disabled={busy || selectedDate === null}
                onClick={() => {
                  if (selected === null || selectedDate === null) return
                  void schedule(selected, selectedDate).then((done) => {
                    if (done) setSelected(null)
                  })
                }}
              >
                {selected.status === 'scheduled'
                  ? t('calendar.reschedule')
                  : t('calendar.schedule')}
              </Button>
            </>
          ) : undefined
        }
      >
        {selected !== null && (
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={selected.status === 'published' ? 'success' : 'primary'}>
                {t(`calendar.status.${selected.status}`, { defaultValue: selected.status })}
              </Badge>
              <Badge tone="neutral">{selected.locale}</Badge>
              {selected.publishedAt !== null && (
                <span className="text-sm">
                  {dateTimeFormat.format(new Date(selected.publishedAt))}
                </span>
              )}
            </div>
            {isMovable(selected) ? (
              <Field label={t('calendar.dateLabel')}>
                {(control) => (
                  <Input
                    {...control}
                    type="datetime-local"
                    value={dateValue}
                    onChange={(event) => setDateValue(event.target.value)}
                  />
                )}
              </Field>
            ) : (
              <p className="m-0 text-sm text-muted-foreground">
                {selected.status === 'published'
                  ? t('calendar.publishedFixed')
                  : t('calendar.noPermission')}
              </p>
            )}
            <Link
              className="text-sm font-medium"
              to={`/collections/${encodeURIComponent(selected.collection)}/${encodeURIComponent(selected.entryId)}`}
            >
              {t('calendar.openEntry')}
            </Link>
          </div>
        )}
      </Modal>
    </section>
  )
}
