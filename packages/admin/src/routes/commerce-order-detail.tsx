import { type JSX, useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router'
import {
  type Order,
  type OrderEvent,
  type OrderStatus,
  type Payment,
  readOrder,
  refundPayment,
  settlePayment,
  transitionOrder,
} from '../api/commerce-client.js'
import { ApiError } from '../api/http.js'
import { useAuth } from '../auth/auth-context.js'
import { formatMinor, majorTextToMinor, minorToMajorText } from '../commerce/money.js'
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  Notice,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRoot,
  TableRow,
} from '../ui/index.js'

/**
 * One order, in full: its lines, its append-only history, its payments, and
 * the actions a shopkeeper actually takes (move it along, settle a payment,
 * refund one). Every action re-reads the order afterwards rather than
 * guessing the new state locally — the transition table
 * (`@cogenta/commerce`'s `order/types.ts`) lives on the server and this
 * screen does not duplicate it.
 */
export function CommerceOrderRoute(): JSX.Element {
  const { t, i18n } = useTranslation()
  const { id = '' } = useParams<{ id: string }>()
  const auth = useAuth()
  const token = auth.state.status === 'authenticated' ? auth.state.token : null
  const roles = auth.state.status === 'authenticated' ? auth.state.user.roles : []
  const canRead = roles.length > 0

  const [order, setOrder] = useState<Order | null>(null)
  const [history, setHistory] = useState<readonly OrderEvent[]>([])
  const [payments, setPayments] = useState<readonly Payment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (token === null || !canRead || id === '') return
    setLoading(true)
    setError(null)
    try {
      const result = await readOrder(token, id)
      setOrder(result.order)
      setHistory(result.history)
      setPayments(result.payments)
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : t('commerceOrderDetail.loadError'))
    } finally {
      setLoading(false)
    }
  }, [token, canRead, id, t])

  useEffect(() => {
    void load()
  }, [load])

  async function transition(status: OrderStatus): Promise<void> {
    if (token === null) return
    setActionError(null)
    try {
      await transitionOrder(token, id, status)
      await load()
    } catch (caught) {
      setActionError(
        caught instanceof ApiError ? caught.message : t('commerceOrderDetail.transitionError'),
      )
    }
  }

  async function settle(paymentId: string): Promise<void> {
    if (token === null) return
    setActionError(null)
    try {
      await settlePayment(token, paymentId)
      await load()
    } catch (caught) {
      setActionError(
        caught instanceof ApiError ? caught.message : t('commerceOrderDetail.settleError'),
      )
    }
  }

  // Full-amount refund only — the MVP this screen fixes on purpose. A partial
  // refund needs its own amount field and its own confirmation step, which is
  // real future work rather than a hidden default this button should guess at.
  async function refund(payment: Payment): Promise<void> {
    if (token === null) return
    setActionError(null)
    const amountMinor = majorTextToMinor(
      minorToMajorText(payment.amountMinor, payment.currency),
      payment.currency,
    )
    if (amountMinor === null) {
      setActionError(t('commerceOrderDetail.refundAmountInvalid'))
      return
    }
    try {
      await refundPayment(token, payment.id, amountMinor)
      await load()
    } catch (caught) {
      setActionError(
        caught instanceof ApiError ? caught.message : t('commerceOrderDetail.refundError'),
      )
    }
  }

  if (!canRead) {
    return (
      <section>
        <p role="alert">{t('commerceOrders.signedInOnly')}</p>
      </section>
    )
  }

  if (loading) return <p>{t('common.loading')}</p>
  if (error !== null) {
    return (
      <Notice tone="danger" live="assertive">
        <p>{error}</p>
      </Notice>
    )
  }
  if (order === null) return <p>{t('commerceOrderDetail.notFound')}</p>

  const nextStatuses = TRANSITIONS[order.status]

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link to="/commerce/orders">{t('commerceOrderDetail.back')}</Link>
          <h1 className="m-0 text-xl leading-7 font-semibold">
            {t('commerceOrderDetail.heading', { reference: order.reference })}
          </h1>
          <p className="text-sm">
            {order.email} — {t(`commerceOrders.status.${order.status}`)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {nextStatuses.map((status) => (
            <Button
              key={status}
              variant="secondary"
              size="sm"
              onClick={() => void transition(status)}
            >
              {t('commerceOrderDetail.moveTo', { status: t(`commerceOrders.status.${status}`) })}
            </Button>
          ))}
        </div>
      </div>

      {actionError !== null && (
        <Notice tone="danger" live="assertive">
          <p>{actionError}</p>
        </Notice>
      )}

      <Card>
        <CardHeader>
          <CardTitle>
            <h2>{t('commerceOrderDetail.linesTitle')}</h2>
          </CardTitle>
        </CardHeader>
        <CardBody>
          <TableRoot label={t('commerceOrderDetail.linesTitle')}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeader>{t('commerceOrderDetail.skuColumn')}</TableHeader>
                  <TableHeader>{t('commerceOrderDetail.titleColumn')}</TableHeader>
                  <TableHeader>{t('commerceOrderDetail.quantityColumn')}</TableHeader>
                  <TableHeader>{t('commerceOrderDetail.totalColumn')}</TableHeader>
                </TableRow>
              </TableHead>
              <TableBody>
                {order.lines.map((line) => (
                  <TableRow key={line.id}>
                    <TableCell>{line.sku}</TableCell>
                    <TableCell>{line.title}</TableCell>
                    <TableCell>{line.quantity}</TableCell>
                    <TableCell>
                      {formatMinor(line.totalMinor, order.currency, i18n.language)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableRoot>
          <p className="mt-4 text-right font-semibold">
            {t('commerceOrderDetail.orderTotal')}:{' '}
            {formatMinor(order.totalMinor, order.currency, i18n.language)}
          </p>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            <h2>{t('commerceOrderDetail.paymentsTitle')}</h2>
          </CardTitle>
        </CardHeader>
        <CardBody>
          {payments.length === 0 && <p>{t('commerceOrderDetail.noPayments')}</p>}
          <ul className="m-0 flex list-none flex-col gap-3 p-0">
            {payments.map((payment) => (
              <li key={payment.id} className="flex flex-wrap items-center justify-between gap-3">
                <span className="text-sm">
                  {payment.driver} —{' '}
                  {formatMinor(payment.amountMinor, payment.currency, i18n.language)} —{' '}
                  {t(`commerceOrderDetail.paymentStatus.${payment.status}`)}
                </span>
                <div className="flex gap-2">
                  {payment.status === 'pending' && (
                    <Button size="sm" onClick={() => void settle(payment.id)}>
                      {t('commerceOrderDetail.markPaid')}
                    </Button>
                  )}
                  {payment.status === 'paid' && (
                    <Button variant="destructive" size="sm" onClick={() => void refund(payment)}>
                      {t('commerceOrderDetail.refund')}
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            <h2>{t('commerceOrderDetail.historyTitle')}</h2>
          </CardTitle>
        </CardHeader>
        <CardBody>
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {history.map((event) => (
              <li key={event.id} className="text-sm">
                {new Date(event.at).toLocaleString(i18n.language)} —{' '}
                {t(`commerceOrderDetail.event.${event.kind}`)}
                {event.toStatus !== null
                  ? ` → ${t(`commerceOrders.status.${event.toStatus}`)}`
                  : ''}
                {event.note !== null ? ` (${event.note})` : ''}
              </li>
            ))}
          </ul>
        </CardBody>
      </Card>
    </section>
  )
}

/**
 * The same closed transition table `@cogenta/commerce`'s `order/types.ts`
 * enforces — restated here only to decide which buttons this screen shows.
 * A transition this table gets wrong still cannot happen: the server checks
 * it again and refuses (R4).
 */
const TRANSITIONS: Readonly<Record<OrderStatus, readonly OrderStatus[]>> = {
  pending: ['paid', 'cancelled'],
  paid: ['shipped', 'cancelled', 'refunded'],
  shipped: ['delivered', 'refunded'],
  delivered: ['refunded'],
  cancelled: [],
  refunded: [],
}
