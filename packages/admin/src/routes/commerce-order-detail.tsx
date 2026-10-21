import { type FormEvent, type JSX, useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router'
import {
  type CreditNote,
  fetchInvoicePdf,
  fetchInvoicePreviewPdf,
  issueInvoice,
  listCreditNotes,
  listOrderEmails,
  listRefunds,
  MANUAL_PAYMENT_METHODS,
  type ManualPaymentMethod,
  type OrderDetail,
  type OrderEmailRecord,
  type OrderStatus,
  type Payment,
  type RefundRecord,
  readOrder,
  recordManualPayment,
  refundPayment,
  setOrderTracking,
  transitionOrder,
  updateOrder,
} from '../api/commerce-client.js'
import { useAuth } from '../auth/auth-context.js'
import { commerceErrorMessage } from '../commerce/commerce-errors.js'
import { ConfirmDialog } from '../commerce/confirm-dialog.js'
import { countryName, countryOptions } from '../commerce/countries.js'
import { DialogError } from '../commerce/dialog-error.js'
import { formatMinor, majorTextToMinor, minorToMajorText } from '../commerce/money.js'
import { describeOrderEvent } from '../commerce/order-event.js'
import { OrderStatusBadge } from '../commerce/order-status.js'
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  Field,
  Input,
  Modal,
  Notice,
  PageHeader,
  Select,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRoot,
  TableRow,
} from '../ui/index.js'

type PendingAction = 'cancel' | 'ship' | 'deliver' | 'invoice' | null

const HTTP_URL = /^https?:\/\/\S+$/iu

/**
 * One order, in full: who bought it, what, where it goes, what was paid and
 * given back, its shipment, its invoice, its e-mails and its append-only
 * history, plus the actions a shopkeeper actually takes.
 *
 * Every action that cannot be taken back asks first, says what it did
 * afterwards, and shows a refusal inside the dialog that raised it. The order
 * is re-read after each action rather than patched locally — the transition
 * table lives on the server and this screen does not duplicate its rules, only
 * which buttons to offer.
 */
