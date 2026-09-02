import { type FormEvent, type JSX, useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router'
import {
  fetchInvoicePdf,
  type Invoice,
  issueInvoice,
  listCreditNotes,
  listOrderEmails,
  listRefunds,
  type Order,
  type OrderEmailRecord,
  type OrderEvent,
  type OrderStatus,
  type Payment,
  type RefundRecord,
  readInvoice,
  readOrder,
  refundPayment,
  setOrderTracking,
  settlePayment,
  transitionOrder,
  updateOrder,
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
  Field,
  Input,
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
 * One order, in full: its address, its lines, its append-only history, its
 * payments and refunds, its shipment tracking, its e-mail log, and the
 * actions a shopkeeper actually takes. Every action re-reads the order
 * afterwards rather than guessing the new state locally — the transition
 * table (`@cogenta/commerce`'s `order/types.ts`) lives on the server and this
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
  const [refundsByPayment, setRefundsByPayment] = useState<
    Readonly<Record<string, readonly RefundRecord[]>>
  >({})
  const [invoice, setInvoice] = useState<Invoice | null>(null)
  const [emails, setEmails] = useState<readonly OrderEmailRecord[]>([])
  const [creditNoteCount, setCreditNoteCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const [editingAddress, setEditingAddress] = useState(false)
  const [addressForm, setAddressForm] = useState<AddressForm>(EMPTY_ADDRESS)
  const [trackingForm, setTrackingForm] = useState<TrackingForm>(EMPTY_TRACKING)
  const [refundForm, setRefundForm] = useState<Readonly<Record<string, RefundForm>>>({})

  const load = useCallback(async () => {
    if (token === null || !canRead || id === '') return
    setLoading(true)
    setError(null)
    try {
      const result = await readOrder(token, id)
      setOrder(result.order)
      setHistory(result.history)
      setPayments(result.payments)
      setInvoice(await readInvoice(token, id))
      setEmails((await listOrderEmails(token, id)).emails)
      setCreditNoteCount((await listCreditNotes(token, id)).creditNotes.length)

      const refundEntries = await Promise.all(
        result.payments.map(
          async (payment) => [payment.id, (await listRefunds(token, payment.id)).refunds] as const,
        ),
      )
      setRefundsByPayment(Object.fromEntries(refundEntries))
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : t('commerceOrderDetail.loadError'))
    } finally {
      setLoading(false)
    }
  }, [token, canRead, id, t])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (order === null) return
    setAddressForm({
      line1: order.shippingAddressLine1 ?? '',
      line2: order.shippingAddressLine2 ?? '',
      city: order.shippingCity ?? '',
      postalCode: order.shippingPostalCode ?? '',
      recipient: order.shippingRecipient ?? '',
      phone: order.shippingPhone ?? '',
    })
    setTrackingForm({
      carrier: order.trackingCarrier ?? '',
      number: order.trackingNumber ?? '',
      url: order.trackingUrl ?? '',
    })
  }, [order])

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

  /** A partial (or full) refund — amount and a mandatory reason (fiche 52 task 6). */
  async function refund(payment: Payment): Promise<void> {
    if (token === null || order === null) return
    setActionError(null)
    const form = refundForm[payment.id] ?? defaultRefundForm(payment, refundsByPayment[payment.id])
    const amountMinor = majorTextToMinor(form.amount, payment.currency)
    if (amountMinor === null || amountMinor <= 0) {
      setActionError(t('commerceOrderDetail.refundAmountInvalid'))
      return
    }
    if (form.reason.trim() === '') {
      setActionError(t('commerceOrderDetail.refundReasonRequired'))
      return
    }
    try {
      await refundPayment(token, payment.id, amountMinor, form.reason.trim())
      setRefundForm((current) => {
        const next = { ...current }
        delete next[payment.id]
        return next
      })
      await load()
    } catch (caught) {
      setActionError(
        caught instanceof ApiError ? caught.message : t('commerceOrderDetail.refundError'),
      )
    }
  }

  async function saveAddress(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    if (token === null) return
    setActionError(null)
    try {
      await updateOrder(token, id, {
        shippingAddress: {
          line1: addressForm.line1,
          line2: addressForm.line2 === '' ? null : addressForm.line2,
          city: addressForm.city,
          postalCode: addressForm.postalCode,
          recipient: addressForm.recipient === '' ? null : addressForm.recipient,
          phone: addressForm.phone === '' ? null : addressForm.phone,
        },
      })
      setEditingAddress(false)
      await load()
    } catch (caught) {
      setActionError(
        caught instanceof ApiError ? caught.message : t('commerceOrderDetail.addressError'),
      )
    }
  }

  async function saveTracking(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    if (token === null) return
    setActionError(null)
    try {
      await setOrderTracking(token, id, {
        carrier: trackingForm.carrier,
        number: trackingForm.number,
        ...(trackingForm.url === '' ? {} : { url: trackingForm.url }),
      })
      await load()
    } catch (caught) {
      setActionError(
        caught instanceof ApiError ? caught.message : t('commerceOrderDetail.trackingError'),
      )
    }
  }

  async function issue(): Promise<void> {
    if (token === null) return
    setActionError(null)
    try {
      setInvoice(await issueInvoice(token, id))
    } catch (caught) {
      setActionError(
        caught instanceof ApiError ? caught.message : t('commerceOrderDetail.invoiceError'),
      )
    }
  }

  async function download(): Promise<void> {
    if (token === null) return
    setActionError(null)
    try {
      const blob = await fetchInvoicePdf(token, id)
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `${invoice?.number ?? 'invoice'}.pdf`
      link.click()
      URL.revokeObjectURL(url)
    } catch (caught) {
      setActionError(
        caught instanceof ApiError ? caught.message : t('commerceOrderDetail.invoiceDownloadError'),
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
  const hasAddress =
    order.shippingAddressLine1 !== null ||
    order.shippingCity !== null ||
    order.shippingPostalCode !== null

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link to="/commerce/orders">{t('commerceOrderDetail.back')}</Link>
          <h1 className="m-0 text-2xl leading-tight font-bold tracking-tight">
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
            <h2>{t('commerceOrderDetail.addressTitle')}</h2>
          </CardTitle>
        </CardHeader>
        <CardBody>
          {editingAddress ? (
            <form onSubmit={(event) => void saveAddress(event)} className="flex flex-col gap-4">
              <Field label={t('commerceOrderDetail.addressRecipient')}>
                {(control) => (
                  <Input
                    {...control}
                    value={addressForm.recipient}
                    onChange={(event) =>
                      setAddressForm((f) => ({ ...f, recipient: event.target.value }))
                    }
                  />
                )}
              </Field>
              <Field label={t('commerceOrderDetail.addressLine1')}>
                {(control) => (
                  <Input
                    {...control}
                    required
                    value={addressForm.line1}
                    onChange={(event) =>
                      setAddressForm((f) => ({ ...f, line1: event.target.value }))
                    }
                  />
                )}
              </Field>
              <Field label={t('commerceOrderDetail.addressLine2')}>
                {(control) => (
                  <Input
                    {...control}
                    value={addressForm.line2}
                    onChange={(event) =>
                      setAddressForm((f) => ({ ...f, line2: event.target.value }))
                    }
                  />
                )}
              </Field>
              <Field label={t('commerceOrderDetail.addressPostalCode')}>
                {(control) => (
                  <Input
                    {...control}
                    required
                    value={addressForm.postalCode}
                    onChange={(event) =>
                      setAddressForm((f) => ({ ...f, postalCode: event.target.value }))
                    }
                  />
                )}
              </Field>
              <Field label={t('commerceOrderDetail.addressCity')}>
                {(control) => (
                  <Input
                    {...control}
                    required
                    value={addressForm.city}
                    onChange={(event) =>
                      setAddressForm((f) => ({ ...f, city: event.target.value }))
                    }
                  />
                )}
              </Field>
              <Field label={t('commerceOrderDetail.addressPhone')}>
                {(control) => (
                  <Input
                    {...control}
                    value={addressForm.phone}
                    onChange={(event) =>
                      setAddressForm((f) => ({ ...f, phone: event.target.value }))
                    }
                  />
                )}
              </Field>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="secondary" onClick={() => setEditingAddress(false)}>
                  {t('common.cancel')}
                </Button>
                <Button type="submit">{t('commerceOrderDetail.addressSave')}</Button>
              </div>
            </form>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-3">
              {hasAddress ? (
                <p className="text-sm whitespace-pre-line">
                  {[
                    order.shippingRecipient,
                    order.shippingAddressLine1,
                    order.shippingAddressLine2,
                    [order.shippingPostalCode, order.shippingCity].filter(Boolean).join(' '),
                  ]
                    .filter((line) => line !== null && line !== '')
                    .join('\n')}
                </p>
              ) : (
                <p className="text-sm">{t('commerceOrderDetail.addressNone')}</p>
              )}
              {order.status === 'pending' && (
                <Button size="sm" variant="secondary" onClick={() => setEditingAddress(true)}>
                  {t('commerceOrderDetail.addressEdit')}
                </Button>
              )}
            </div>
          )}
        </CardBody>
      </Card>

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
          <ul className="m-0 flex list-none flex-col gap-4 p-0">
            {payments.map((payment) => {
              const refunds = refundsByPayment[payment.id] ?? []
              const refundedMinor = refunds
                .filter((r) => r.status !== 'failed')
                .reduce((sum, r) => sum + r.amountMinor, 0)
              const remainingMinor = payment.amountMinor - refundedMinor
              const form = refundForm[payment.id]
              return (
                <li key={payment.id} className="flex flex-col gap-2">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <span className="text-sm">
                      {payment.driver} —{' '}
                      {formatMinor(payment.amountMinor, payment.currency, i18n.language)} —{' '}
                      {t(`commerceOrderDetail.paymentStatus.${payment.status}`)}
                      {refundedMinor > 0 &&
                        ` — ${t('commerceOrderDetail.refundedSoFar', {
                          amount: formatMinor(refundedMinor, payment.currency, i18n.language),
                        })}`}
                    </span>
                    <div className="flex gap-2">
                      {payment.status === 'pending' && (
                        <Button size="sm" onClick={() => void settle(payment.id)}>
                          {t('commerceOrderDetail.markPaid')}
                        </Button>
                      )}
                      {(payment.status === 'paid' || payment.status === 'partially_refunded') &&
                        remainingMinor > 0 &&
                        form === undefined && (
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() =>
                              setRefundForm((current) => ({
                                ...current,
                                [payment.id]: defaultRefundForm(payment, refunds),
                              }))
                            }
                          >
                            {t('commerceOrderDetail.refund')}
                          </Button>
                        )}
                    </div>
                  </div>
                  {form !== undefined && (
                    <div className="flex flex-wrap items-end gap-2 rounded border p-3">
                      <Field label={t('commerceOrderDetail.refundAmount')}>
                        {(control) => (
                          <Input
                            {...control}
                            value={form.amount}
                            onChange={(event) =>
                              setRefundForm((current) => ({
                                ...current,
                                [payment.id]: { ...form, amount: event.target.value },
                              }))
                            }
                          />
                        )}
                      </Field>
                      <Field label={t('commerceOrderDetail.refundReason')} className="flex-1">
                        {(control) => (
                          <Input
                            {...control}
                            required
                            value={form.reason}
                            onChange={(event) =>
                              setRefundForm((current) => ({
                                ...current,
                                [payment.id]: { ...form, reason: event.target.value },
                              }))
                            }
                          />
                        )}
                      </Field>
                      <Button variant="destructive" size="sm" onClick={() => void refund(payment)}>
                        {t('commerceOrderDetail.refundConfirm')}
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() =>
                          setRefundForm((current) => {
                            const next = { ...current }
                            delete next[payment.id]
                            return next
                          })
                        }
                      >
                        {t('common.cancel')}
                      </Button>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
          {creditNoteCount > 0 && (
            <p className="mt-3 text-sm">
              {t('commerceOrderDetail.creditNotesIssued', { count: creditNoteCount })}
            </p>
          )}
        </CardBody>
      </Card>

      {(order.status === 'paid' || order.status === 'shipped' || order.status === 'delivered') && (
        <Card>
          <CardHeader>
            <CardTitle>
              <h2>{t('commerceOrderDetail.trackingTitle')}</h2>
            </CardTitle>
          </CardHeader>
          <CardBody>
            <form
              onSubmit={(event) => void saveTracking(event)}
              className="flex flex-wrap items-end gap-3"
            >
              <Field label={t('commerceOrderDetail.trackingCarrier')}>
                {(control) => (
                  <Input
                    {...control}
                    required
                    value={trackingForm.carrier}
                    onChange={(event) =>
                      setTrackingForm((f) => ({ ...f, carrier: event.target.value }))
                    }
                  />
                )}
              </Field>
              <Field label={t('commerceOrderDetail.trackingNumber')}>
                {(control) => (
                  <Input
                    {...control}
                    required
                    value={trackingForm.number}
                    onChange={(event) =>
                      setTrackingForm((f) => ({ ...f, number: event.target.value }))
                    }
                  />
                )}
              </Field>
              <Field label={t('commerceOrderDetail.trackingUrl')}>
                {(control) => (
                  <Input
                    {...control}
                    value={trackingForm.url}
                    onChange={(event) =>
                      setTrackingForm((f) => ({ ...f, url: event.target.value }))
                    }
                  />
                )}
              </Field>
              <Button type="submit" size="sm">
                {order.status === 'paid'
                  ? t('commerceOrderDetail.trackingShip')
                  : t('commerceOrderDetail.trackingSave')}
              </Button>
            </form>
          </CardBody>
        </Card>
      )}

      {order.status !== 'pending' && (
        <Card>
          <CardHeader>
            <CardTitle>
              <h2>{t('commerceOrderDetail.invoiceTitle')}</h2>
            </CardTitle>
          </CardHeader>
          <CardBody>
            {invoice === null ? (
              <div className="flex items-center gap-3">
                <Button size="sm" onClick={() => void issue()}>
                  {t('commerceOrderDetail.issueInvoice')}
                </Button>
              </div>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="text-sm">
                  {t('commerceOrderDetail.invoiceIssued', {
                    number: invoice.number,
                    date: new Date(invoice.issuedAt).toLocaleDateString(i18n.language),
                  })}
                </span>
                <Button variant="secondary" size="sm" onClick={() => void download()}>
                  {t('commerceOrderDetail.downloadInvoice', { number: invoice.number })}
                </Button>
              </div>
            )}
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>
            <h2>{t('commerceOrderDetail.emailsTitle')}</h2>
          </CardTitle>
        </CardHeader>
        <CardBody>
          {emails.length === 0 ? (
            <p>{t('commerceOrderDetail.noEmails')}</p>
          ) : (
            <ul className="m-0 flex list-none flex-col gap-1 p-0">
              {emails.map((email) => (
                <li key={email.id} className="text-sm">
                  {t(`commerceOrderDetail.emailKind.${email.kind}`)} — {email.toEmail} —{' '}
                  {t(`commerceOrderDetail.emailStatus.${email.status}`)}
                </li>
              ))}
            </ul>
          )}
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

interface AddressForm {
  readonly line1: string
  readonly line2: string
  readonly city: string
  readonly postalCode: string
  readonly recipient: string
  readonly phone: string
}

const EMPTY_ADDRESS: AddressForm = {
  line1: '',
  line2: '',
  city: '',
  postalCode: '',
  recipient: '',
  phone: '',
}

interface TrackingForm {
  readonly carrier: string
  readonly number: string
  readonly url: string
}

const EMPTY_TRACKING: TrackingForm = { carrier: '', number: '', url: '' }

interface RefundForm {
  readonly amount: string
  readonly reason: string
}

/** Defaults the amount to what is still refundable — not the full payment, once some has already come back. */
function defaultRefundForm(
  payment: Payment,
  refunds: readonly RefundRecord[] | undefined,
): RefundForm {
  const refundedMinor = (refunds ?? [])
    .filter((r) => r.status !== 'failed')
    .reduce((sum, r) => sum + r.amountMinor, 0)
  const remainingMinor = Math.max(0, payment.amountMinor - refundedMinor)
  return { amount: minorToMajorText(remainingMinor, payment.currency), reason: '' }
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
