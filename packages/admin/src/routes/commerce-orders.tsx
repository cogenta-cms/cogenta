import { type JSX, useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { listOrders, type Order, type OrderStatus } from '../api/commerce-client.js'
import { ApiError } from '../api/http.js'
import { useAuth } from '../auth/auth-context.js'
import { formatMinor } from '../commerce/money.js'
import {
  Field,
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
 * Read-only here on purpose: the actions that move an order along (mark
 * paid, ship, refund) need the order's lines and history in view to make
 * sense of, so they live on `CommerceOrderRoute`, not on a row of this table.
 */
export function CommerceOrdersRoute(): JSX.Element {
  const { t, i18n } = useTranslation()
  const auth = useAuth()
  const token = auth.state.status === 'authenticated' ? auth.state.token : null
  const roles = auth.state.status === 'authenticated' ? auth.state.user.roles : []
  const canRead = roles.length > 0

  const [orders, setOrders] = useState<readonly Order[]>([])
  const [statusFilter, setStatusFilter] = useState<OrderStatus | ''>('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (token === null || !canRead) return
    setLoading(true)
    setError(null)
    try {
      const { orders: list } = await listOrders(
        token,
        statusFilter === '' ? undefined : statusFilter,
      )
      setOrders(list)
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : t('commerceOrders.loadError'))
    } finally {
      setLoading(false)
    }
  }, [token, canRead, statusFilter, t])

  useEffect(() => {
    void load()
  }, [load])

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
      <h1 id="commerce-orders-heading" className="m-0 text-xl leading-7 font-semibold">
        {t('commerceOrders.heading')}
      </h1>

      <div className="max-w-xs">
        <Field label={t('commerceOrders.statusFilter')}>
          {(control) => (
            <Select
              {...control}
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as OrderStatus | '')}
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
    </section>
  )
}