export function CommerceOrderRoute(): JSX.Element {
  const { t, i18n } = useTranslation()
  const { id = '' } = useParams<{ id: string }>()
  const auth = useAuth()
  const token = auth.state.status === 'authenticated' ? auth.state.token : null
  const roles = auth.state.status === 'authenticated' ? auth.state.user.roles : []
  const canRead = roles.length > 0
  const isAdmin = roles.includes('admin')
  const canWrite = isAdmin || roles.includes('shopkeeper')
  const canRefund = isAdmin

  const [detail, setDetail] = useState<OrderDetail | null>(null)
  const [refundsByPayment, setRefundsByPayment] = useState<
    Readonly<Record<string, readonly RefundRecord[]>>
  >({})
  const [emails, setEmails] = useState<readonly OrderEmailRecord[]>([])
  const [creditNotes, setCreditNotes] = useState<readonly CreditNote[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const [pending, setPending] = useState<PendingAction>(null)
  const [dialogError, setDialogError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [payDialog, setPayDialog] = useState(false)
  const [payMethod, setPayMethod] = useState<ManualPaymentMethod>('bank_transfer')
  const [payNote, setPayNote] = useState('')
  const [refundDialog, setRefundDialog] = useState<Payment | null>(null)
  const [refundAmount, setRefundAmount] = useState('')
  const [refundReason, setRefundReason] = useState('')
  const [refundErrors, setRefundErrors] = useState<Readonly<Record<string, string>>>({})
  const [editingAddress, setEditingAddress] = useState(false)
  const [addressForm, setAddressForm] = useState<AddressForm>(EMPTY_ADDRESS)
  const [addressErrors, setAddressErrors] = useState<Readonly<Record<string, string>>>({})
  const [trackingForm, setTrackingForm] = useState<TrackingForm>(EMPTY_TRACKING)
  const [trackingErrors, setTrackingErrors] = useState<Readonly<Record<string, string>>>({})

  const order = detail?.order ?? null

  const load = useCallback(async () => {
    if (token === null || !canRead || id === '') return
    setError(null)
    try {
      const result = await readOrder(token, id)
      setDetail(result)
      setEmails((await listOrderEmails(token, id)).emails)
      setCreditNotes((await listCreditNotes(token, id)).creditNotes)
      const refundEntries = await Promise.all(
        result.payments.map(
          async (payment) => [payment.id, (await listRefunds(token, payment.id)).refunds] as const,
        ),
      )
      setRefundsByPayment(Object.fromEntries(refundEntries))
    } catch (caught) {
      setError(commerceErrorMessage(t, caught, 'commerceOrderDetail.loadError'))
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
      country: order.shippingCountry ?? '',
    })
    setTrackingForm({
      carrier: order.trackingCarrier ?? '',
      number: order.trackingNumber ?? '',
      url: order.trackingUrl ?? '',
    })
  }, [order])

  const paidPayment =
    detail?.payments.find(
      (payment) => payment.status === 'paid' || payment.status === 'partially_refunded',
    ) ?? null
  const remainingMinor = (payment: Payment): number =>
    payment.amountMinor -
    (refundsByPayment[payment.id] ?? [])
      .filter((refund) => refund.status !== 'failed')
      .reduce((sum, refund) => sum + refund.amountMinor, 0)

  function paymentMethodLabel(method: string): string {
    const key = `commercePaymentMethod.${method}`
    const label = t(key)
    return label === key ? method : label
  }

  async function run(
    action: () => Promise<void>,
    onError: (message: string) => void,
    fallback: string,
  ): Promise<boolean> {
    setBusy(true)
    try {
      await action()
      await load()
      return true
    } catch (caught) {
      onError(commerceErrorMessage(t, caught, fallback))
      return false
    } finally {
      setBusy(false)
    }
  }

  async function transition(status: OrderStatus, successKey: string): Promise<void> {
    if (token === null) return
    setDialogError(null)
    setActionError(null)
    const ok = await run(
      async () => {
        await transitionOrder(token, id, status)
      },
      (message) => {
        setDialogError(message)
        setActionError(message)
      },
      'commerceOrderDetail.transitionError',
    )
    if (ok) {
      setPending(null)
      setActionError(null)
      setSuccess(t(successKey))
    }
  }

  async function confirmInvoice(): Promise<void> {
    if (token === null) return
    setDialogError(null)
    const ok = await run(
      async () => {
        await issueInvoice(token, id)
      },
      setDialogError,
      'commerceOrderDetail.invoiceError',
    )
    if (ok) {
      setPending(null)
      setSuccess(t('commerceOrderDetail.invoiceIssuedDone'))
    }
  }

  async function submitPayment(event: FormEvent): Promise<void> {
    event.preventDefault()
    if (token === null) return
    setDialogError(null)
    const ok = await run(
      async () => {
        await recordManualPayment(token, id, {
          method: payMethod,
          ...(payNote.trim() === '' ? {} : { note: payNote.trim() }),
        })
      },
      setDialogError,
      'commerceOrderDetail.settleError',
    )
    if (ok) {
      setPayDialog(false)
      setPayNote('')
      setSuccess(t('commerceOrderDetail.paymentRecorded'))
    }
  }

  function openRefund(payment: Payment): void {
    setRefundDialog(payment)
    setRefundAmount(minorToMajorText(Math.max(0, remainingMinor(payment)), payment.currency))
    setRefundReason('')
    setRefundErrors({})
    setDialogError(null)
  }

  async function submitRefund(event: FormEvent): Promise<void> {
    event.preventDefault()
    if (token === null || refundDialog === null) return
    const errors: Record<string, string> = {}
    const amountMinor = majorTextToMinor(refundAmount, refundDialog.currency)
    const remaining = remainingMinor(refundDialog)
    if (amountMinor === null || amountMinor <= 0) {
      errors['amount'] = t('commerceOrderDetail.refundAmountInvalid')
    } else if (amountMinor > remaining) {
      errors['amount'] = t('commerceOrderDetail.refundTooMuch', {
        max: formatMinor(remaining, refundDialog.currency, i18n.language),
      })
    }
    if (refundReason.trim() === '') errors['reason'] = t('commerceOrderDetail.refundReasonRequired')
    setRefundErrors(errors)
    if (Object.keys(errors).length > 0 || amountMinor === null) return
    setDialogError(null)
    const ok = await run(
      async () => {
        await refundPayment(token, refundDialog.id, amountMinor, refundReason.trim())
      },
      setDialogError,
      'commerceOrderDetail.refundError',
    )
    if (ok) {
      setRefundDialog(null)
      setSuccess(
        t('commerceOrderDetail.refundDone', {
          amount: formatMinor(amountMinor, refundDialog.currency, i18n.language),
        }),
      )
    }
  }

  async function saveAddress(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    if (token === null) return
    const errors: Record<string, string> = {}
    if (addressForm.line1.trim() === '') errors['line1'] = t('commerceOrderDetail.required')
    if (addressForm.postalCode.trim() === '')
      errors['postalCode'] = t('commerceOrderDetail.required')
    if (addressForm.city.trim() === '') errors['city'] = t('commerceOrderDetail.required')
    setAddressErrors(errors)
    if (Object.keys(errors).length > 0) return
    setActionError(null)
    const ok = await run(
      async () => {
        await updateOrder(token, id, {
          shippingAddress: {
            line1: addressForm.line1.trim(),
            line2: addressForm.line2.trim() === '' ? null : addressForm.line2.trim(),
            city: addressForm.city.trim(),
            postalCode: addressForm.postalCode.trim(),
            recipient: addressForm.recipient.trim() === '' ? null : addressForm.recipient.trim(),
            phone: addressForm.phone.trim() === '' ? null : addressForm.phone.trim(),
            country: addressForm.country === '' ? null : addressForm.country,
          },
        })
      },
      setActionError,
      'commerceOrderDetail.addressError',
    )
    if (ok) {
      setEditingAddress(false)
      setSuccess(t('commerceOrderDetail.addressSaved'))
    }
  }

  async function saveTracking(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    if (token === null) return
    const errors: Record<string, string> = {}
    if (trackingForm.carrier.trim() === '') errors['carrier'] = t('commerceOrderDetail.required')
    if (trackingForm.number.trim() === '') errors['number'] = t('commerceOrderDetail.required')
    if (trackingForm.url.trim() !== '' && !HTTP_URL.test(trackingForm.url.trim())) {
      errors['url'] = t('commerceOrderDetail.trackingUrlInvalid')
    }
    setTrackingErrors(errors)
    if (Object.keys(errors).length > 0) return
    setActionError(null)
    const ok = await run(
      async () => {
        await setOrderTracking(token, id, {
          carrier: trackingForm.carrier.trim(),
          number: trackingForm.number.trim(),
          ...(trackingForm.url.trim() === '' ? {} : { url: trackingForm.url.trim() }),
        })
      },
      setActionError,
      'commerceOrderDetail.trackingError',
    )
    if (ok) setSuccess(t('commerceOrderDetail.trackingSaved'))
  }

  async function openPdf(kind: 'invoice' | 'preview'): Promise<void> {
    if (token === null) return
    setActionError(null)
    try {
      const blob =
        kind === 'invoice'
          ? await fetchInvoicePdf(token, id)
          : await fetchInvoicePreviewPdf(token, id)
      const url = URL.createObjectURL(blob)
      if (kind === 'invoice') {
        const link = document.createElement('a')
        link.href = url
        link.download = `${detail?.invoice?.number ?? 'invoice'}.pdf`
        link.click()
        setTimeout(() => URL.revokeObjectURL(url), 1000)
      } else {
        window.open(url, '_blank', 'noopener')
        setTimeout(() => URL.revokeObjectURL(url), 60_000)
      }
    } catch (caught) {
      setActionError(
        commerceErrorMessage(
          t,
          caught,
          kind === 'invoice'
            ? 'commerceOrderDetail.invoiceDownloadError'
            : 'commerceOrderDetail.invoicePreviewError',
        ),
      )
    }
  }

  if (!canRead) {
    return (
      <section>
        <PageHeader title={t('commerceOrders.heading')} />
        <p role="alert">{t('commerceOrders.signedInOnly')}</p>
      </section>
    )
  }

  if (loading) return <p>{t('common.loading')}</p>
  if (error !== null || detail === null || order === null) {
    return (
      <section className="flex flex-col gap-4">
        <PageHeader title={t('commerceOrders.heading')} />
        <Link to="/commerce/orders">{t('commerceOrderDetail.back')}</Link>
        <Notice tone="danger" live="assertive">
          <p>{error ?? t('commerceOrderDetail.notFound')}</p>
        </Notice>
      </section>
    )
  }

  const hasAddress =
    order.shippingAddressLine1 !== null ||
    order.shippingCity !== null ||
    order.shippingPostalCode !== null
  const customerName = detail.customer?.name ?? null
  const final = order.status === 'cancelled' || order.status === 'refunded'
  const refundable = paidPayment !== null && remainingMinor(paidPayment) > 0
  const money = (amount: number): string => formatMinor(amount, order.currency, i18n.language)
  const invoicing = detail.invoicing

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <Link to="/commerce/orders">{t('commerceOrderDetail.back')}</Link>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="m-0 text-2xl leading-tight font-bold tracking-tight">
              {t('commerceOrderDetail.heading', { reference: order.reference })}
            </h1>
            <OrderStatusBadge status={order.status} />
          </div>
          <p className="m-0 text-sm text-muted-foreground">
            {customerName !== null && customerName !== '' ? `${customerName} · ` : ''}
            {detail.customer !== null && !detail.customer.anonymized ? (
              <Link to={`/commerce/customers/${encodeURIComponent(detail.customer.id)}`}>
                {order.email}
              </Link>
            ) : (
              order.email
            )}{' '}
            · {new Date(order.placedAt).toLocaleString(i18n.language)}
          </p>
        </div>
        {canWrite && (
          <div className="flex flex-wrap gap-2">
            {order.status === 'pending' && (
              <Button
                onClick={() => {
                  setDialogError(null)
                  setPayDialog(true)
                }}
              >
                {t('commerceOrderDetail.recordPayment')}
              </Button>
            )}
            {order.status === 'paid' && (
              <Button variant="secondary" onClick={() => setPending('ship')}>
                {t('commerceOrderDetail.markShipped')}
              </Button>
            )}
            {order.status === 'shipped' && (
              <Button variant="secondary" onClick={() => setPending('deliver')}>
                {t('commerceOrderDetail.markDelivered')}
              </Button>
            )}
            {canRefund && refundable && paidPayment !== null && (
              <Button variant="secondary" onClick={() => openRefund(paidPayment)}>
                {t('commerceOrderDetail.refund')}
              </Button>
            )}
            {(order.status === 'pending' || order.status === 'paid') && (
              <Button
                variant="secondary"
                className="text-destructive"
                onClick={() => setPending('cancel')}
              >
                {t('commerceOrderDetail.cancelOrder')}
              </Button>
            )}
          </div>
        )}
      </div>

      {success !== null && (
        <Notice tone="success" live="polite">
          <p>{success}</p>
        </Notice>
      )}
      {actionError !== null && (
        <Notice tone="danger" live="assertive">
          <p>{actionError}</p>
        </Notice>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>
              <h2>{t('commerceOrderDetail.customerTitle')}</h2>
            </CardTitle>
          </CardHeader>
          <CardBody className="flex flex-col gap-1 text-sm">
            {customerName !== null && customerName !== '' && (
              <span className="font-medium">{customerName}</span>
            )}
            <span>{order.email}</span>
            {order.couponCode !== null && (
              <span className="text-muted-foreground">
                {t('commerceOrderDetail.couponUsed', { code: order.couponCode })}
              </span>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>
              <h2>{t('commerceOrderDetail.addressTitle')}</h2>
            </CardTitle>
          </CardHeader>
          <CardBody>
            {editingAddress ? (
              <form
                noValidate
                onSubmit={(event) => void saveAddress(event)}
                className="flex flex-col gap-3"
              >
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
                <Field
                  label={t('commerceOrderDetail.addressLine1')}
                  error={addressErrors['line1'] ?? null}
                >
                  {(control) => (
                    <Input
                      {...control}
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
                <div className="grid gap-3 sm:grid-cols-[9rem_1fr]">
                  <Field
                    label={t('commerceOrderDetail.addressPostalCode')}
                    error={addressErrors['postalCode'] ?? null}
                  >
                    {(control) => (
                      <Input
                        {...control}
                        value={addressForm.postalCode}
                        onChange={(event) =>
                          setAddressForm((f) => ({ ...f, postalCode: event.target.value }))
                        }
                      />
                    )}
                  </Field>
                  <Field
                    label={t('commerceOrderDetail.addressCity')}
                    error={addressErrors['city'] ?? null}
                  >
                    {(control) => (
                      <Input
                        {...control}
                        value={addressForm.city}
                        onChange={(event) =>
                          setAddressForm((f) => ({ ...f, city: event.target.value }))
                        }
                      />
                    )}
                  </Field>
                </div>
                <Field label={t('commerceOrderDetail.addressCountry')}>
                  {(control) => (
                    <Select
                      {...control}
                      value={addressForm.country}
                      onChange={(event) =>
                        setAddressForm((f) => ({ ...f, country: event.target.value }))
                      }
                    >
                      <option value="">{t('commerceManualOrder.noCountry')}</option>
                      {countryOptions(i18n.language).map((option) => (
                        <option key={option.code} value={option.code}>
                          {option.name}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>
                <Field label={t('commerceOrderDetail.addressPhone')}>
                  {(control) => (
                    <Input
                      {...control}
                      type="tel"
                      value={addressForm.phone}
                      onChange={(event) =>
                        setAddressForm((f) => ({ ...f, phone: event.target.value }))
                      }
                    />
                  )}
                </Field>
                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => setEditingAddress(false)}
                  >
                    {t('common.cancel')}
                  </Button>
                  <Button type="submit" disabled={busy}>
                    {t('commerceOrderDetail.addressSave')}
                  </Button>
                </div>
              </form>
            ) : (
              <div className="flex flex-wrap items-start justify-between gap-3">
                {hasAddress ? (
                  <p className="m-0 text-sm whitespace-pre-line">
                    {[
                      order.shippingRecipient ?? customerName,
                      order.shippingAddressLine1,
                      order.shippingAddressLine2,
                      [order.shippingPostalCode, order.shippingCity].filter(Boolean).join(' '),
                      order.shippingCountry === null || order.shippingCountry === undefined
                        ? null
                        : countryName(order.shippingCountry, i18n.language),
                      order.shippingPhone,
                    ]
                      .filter((line) => line !== null && line !== '')
                      .join('\n')}
                  </p>
                ) : (
                  <p className="m-0 text-sm text-muted-foreground">
                    {t('commerceOrderDetail.addressNone')}
                    {order.shippingCountry != null && (
                      <span className="block">
                        {t('commerceOrderDetail.zoneLine', {
                          country: countryName(order.shippingCountry, i18n.language),
                        })}
                      </span>
                    )}
                  </p>
                )}
                {order.status === 'pending' && canWrite && (
                  <Button size="sm" variant="secondary" onClick={() => setEditingAddress(true)}>
                    {t('commerceOrderDetail.addressEdit')}
                  </Button>
                )}
              </div>
            )}
            {detail.shippingMethod !== null && (
              <p className="mt-3 mb-0 text-sm text-muted-foreground">
                {t('commerceOrderDetail.shippingMethodUsed', {
                  label: detail.shippingMethod.label,
                })}
              </p>
            )}
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            <h2>{t('commerceOrderDetail.linesTitle')}</h2>
          </CardTitle>
        </CardHeader>
        <CardBody>
          <TableRoot label={t('commerceOrderDetail.linesTitle')} stacked>
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeader>{t('commerceOrderDetail.titleColumn')}</TableHeader>
                  <TableHeader>{t('commerceOrderDetail.unitColumn')}</TableHeader>
                  <TableHeader>{t('commerceOrderDetail.quantityColumn')}</TableHeader>
                  <TableHeader>{t('commerceOrderDetail.totalColumn')}</TableHeader>
                </TableRow>
              </TableHead>
              <TableBody>
                {order.lines.map((line) => {
                  const product = detail.products[line.variantId]
                  return (
                    <TableRow key={line.id}>
                      <TableCell stack="heading">
                        <span className="flex flex-col">
                          <span>{product?.productTitle ?? line.title}</span>
                          <span className="text-xs font-normal text-muted-foreground">
                            {product !== undefined && product.productTitle !== line.title
                              ? `${line.title} · `
                              : ''}
                            {line.sku}
                          </span>
                        </span>
                      </TableCell>
                      <TableCell label={t('commerceOrderDetail.unitColumn')}>
                        {money(line.unitPriceMinor)}
                      </TableCell>
                      <TableCell label={t('commerceOrderDetail.quantityColumn')}>
                        {line.quantity}
                      </TableCell>
                      <TableCell label={t('commerceOrderDetail.totalColumn')}>
                        {money(line.totalMinor)}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </TableRoot>
          <dl className="mt-4 ml-auto flex max-w-sm flex-col gap-1 text-sm">
            <TotalRow
              label={t('commerceOrderDetail.subtotal')}
              value={money(order.subtotalMinor)}
            />
            {order.discountMinor > 0 && (
              <TotalRow
                label={t('commerceOrderDetail.discount')}
                value={`− ${money(order.discountMinor)}`}
              />
            )}
            {(order.shippingMinor > 0 || detail.shippingMethod !== null) && (
              <TotalRow
                label={t('commerceOrderDetail.shipping')}
                value={
                  order.shippingMinor > 0
                    ? money(order.shippingMinor)
                    : t('commerceOrderDetail.free')
                }
              />
            )}
            {order.taxMinor > 0 && (
              <TotalRow label={t('commerceOrderDetail.tax')} value={money(order.taxMinor)} />
            )}
            <TotalRow
              label={t('commerceOrderDetail.orderTotal')}
              value={money(order.totalMinor)}
              strong
            />
          </dl>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            <h2>{t('commerceOrderDetail.paymentsTitle')}</h2>
          </CardTitle>
        </CardHeader>
        <CardBody className="flex flex-col gap-4">
          {detail.payments.length === 0 && (
            <p className="m-0 text-sm text-muted-foreground">
              {t('commerceOrderDetail.noPayments')}
            </p>
          )}
          <ul className="m-0 flex list-none flex-col gap-3 p-0">
            {detail.payments.map((payment) => {
              const refunds = (refundsByPayment[payment.id] ?? []).filter(
                (refund) => refund.status !== 'failed',
              )
              return (
                <li key={payment.id} className="flex flex-col gap-1 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">
                      {payment.driver === 'manual'
                        ? t('commerceOrderDetail.manualPayment')
                        : payment.driver}
                    </span>
                    <span>{formatMinor(payment.amountMinor, payment.currency, i18n.language)}</span>
                    <Badge
                      tone={
                        payment.status === 'paid'
                          ? 'success'
                          : payment.status === 'failed'
                            ? 'danger'
                            : 'warning'
                      }
                    >
                      {t(`commerceOrderDetail.paymentStatus.${payment.status}`)}
                    </Badge>
                    {payment.status === 'pending' && payment.instructions !== null && (
                      <span className="text-xs text-muted-foreground">{payment.instructions}</span>
                    )}
                  </div>
                  {refunds.map((refund) => (
                    <span key={refund.id} className="pl-3 text-muted-foreground">
                      {t('commerceOrderDetail.refundLine', {
                        amount: formatMinor(refund.amountMinor, refund.currency, i18n.language),
                        date: new Date(refund.createdAt).toLocaleDateString(i18n.language),
                        reason: refund.reason ?? '—',
                      })}
                    </span>
                  ))}
                </li>
              )
            })}
          </ul>
          {order.status === 'pending' && canWrite && (
            <div>
              <Button
                variant="secondary"
                onClick={() => {
                  setDialogError(null)
                  setPayDialog(true)
                }}
              >
                {t('commerceOrderDetail.recordPayment')}
              </Button>
            </div>
          )}
          {creditNotes.length > 0 && (
            <p className="m-0 text-sm text-muted-foreground">
              {t('commerceOrderDetail.creditNotesIssued', { count: creditNotes.length })}
              {' : '}
              {creditNotes.map((note) => note.number).join(', ')}
            </p>
          )}
        </CardBody>
      </Card>

      {(order.status === 'paid' || order.status === 'shipped' || order.status === 'delivered') &&
        canWrite && (
          <Card id="tracking">
            <CardHeader>
              <CardTitle>
                <h2>{t('commerceOrderDetail.trackingTitle')}</h2>
              </CardTitle>
            </CardHeader>
            <CardBody className="flex flex-col gap-3">
              {order.trackingNumber !== null && (
                <p className="m-0 text-sm">
                  {t('commerceOrderDetail.trackingCurrent', {
                    carrier: order.trackingCarrier ?? '',
                    number: order.trackingNumber,
                  })}{' '}
                  {order.trackingUrl !== null && HTTP_URL.test(order.trackingUrl) && (
                    <a href={order.trackingUrl} target="_blank" rel="noopener noreferrer">
                      {t('commerceOrderDetail.trackingFollow')}
                    </a>
                  )}
                </p>
              )}
              <form
                noValidate
                onSubmit={(event) => void saveTracking(event)}
                className="grid items-start gap-3 sm:grid-cols-3"
              >
                <Field
                  label={t('commerceOrderDetail.trackingCarrier')}
                  error={trackingErrors['carrier'] ?? null}
                >
                  {(control) => (
                    <Input
                      {...control}
                      value={trackingForm.carrier}
                      onChange={(event) =>
                        setTrackingForm((f) => ({ ...f, carrier: event.target.value }))
                      }
                    />
                  )}
                </Field>
                <Field
                  label={t('commerceOrderDetail.trackingNumber')}
                  error={trackingErrors['number'] ?? null}
                >
                  {(control) => (
                    <Input
                      {...control}
                      value={trackingForm.number}
                      onChange={(event) =>
                        setTrackingForm((f) => ({ ...f, number: event.target.value }))
                      }
                    />
                  )}
                </Field>
                <Field
                  label={t('commerceOrderDetail.trackingUrl')}
                  description={t('commerceOrderDetail.trackingUrlHint')}
                  error={trackingErrors['url'] ?? null}
                >
                  {(control) => (
                    <Input
                      {...control}
                      inputMode="url"
                      value={trackingForm.url}
                      onChange={(event) =>
                        setTrackingForm((f) => ({ ...f, url: event.target.value }))
                      }
                    />
                  )}
                </Field>
                <div className="sm:col-span-3">
                  <Button type="submit" disabled={busy}>
                    {order.status === 'paid'
                      ? t('commerceOrderDetail.trackingShip')
                      : t('commerceOrderDetail.trackingSave')}
                  </Button>
                </div>
              </form>
            </CardBody>
          </Card>
        )}

      {order.status !== 'pending' && invoicing.available && (
        <Card>
          <CardHeader>
            <CardTitle>
              <h2>{t('commerceOrderDetail.invoiceTitle')}</h2>
            </CardTitle>
          </CardHeader>
          <CardBody className="flex flex-col gap-3">
            {detail.invoice !== null ? (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="text-sm">
                  {t('commerceOrderDetail.invoiceIssued', {
                    number: detail.invoice.number,
                    date: new Date(detail.invoice.issuedAt).toLocaleDateString(i18n.language),
                  })}
                </span>
                <Button variant="secondary" onClick={() => void openPdf('invoice')}>
                  {t('commerceOrderDetail.downloadInvoice', { number: detail.invoice.number })}
                </Button>
              </div>
            ) : !invoicing.configured ? (
              <Notice tone="warning" live="off">
                <p className="m-0">
                  {t('commerceOrderDetail.invoiceNotConfigured')}{' '}
                  <Link to="/commerce/settings">{t('commerceOrderDetail.invoiceConfigure')}</Link>
                </p>
              </Notice>
            ) : final ? (
              <p className="m-0 text-sm text-muted-foreground">
                {t('commerceOrderDetail.invoiceNone')}
              </p>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="secondary" onClick={() => void openPdf('preview')}>
                  {t('commerceOrderDetail.previewInvoice')}
                </Button>
                {canWrite && (
                  <Button
                    onClick={() => {
                      setDialogError(null)
                      setPending('invoice')
                    }}
                  >
                    {t('commerceOrderDetail.issueInvoice')}
                  </Button>
                )}
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
            <p className="m-0 text-sm text-muted-foreground">{t('commerceOrderDetail.noEmails')}</p>
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
            {detail.history.map((event) => {
              const described = describeOrderEvent(event, t, paymentMethodLabel)
              return (
                <li key={event.id} className="flex flex-col text-sm">
                  <span>
                    <span className="text-muted-foreground">
                      {new Date(event.at).toLocaleString(i18n.language)}
                    </span>{' '}
                    — {described.title}
                  </span>
                  {described.detail !== null && (
                    <span className="pl-4 text-muted-foreground">« {described.detail} »</span>
                  )}
                </li>
              )
            })}
          </ul>
        </CardBody>
      </Card>

      <ConfirmDialog
        open={pending === 'cancel'}
        title={t('commerceOrderDetail.cancelTitle')}
        confirmLabel={t('commerceOrderDetail.cancelConfirm')}
        busy={busy}
        error={dialogError}
        onCancel={() => setPending(null)}
        onConfirm={() => void transition('cancelled', 'commerceOrderDetail.cancelledDone')}
      >
        <p className="m-0">
          {order.status === 'paid'
            ? t('commerceOrderDetail.cancelPaidBody')
            : t('commerceOrderDetail.cancelBody')}
        </p>
      </ConfirmDialog>

      <ConfirmDialog
        open={pending === 'ship'}
        title={t('commerceOrderDetail.shipTitle')}
        confirmLabel={t('commerceOrderDetail.shipConfirm')}
        destructive={false}
        busy={busy}
        error={dialogError}
        onCancel={() => setPending(null)}
        onConfirm={() => void transition('shipped', 'commerceOrderDetail.shippedDone')}
      >
        <p className="m-0">{t('commerceOrderDetail.shipBody')}</p>
      </ConfirmDialog>

      <ConfirmDialog
        open={pending === 'deliver'}
        title={t('commerceOrderDetail.deliverTitle')}
        confirmLabel={t('commerceOrderDetail.deliverConfirm')}
        destructive={false}
        busy={busy}
        error={dialogError}
        onCancel={() => setPending(null)}
        onConfirm={() => void transition('delivered', 'commerceOrderDetail.deliveredDone')}
      >
        <p className="m-0">{t('commerceOrderDetail.deliverBody')}</p>
      </ConfirmDialog>

      <ConfirmDialog
        open={pending === 'invoice'}
        title={t('commerceOrderDetail.invoiceConfirmTitle')}
        confirmLabel={t('commerceOrderDetail.issueInvoice')}
        destructive={false}
        busy={busy}
        error={dialogError}
        onCancel={() => setPending(null)}
        onConfirm={() => void confirmInvoice()}
      >
        <p className="m-0">{t('commerceOrderDetail.invoiceConfirmBody')}</p>
      </ConfirmDialog>

      <Modal
        open={payDialog}
        onOpenChange={(open) => {
          if (!open) setPayDialog(false)
        }}
        title={t('commerceOrderDetail.recordPaymentTitle')}
        description={t('commerceOrderDetail.recordPaymentBody', {
          amount: money(order.totalMinor),
        })}
        closeLabel={t('common.close')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setPayDialog(false)} disabled={busy}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" form="record-payment-form" disabled={busy}>
              {t('commerceOrderDetail.recordPayment')}
            </Button>
          </>
        }
      >
        <form
          id="record-payment-form"
          noValidate
          onSubmit={(event) => void submitPayment(event)}
          className="flex flex-col gap-4"
        >
          <Field label={t('commerceManualOrder.payMethod')}>
            {(control) => (
              <Select
                {...control}
                value={payMethod}
                onChange={(event) => setPayMethod(event.target.value as ManualPaymentMethod)}
              >
                {MANUAL_PAYMENT_METHODS.map((method) => (
                  <option key={method} value={method}>
                    {t(`commercePaymentMethod.${method}`)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field
            label={t('commerceOrderDetail.paymentNote')}
            description={t('commerceOrderDetail.paymentNoteHint')}
          >
            {(control) => (
              <Input
                {...control}
                value={payNote}
                onChange={(event) => setPayNote(event.target.value)}
              />
            )}
          </Field>
          <DialogError message={dialogError} />
        </form>
      </Modal>

      <Modal
        open={refundDialog !== null}
        onOpenChange={(open) => {
          if (!open) setRefundDialog(null)
        }}
        title={t('commerceOrderDetail.refundTitle')}
        description={
          refundDialog === null
            ? undefined
            : t('commerceOrderDetail.refundBody', {
                max: formatMinor(
                  remainingMinor(refundDialog),
                  refundDialog.currency,
                  i18n.language,
                ),
              })
        }
        closeLabel={t('common.close')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setRefundDialog(null)} disabled={busy}>
              {t('common.cancel')}
            </Button>
            <Button variant="destructive" type="submit" form="refund-form" disabled={busy}>
              {t('commerceOrderDetail.refundConfirm')}
            </Button>
          </>
        }
      >
        <form
          id="refund-form"
          noValidate
          onSubmit={(event) => void submitRefund(event)}
          className="flex flex-col gap-4"
        >
          <Field
            label={t('commerceOrderDetail.refundAmount')}
            description={t('commerceOrderDetail.refundAmountHint')}
            error={refundErrors['amount'] ?? null}
          >
            {(control) => (
              <Input
                {...control}
                inputMode="decimal"
                value={refundAmount}
                onChange={(event) => setRefundAmount(event.target.value)}
              />
            )}
          </Field>
          <Field
            label={t('commerceOrderDetail.refundReason')}
            error={refundErrors['reason'] ?? null}
          >
            {(control) => (
              <Input
                {...control}
                value={refundReason}
                onChange={(event) => setRefundReason(event.target.value)}
              />
            )}
          </Field>
          <DialogError message={dialogError} />
        </form>
      </Modal>
    </section>
  )
}

function TotalRow({
  label,
  value,
  strong = false,
}: {
  readonly label: string
  readonly value: string
  readonly strong?: boolean
}): JSX.Element {
  return (
    <div
      className={`flex justify-between gap-6 ${strong ? 'border-t border-border pt-2 font-semibold' : ''}`}
    >
      <dt className="m-0">{label}</dt>
      <dd className="m-0 tabular-nums">{value}</dd>
    </div>
  )
}

interface AddressForm {
  readonly line1: string
  readonly line2: string
  readonly city: string
  readonly postalCode: string
  readonly recipient: string
  readonly phone: string
  readonly country: string
}

const EMPTY_ADDRESS: AddressForm = {
  line1: '',
  line2: '',
  city: '',
  postalCode: '',
  recipient: '',
  phone: '',
  country: '',
}

interface TrackingForm {
  readonly carrier: string
  readonly number: string
  readonly url: string
}

const EMPTY_TRACKING: TrackingForm = { carrier: '', number: '', url: '' }
