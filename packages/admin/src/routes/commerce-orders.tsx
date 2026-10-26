import { type JSX, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router'
import {
  exportOrdersCsv,
  listOrders,
  type Order,
  type OrderCustomer,
  type OrderStatus,
} from '../api/commerce-client.js'
import { useAuth } from '../auth/auth-context.js'
import { commerceErrorMessage } from '../commerce/commerce-errors.js'
import { formatMinor } from '../commerce/money.js'
import { NewOrderModal } from '../commerce/new-order-modal.js'
import { OrderStatusBadge } from '../commerce/order-status.js'
import {
  Button,
  Field,
  Input,
  Notice,
  Select,
  Table,
  TableBody,
  TableCell,
  TableEmpty,
  TableHead,
  TableHeader,
  TableRoot,
  TableRow,
} from '../ui/index.js'

const ORDER_STATUSES: readonly OrderStatus[] = [
  'pending',
  'paid',
  'shipped',
  'delivered',
  'cancelled',
  'refunded',
]

/**
 * The order list — contract E's back office (ADR-0024), from the admin.
 *
 * Mostly read-only on purpose: the actions that move an order along (mark
 * paid, ship, refund) need the order's lines and history in view to make
 * sense of, so they live on `CommerceOrderRoute`, not on a row of this table.
 * The one write action here is placing a **manual** order (fiche 52 task 5)
 * — a phone order, a trade-show sale — which has no order yet to open.
 */
export function CommerceOrdersRoute(): JSX.Element {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const auth = useAuth()
  const token = auth.state.status === 'authenticated' ? auth.state.token : null
  const roles = auth.state.status === 'authenticated' ? auth.state.user.roles : []
  const canRead = roles.length > 0
  const canWrite = roles.includes('admin') || roles.includes('shopkeeper')
  const canSettle = canWrite

  const [orders, setOrders] = useState<readonly Order[]>([])
  const [customers, setCustomers] = useState<Readonly<Record<string, OrderCustomer>>>({})
  const [statusFilter, setStatusFilter] = useState<OrderStatus | ''>('')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  // Audit T-COM-03: `listOrders`'s third argument (`q`, reference/e-mail
  // search — fiche 52 task 7's own acceptance criterion) had a real client
  // function and a real server route, but this screen never read anything
  // into it — it passed `undefined` unconditionally.
  const [search, setSearch] = useState('')
  const [pagination, setPagination] = useState<{
    cursors: readonly (string | undefined)[]
    index: number
  }>({ cursors: [undefined], index: 0 })
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const cursor = pagination.cursors[pagination.index]
  const resetPagination = (): void => setPagination({ cursors: [undefined], index: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    if (token === null || !canRead) return
    const controller = new AbortController()
    let cancelled = false
    setLoading(true)
    setError(null)
    setNextCursor(null)
    void (async () => {
      try {
        const response = await listOrders(
          token,
          statusFilter === '' ? undefined : statusFilter,
          search.trim() === '' ? undefined : search.trim(),
          {
            ...(fromDate === '' ? {} : { from: fromDate }),
            ...(toDate === '' ? {} : { to: toDate }),
          },
          { limit: 20, ...(cursor === undefined ? {} : { cursor }), signal: controller.signal },
        )
        if (cancelled) return
        setOrders(response.orders)
        setCustomers(response.customers ?? {})
        setNextCursor(response.page?.hasMore === true ? (response.page.nextCursor ?? null) : null)
      } catch (caught) {
        if (!cancelled) setError(commerceErrorMessage(t, caught, 'commerceOrders.loadError'))
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
      controller.abort()
    }
  }, [token, canRead, statusFilter, search, fromDate, toDate, cursor, t])

  const filtered = statusFilter !== '' || fromDate !== '' || toDate !== '' || search.trim() !== ''
  function clearFilters(): void {
    setStatusFilter('')
    setFromDate('')
    setToDate('')
    setSearch('')
    resetPagination()
  }

  // The total is explicitly for this page, grouped by currency (a shop
  // billing in more than one is never summed across them into a meaningless
  // single figure), currencies in first-seen order.
  const pageTotals = useMemo(() => {
    const byCurrency = new Map<string, number>()
    for (const order of orders) {
      // A cancelled or refunded order is not revenue.
      if (order.status === 'cancelled' || order.status === 'refunded') continue
      byCurrency.set(order.currency, (byCurrency.get(order.currency) ?? 0) + order.totalMinor)
    }
    return [...byCurrency.entries()]
  }, [orders])

  async function exportCsv(): Promise<void> {
    if (token === null) return
    setError(null)
    try {
      const csv = await exportOrdersCsv(token, {
        ...(statusFilter === '' ? {} : { status: statusFilter }),
        ...(fromDate === '' ? {} : { from: fromDate }),
        ...(toDate === '' ? {} : { to: toDate }),
        ...(search.trim() === '' ? {} : { q: search.trim() }),
        format: 'accounting',
      })
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = 'orders.csv'
      link.click()
      URL.revokeObjectURL(url)
    } catch (caught) {
      setError(commerceErrorMessage(t, caught, 'commerceOrders.exportError'))
    }
  }

  if (!canRead) {
    return (
      <section aria-labelledby="commerce-orders-heading">
        <h1 id="commerce-orders-heading">{t('commerceOrders.heading')}</h1>
        <p role="alert">{t('commerceOrders.signedInOnly')}</p>
      </section>
    )
  }

  return (
    <section aria-labelledby="commerce-orders-heading" className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1
          id="commerce-orders-heading"
          className="m-0 text-2xl leading-tight font-bold tracking-tight"
        >
          {t('commerceOrders.heading')}
        </h1>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => void exportCsv()}>
            {t('commerceOrders.exportCsv')}
          </Button>
          {canWrite && (
            <Button onClick={() => setCreating(true)}>{t('commerceOrders.newOrder')}</Button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-4">
        <div className="min-w-64 max-w-sm flex-1">
          <Field label={t('commerceOrders.searchLabel')}>
            {(control) => (
              <Input
                {...control}
                type="search"
                value={search}
                placeholder={t('commerceOrders.searchPlaceholder')}
                onChange={(event) => {
                  setSearch(event.target.value)
                  resetPagination()
                }}
              />
            )}
          </Field>
        </div>
        <div className="max-w-xs">
          <Field label={t('commerceOrders.statusFilter')}>
            {(control) => (
              <Select
                {...control}
                value={statusFilter}
                onChange={(event) => {
                  setStatusFilter(event.target.value as OrderStatus | '')
                  resetPagination()
                }}
              >
                <option value="">{t('commerceOrders.allStatuses')}</option>
                {ORDER_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {t(`commerceOrders.status.${status}`)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>
        <div className="max-w-xs">
          <Field label={t('commerceOrders.fromDate')}>
            {(control) => (
              <Input
                {...control}
                type="date"
                value={fromDate}
                onChange={(event) => {
                  setFromDate(event.target.value)
                  resetPagination()
                }}
              />
            )}
          </Field>
        </div>
        <div className="max-w-xs">
          <Field label={t('commerceOrders.toDate')}>
            {(control) => (
              <Input
                {...control}
                type="date"
                value={toDate}
                onChange={(event) => {
                  setToDate(event.target.value)
                  resetPagination()
                }}
              />
            )}
          </Field>
        </div>
      </div>

      {error !== null && (
        <Notice tone="danger" live="assertive">
          <p>{error}</p>
        </Notice>
      )}
      {loading && <p>{t('common.loading')}</p>}

      {!loading && error === null && (
        <TableRoot label={t('commerceOrders.tableLabel')} stacked>
          <Table>
            <TableHead>
              <TableRow>
                <TableHeader>{t('commerceOrders.referenceColumn')}</TableHeader>
                <TableHeader>{t('commerceOrders.customerColumn')}</TableHeader>
                <TableHeader>{t('commerceOrders.statusColumn')}</TableHeader>
                <TableHeader>{t('commerceOrders.totalColumn')}</TableHeader>
                <TableHeader>{t('commerceOrders.placedAtColumn')}</TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {orders.map((order) => {
                const customer = order.customerId === null ? undefined : customers[order.customerId]
                return (
                  <TableRow key={order.id}>
                    <TableCell stack="heading">
                      <Link to={`/commerce/orders/${encodeURIComponent(order.id)}`}>
                        {order.reference}
                      </Link>
                    </TableCell>
                    <TableCell label={t('commerceOrders.customerColumn')}>
                      <span className="flex flex-col">
                        {customer?.name != null && customer.name !== '' && (
                          <span>{customer.name}</span>
                        )}
                        <span className="text-xs text-muted-foreground">{order.email}</span>
                      </span>
                    </TableCell>
                    <TableCell label={t('commerceOrders.statusColumn')}>
                      <OrderStatusBadge status={order.status} />
                    </TableCell>
                    <TableCell label={t('commerceOrders.totalColumn')}>
                      {formatMinor(order.totalMinor, order.currency, i18n.language)}
                    </TableCell>
                    <TableCell label={t('commerceOrders.placedAtColumn')}>
                      {new Date(order.placedAt).toLocaleString(i18n.language)}
                    </TableCell>
                  </TableRow>
                )
              })}
              {orders.length === 0 && (
                <TableEmpty colSpan={5}>
                  {filtered ? (
                    <span className="flex flex-col items-center gap-2">
                      {t('commerceOrders.noMatch')}
                      <Button variant="secondary" size="sm" onClick={clearFilters}>
                        {t('commerceOrders.clearFilters')}
                      </Button>
                    </span>
                  ) : (
                    t('commerceOrders.empty')
                  )}
                </TableEmpty>
              )}
            </TableBody>
          </Table>
        </TableRoot>
      )}

      {!loading && error === null && orders.length > 0 && pageTotals.length > 0 && (
        <p className="text-sm">
          {t('commerceOrders.periodTotal')}{' '}
          {pageTotals
            .map(([currency, totalMinor]) => formatMinor(totalMinor, currency, i18n.language))
            .join(' + ')}
        </p>
      )}

      {token !== null && (
        <NewOrderModal
          open={creating}
          token={token}
          canSettle={canSettle}
          onClose={() => setCreating(false)}
          onCreated={(orderId) => {
            setCreating(false)
            navigate(`/commerce/orders/${encodeURIComponent(orderId)}`)
          }}
        />
      )}

      {error === null && (pagination.index > 0 || nextCursor !== null) && (
        <nav
          aria-label={t('commerceOrders.paginationLabel')}
          className="flex flex-wrap items-center gap-2"
        >
          <Button
            variant="secondary"
            size="sm"
            disabled={loading || pagination.index === 0}
            onClick={() => setPagination((current) => ({ ...current, index: current.index - 1 }))}
          >
            {t('commerceOrders.previousPage')}
          </Button>
          <span aria-live="polite">
            {t('commerceOrders.pageInfo', { page: pagination.index + 1 })}
          </span>
          <Button
            variant="secondary"
            size="sm"
            disabled={loading || nextCursor === null}
            onClick={() => {
              if (nextCursor !== null)
                setPagination((current) => ({
                  cursors: [...current.cursors.slice(0, current.index + 1), nextCursor],
                  index: current.index + 1,
                }))
            }}
          >
            {t('commerceOrders.nextPage')}
          </Button>
        </nav>
      )}
    </section>
  )
}
