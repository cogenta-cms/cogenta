import { type FormEvent, type JSX, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router'
import {
  createManualOrder,
  exportOrdersCsv,
  listOrders,
  type Order,
  type OrderStatus,
} from '../api/commerce-client.js'
import { ApiError } from '../api/http.js'
import { useAuth } from '../auth/auth-context.js'
import { formatMinor } from '../commerce/money.js'
import {
  Button,
  Field,
  Input,
  Modal,
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

interface ManualLine {
  readonly variantId: string
  readonly quantity: string
}

const EMPTY_LINE: ManualLine = { variantId: '', quantity: '1' }

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

  const [orders, setOrders] = useState<readonly Order[]>([])
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
        setNextCursor(response.page?.hasMore === true ? (response.page.nextCursor ?? null) : null)
      } catch (caught) {
        if (!cancelled)
          setError(caught instanceof ApiError ? caught.message : t('commerceOrders.loadError'))
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
      controller.abort()
    }
  }, [token, canRead, statusFilter, search, fromDate, toDate, cursor, t])

  // The total is explicitly for this page, grouped by currency (a shop
  // billing in more than one is never summed across them into a meaningless
  // single figure), currencies in first-seen order.
  const pageTotals = useMemo(() => {
    const byCurrency = new Map<string, number>()
    for (const order of orders) {
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
      })
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = 'orders.csv'
      link.click()
      URL.revokeObjectURL(url)
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : t('commerceOrders.loadError'))
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
          <Button variant="secondary" size="sm" onClick={() => void exportCsv()}>
            {t('commerceOrders.exportCsv')}
          </Button>
          {canWrite && (
            <Button size="sm" onClick={() => setCreating(true)}>
              {t('commerceOrders.newOrder')}
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-4">
        <div className="max-w-xs">
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
        <TableRoot label={t('commerceOrders.tableLabel')}>
          <Table>
            <TableHead>
              <TableRow>
                <TableHeader>{t('commerceOrders.referenceColumn')}</TableHeader>
                <TableHeader>{t('commerceOrders.emailColumn')}</TableHeader>
                <TableHeader>{t('commerceOrders.statusColumn')}</TableHeader>
                <TableHeader>{t('commerceOrders.totalColumn')}</TableHeader>
                <TableHeader>{t('commerceOrders.placedAtColumn')}</TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {orders.map((order) => (
                <TableRow key={order.id}>
                  <TableCell>
                    <Link to={`/commerce/orders/${encodeURIComponent(order.id)}`}>
                      {order.reference}
                    </Link>
                  </TableCell>
                  <TableCell>{order.email}</TableCell>
                  <TableCell>{t(`commerceOrders.status.${order.status}`)}</TableCell>
                  <TableCell>
                    {formatMinor(order.totalMinor, order.currency, i18n.language)}
                  </TableCell>
                  <TableCell>{new Date(order.placedAt).toLocaleString(i18n.language)}</TableCell>
                </TableRow>
              ))}
              {orders.length === 0 && (
                <TableEmpty colSpan={5}>{t('commerceOrders.empty')}</TableEmpty>
              )}
            </TableBody>
          </Table>
        </TableRoot>
      )}

      {!loading && error === null && orders.length > 0 && (
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

interface NewOrderModalProps {
  readonly open: boolean
  readonly token: string
  readonly onClose: () => void
  readonly onCreated: (orderId: string) => void
}

/** A shopkeeper-entered order (fiche 52 task 5) — a phone order, a trade-show sale, a correction. */
function NewOrderModal(props: NewOrderModalProps): JSX.Element {
  const { t } = useTranslation()
  const [email, setEmail] = useState('')
  const [customerName, setCustomerName] = useState('')
  const [currency, setCurrency] = useState('EUR')
  const [lines, setLines] = useState<readonly ManualLine[]>([EMPTY_LINE])
  const [line1, setLine1] = useState('')
  const [city, setCity] = useState('')
  const [postalCode, setPostalCode] = useState('')
  const [error, setError] = useState<string | null>(null)

  function reset(): void {
    setEmail('')
    setCustomerName('')
    setCurrency('EUR')
    setLines([EMPTY_LINE])
    setLine1('')
    setCity('')
    setPostalCode('')
    setError(null)
  }

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault()
    setError(null)
    const parsedLines = lines
      .filter((line) => line.variantId.trim() !== '')
      .map((line) => ({ variantId: line.variantId.trim(), quantity: Number(line.quantity) }))
    if (parsedLines.length === 0) {
      setError(t('commerceManualOrder.empty'))
      return
    }
    try {
      const outcome = await createManualOrder(props.token, {
        email,
        currency,
        lines: parsedLines,
        ...(customerName.trim() === '' ? {} : { customerName: customerName.trim() }),
        ...(line1.trim() === '' || city.trim() === '' || postalCode.trim() === ''
          ? {}
          : {
              shippingAddress: {
                line1: line1.trim(),
                city: city.trim(),
                postalCode: postalCode.trim(),
              },
            }),
      })
      if (outcome.kind === 'placed') {
        reset()
        props.onCreated(outcome.order.id)
        return
      }
      if (outcome.kind === 'out_of_stock') {
        setError(t('commerceManualOrder.outOfStock'))
        return
      }
      if (outcome.kind === 'coupon_refused') {
        setError(t('commerceManualOrder.couponRefused'))
        return
      }
      setError(t('commerceManualOrder.empty'))
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : t('commerceManualOrder.createError'))
    }
  }

  return (
    <Modal
      open={props.open}
      onOpenChange={(open) => {
        if (!open) props.onClose()
      }}
      title={t('commerceManualOrder.heading')}
      closeLabel={t('commerceProducts.close')}
    >
      <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-4">
        {error !== null && (
          <Notice tone="danger" live="assertive">
            <p>{error}</p>
          </Notice>
        )}
        <Field label={t('commerceManualOrder.email')}>
          {(control) => (
            <Input
              {...control}
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          )}
        </Field>
        <Field label={t('commerceManualOrder.customerName')}>
          {(control) => (
            <Input
              {...control}
              value={customerName}
              onChange={(event) => setCustomerName(event.target.value)}
            />
          )}
        </Field>
        <Field label={t('commerceManualOrder.currency')}>
          {(control) => (
            <Input
              {...control}
              required
              value={currency}
              onChange={(event) => setCurrency(event.target.value.toUpperCase())}
            />
          )}
        </Field>

        <p className="mb-0 text-sm font-medium">{t('commerceManualOrder.lines')}</p>
        {lines.map((line, index) => (
          // Manual order lines have no stable id until submitted — position is
          // the only key a fixed-length editable list like this one has.
          <div key={index} className="flex items-end gap-2">
            <Field label={t('commerceManualOrder.variantId')} className="flex-1">
              {(control) => (
                <Input
                  {...control}
                  value={line.variantId}
                  onChange={(event) =>
                    setLines((current) =>
                      current.map((entry, i) =>
                        i === index ? { ...entry, variantId: event.target.value } : entry,
                      ),
                    )
                  }
                />
              )}
            </Field>
            <Field label={t('commerceManualOrder.quantity')}>
              {(control) => (
                <Input
                  {...control}
                  type="number"
                  min="1"
                  value={line.quantity}
                  onChange={(event) =>
                    setLines((current) =>
                      current.map((entry, i) =>
                        i === index ? { ...entry, quantity: event.target.value } : entry,
                      ),
                    )
                  }
                />
              )}
            </Field>
            {lines.length > 1 && (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setLines((current) => current.filter((_, i) => i !== index))}
              >
                {t('commerceManualOrder.removeLine')}
              </Button>
            )}
          </div>
        ))}
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => setLines((current) => [...current, EMPTY_LINE])}
        >
          {t('commerceManualOrder.addLine')}
        </Button>

        <p className="mb-0 text-sm font-medium">{t('commerceOrderDetail.addressTitle')}</p>
        <Field label={t('commerceOrderDetail.addressLine1')}>
          {(control) => (
            <Input {...control} value={line1} onChange={(event) => setLine1(event.target.value)} />
          )}
        </Field>
        <Field label={t('commerceOrderDetail.addressCity')}>
          {(control) => (
            <Input {...control} value={city} onChange={(event) => setCity(event.target.value)} />
          )}
        </Field>
        <Field label={t('commerceOrderDetail.addressPostalCode')}>
          {(control) => (
            <Input
              {...control}
              value={postalCode}
              onChange={(event) => setPostalCode(event.target.value)}
            />
          )}
        </Field>

        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => props.onClose()}>
            {t('common.cancel')}
          </Button>
          <Button type="submit">{t('commerceManualOrder.create')}</Button>
        </div>
      </form>
    </Modal>
  )
}
