import { type JSX, useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router'
import {
  type ChangePlanResult,
  cancelSubscription,
  changeSubscriptionPlan,
  pauseSubscription,
  readSubscription,
  resumeSubscription,
  type Subscription,
  type SubscriptionCustomer,
  type SubscriptionCycle,
  type SubscriptionDunning,
  type SubscriptionVariantSummary,
  setSubscriptionNextBilling,
  type VariantSearchHit,
} from '../api/commerce-client.js'
import { ApiError } from '../api/http.js'
import { useAuth } from '../auth/auth-context.js'
import { commerceErrorMessage } from '../commerce/commerce-errors.js'
import { ConfirmDialog } from '../commerce/confirm-dialog.js'
import { DialogError } from '../commerce/dialog-error.js'
import { formatMinor } from '../commerce/money.js'
import { SubscriptionStatusBadge } from '../commerce/subscription-status.js'
import { VariantPicker } from '../commerce/variant-picker.js'
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
  Table,
  TableBody,
  TableCell,
  TableEmpty,
  TableHead,
  TableHeader,
  TableRoot,
  TableRow,
} from '../ui/index.js'

function toDateInput(iso: string): string {
  const date = new Date(iso)
  const pad = (value: number): string => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

type Pending = 'cancel' | 'pause' | null

/**
 * One subscription, in full: who, what, how often, when the next charge falls,
 * the billing history with the orders it produced, and the actions — pause,
 * resume (which keeps the next charge date), move the next charge, change the
 * plan (with the prorated amount shown *before* anything is charged) and end.
 */
export function CommerceSubscriptionDetailRoute(): JSX.Element {
  const { t, i18n } = useTranslation()
  const { id = '' } = useParams<{ id: string }>()
  const auth = useAuth()
  const token = auth.state.status === 'authenticated' ? auth.state.token : null
  const roles = auth.state.status === 'authenticated' ? auth.state.user.roles : []
  const canRead = roles.length > 0
  const canWrite = roles.includes('admin') || roles.includes('shopkeeper')

  const [subscription, setSubscription] = useState<Subscription | null>(null)
  const [cycles, setCycles] = useState<readonly SubscriptionCycle[]>([])
  const [dunning, setDunning] = useState<SubscriptionDunning | null>(null)
  const [orders, setOrders] = useState<Readonly<Record<string, { id: string; reference: string }>>>(
    {},
  )
  const [customer, setCustomer] = useState<SubscriptionCustomer | null>(null)
  const [variant, setVariant] = useState<SubscriptionVariantSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [pending, setPending] = useState<Pending>(null)
  const [dialogError, setDialogError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const [dateDialog, setDateDialog] = useState(false)
  const [dateValue, setDateValue] = useState('')
  const [dateError, setDateError] = useState<string | null>(null)

  const [planDialog, setPlanDialog] = useState(false)
  const [planHit, setPlanHit] = useState<VariantSearchHit | null>(null)
  const [planQuantity, setPlanQuantity] = useState('1')
  const [prorate, setProrate] = useState(true)
  const [planPreview, setPlanPreview] = useState<ChangePlanResult | null>(null)
  const [planErrors, setPlanErrors] = useState<Readonly<Record<string, string>>>({})
  const [planError, setPlanError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (token === null || !canRead || id === '') return
    setError(null)
    setNotFound(false)
    try {
      const result = await readSubscription(token, id)
      setSubscription(result.subscription)
      setCycles(result.cycles)
      setDunning(result.dunning)
      setOrders(result.orders ?? {})
      setCustomer(result.customers?.[result.subscription.customerId] ?? null)
      setVariant(result.variants?.[result.subscription.variantId] ?? null)
    } catch (caught) {
      if (caught instanceof ApiError && caught.code === 'COMMERCE_SUBSCRIPTION_NOT_FOUND') {
        setNotFound(true)
      } else {
        setError(commerceErrorMessage(t, caught, 'commerceSubscriptionDetail.loadError'))
      }
    } finally {
      setLoading(false)
    }
  }, [token, canRead, id, t])

  useEffect(() => {
    void load()
  }, [load])

  async function act(
    action: () => Promise<unknown>,
    fallback: string,
    successKey: string,
    onError: (message: string) => void = setActionError,
  ): Promise<boolean> {
    setBusy(true)
    setActionError(null)
    try {
      await action()
      setSuccess(t(successKey))
      await load()
      return true
    } catch (caught) {
      onError(commerceErrorMessage(t, caught, fallback))
      return false
    } finally {
      setBusy(false)
    }
  }

  async function confirmPending(): Promise<void> {
    if (token === null || pending === null) return
    setDialogError(null)
    const ok =
      pending === 'cancel'
        ? await act(
            () => cancelSubscription(token, id),
            'commerceSubscriptions.cancelError',
            'commerceSubscriptions.cancelledDone',
            setDialogError,
          )
        : await act(
            () => pauseSubscription(token, id),
            'commerceSubscriptions.pauseError',
            'commerceSubscriptions.pausedDone',
            setDialogError,
          )
    if (ok) setPending(null)
  }

  async function saveDate(): Promise<void> {
    if (token === null || subscription === null) return
    if (dateValue === '') {
      setDateError(t('commerceSubscriptionDetail.dateRequired'))
      return
    }
    if (dateValue < toDateInput(new Date().toISOString())) {
      setDateError(t('commerceSubscriptionDetail.datePast'))
      return
    }
    setDateError(null)
    const ok = await act(
      () => setSubscriptionNextBilling(token, id, dateValue),
      'commerceSubscriptionDetail.dateError',
      'commerceSubscriptionDetail.dateSaved',
      setDateError,
    )
    if (ok) setDateDialog(false)
  }

  function openPlan(): void {
    if (subscription === null) return
    setPlanDialog(true)
    setPlanHit(null)
    setPlanQuantity(String(subscription.quantity))
    setProrate(true)
    setPlanPreview(null)
    setPlanErrors({})
    setPlanError(null)
  }

  async function runPlan(dryRun: boolean): Promise<void> {
    if (token === null || subscription === null) return
    const found: Record<string, string> = {}
    if (planHit === null) found['variant'] = t('commerceNewSubscription.variantRequired')
    else if (planHit.variant.currency !== subscription.currency) {
      found['variant'] = t('commerceSubscriptionDetail.currencyMismatch', {
        currency: subscription.currency,
      })
    }
    const quantity = Number(planQuantity.trim())
    if (!Number.isInteger(quantity) || quantity < 1) {
      found['quantity'] = t('commerceManualOrder.quantityInvalid')
    }
    setPlanErrors(found)
    if (Object.keys(found).length > 0 || planHit === null) return
    setBusy(true)
    setPlanError(null)
    try {
      const result = await changeSubscriptionPlan(token, id, {
        variantId: planHit.variant.id,
        quantity,
        prorate,
        dryRun,
      })
      if (dryRun) {
        setPlanPreview(result)
      } else {
        setPlanDialog(false)
        setSuccess(
          result.prorationMinor > 0
            ? t('commerceSubscriptionDetail.changePlanChargedResult', {
                amount: formatMinor(result.prorationMinor, subscription.currency, i18n.language),
              })
            : result.prorationMinor < 0
              ? t('commerceSubscriptionDetail.changePlanCreditResult', {
                  amount: formatMinor(
                    Math.abs(result.prorationMinor),
                    subscription.currency,
                    i18n.language,
                  ),
                })
              : t('commerceSubscriptionDetail.changePlanNoChargeResult'),
        )
        await load()
      }
    } catch (caught) {
      setPlanError(commerceErrorMessage(t, caught, 'commerceSubscriptionDetail.changePlanError'))
    } finally {
      setBusy(false)
    }
  }

  if (!canRead) {
    return (
      <section aria-labelledby="commerce-subscription-detail-heading">
        <h1 id="commerce-subscription-detail-heading">
          {t('commerceSubscriptions.detailHeading')}
        </h1>
        <p role="alert">{t('commerceSubscriptions.signedInOnly')}</p>
      </section>
    )
  }

  if (loading) return <p>{t('common.loading')}</p>

  if (error !== null) {
    return (
      <section className="flex flex-col gap-4">
        <PageHeader title={t('commerceSubscriptions.detailHeading')} />
        <Link to="/commerce/subscriptions">{t('commerceSubscriptionDetail.back')}</Link>
        <Notice tone="danger" live="assertive">
          <p>{error}</p>
        </Notice>
      </section>
    )
  }

  if (notFound || subscription === null) {
    return (
      <section className="flex flex-col gap-4">
        <PageHeader title={t('commerceSubscriptions.detailHeading')} />
        <Link to="/commerce/subscriptions">{t('commerceSubscriptionDetail.back')}</Link>
        <Notice tone="warning" live="polite">
          <p>{t('commerceSubscriptionDetail.notFound')}</p>
        </Notice>
      </section>
    )
  }

  const customerName =
    customer === null
      ? t('commerceSubscriptions.unknownCustomer')
      : customer.name !== null && customer.name !== ''
        ? customer.name
        : customer.email
  const money = (amount: number): string =>
    formatMinor(amount, subscription.currency, i18n.language)
  const active = subscription.status !== 'cancelled'
  const origin = subscription.originOrderId == null ? undefined : orders[subscription.originOrderId]

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <Link to="/commerce/subscriptions">{t('commerceSubscriptionDetail.back')}</Link>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="m-0 text-2xl leading-tight font-bold tracking-tight">
              {t('commerceSubscriptionDetail.heading', { name: customerName })}
            </h1>
            <SubscriptionStatusBadge status={subscription.status} />
          </div>
          {customer !== null && customerName !== customer.email && (
            <p className="m-0 text-sm text-muted-foreground">{customer.email}</p>
          )}
        </div>
        {canWrite && active && (
          <div className="flex flex-wrap gap-2">
            {(subscription.status === 'active' || subscription.status === 'past_due') && (
              <Button
                variant="secondary"
                onClick={() => {
                  setDialogError(null)
                  setPending('pause')
                }}
              >
                {t('commerceSubscriptions.pause')}
              </Button>
            )}
            {subscription.status === 'paused' && (
              <Button
                variant="secondary"
                disabled={busy}
                onClick={() =>
                  token !== null &&
                  void act(
                    () => resumeSubscription(token, id),
                    'commerceSubscriptions.resumeError',
                    'commerceSubscriptions.resumedDone',
                  )
                }
              >
                {t('commerceSubscriptions.resume')}
              </Button>
            )}
            <Button variant="secondary" onClick={openPlan}>
              {t('commerceSubscriptionDetail.changePlanOpen')}
            </Button>
            <Button
              variant="secondary"
              className="text-destructive"
              onClick={() => {
                setDialogError(null)
                setPending('cancel')
              }}
            >
              {t('commerceSubscriptions.end')}
            </Button>
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
      {dunning !== null && (
        <Notice tone={dunning.suspendedAt !== null ? 'danger' : 'warning'} live="polite">
          <p>
            {dunning.suspendedAt !== null
              ? t('commerceSubscriptions.dunningSuspended', { count: dunning.failureCount })
              : t('commerceSubscriptions.dunningInProgress', {
                  count: dunning.failureCount,
                  reason: dunning.lastReason ?? '',
                })}
          </p>
        </Notice>
      )}

      <Card>
        <CardHeader>
          <CardTitle>
            <h2>{t('commerceSubscriptionDetail.summaryTitle')}</h2>
          </CardTitle>
        </CardHeader>
        <CardBody>
          <dl className="m-0 grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-muted-foreground">{t('commerceSubscriptions.productColumn')}</dt>
              <dd className="m-0 font-medium">
                {variant === null ? (
                  '—'
                ) : (
                  <>
                    {variant.productTitle}
                    <span className="block text-xs font-normal text-muted-foreground">
                      {variant.title} · {variant.sku}
                      {subscription.quantity > 1 && ` × ${subscription.quantity}`}
                    </span>
                  </>
                )}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">{t('commerceSubscriptions.amountColumn')}</dt>
              <dd className="m-0 font-medium">
                {money(subscription.priceMinor * subscription.quantity)} /{' '}
                {t(`commerceSubscriptions.interval.${subscription.intervalUnit}`, {
                  count: subscription.intervalCount,
                })}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">
                {t('commerceSubscriptions.nextBillingColumn')}
              </dt>
              <dd className="m-0 flex flex-wrap items-center gap-2 font-medium">
                {active
                  ? new Date(subscription.nextBillingAt).toLocaleDateString(i18n.language)
                  : '—'}
                {canWrite && active && subscription.status !== 'paused' && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setDateValue(toDateInput(subscription.nextBillingAt))
                      setDateError(null)
                      setDateDialog(true)
                    }}
                  >
                    {t('commerceSubscriptionDetail.dateChange')}
                  </Button>
                )}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">
                {t('commerceSubscriptionDetail.startedLabel')}
              </dt>
              <dd className="m-0 font-medium">
                {new Date(subscription.createdAt).toLocaleDateString(i18n.language)}
                {origin !== undefined && (
                  <span className="block text-xs font-normal text-muted-foreground">
                    {t('commerceSubscriptionDetail.fromOrder')}{' '}
                    <Link to={`/commerce/orders/${encodeURIComponent(origin.id)}`}>
                      {origin.reference}
                    </Link>
                  </span>
                )}
              </dd>
            </div>
          </dl>
        </CardBody>
      </Card>

      <div>
        <h2 className="m-0 mb-2 text-sm font-semibold">
          {t('commerceSubscriptions.billingHistoryHeading')}
        </h2>
        <TableRoot label={t('commerceSubscriptions.billingHistoryHeading')} stacked>
          <Table>
            <TableHead>
              <TableRow>
                <TableHeader>{t('commerceSubscriptions.periodColumn')}</TableHeader>
                <TableHeader>{t('commerceSubscriptions.cycleStatusColumn')}</TableHeader>
                <TableHeader>{t('commerceSubscriptions.cycleOrderColumn')}</TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {cycles.map((cycle) => {
                const order = cycle.orderId === null ? undefined : orders[cycle.orderId]
                return (
                  <TableRow key={cycle.id}>
                    <TableCell stack="heading">
                      {new Date(cycle.periodStart).toLocaleDateString(i18n.language)}
                      {' → '}
                      {new Date(cycle.periodEnd).toLocaleDateString(i18n.language)}
                    </TableCell>
                    <TableCell label={t('commerceSubscriptions.cycleStatusColumn')}>
                      <Badge tone={cycle.status === 'billed' ? 'success' : 'warning'}>
                        {t(`commerceSubscriptions.cycleStatus.${cycle.status}`)}
                      </Badge>
                    </TableCell>
                    <TableCell label={t('commerceSubscriptions.cycleOrderColumn')}>
                      {order === undefined ? (
                        '—'
                      ) : (
                        <Link to={`/commerce/orders/${encodeURIComponent(order.id)}`}>
                          {order.reference}
                        </Link>
                      )}
                    </TableCell>
                  </TableRow>
                )
              })}
              {cycles.length === 0 && (
                <TableEmpty colSpan={3}>{t('commerceSubscriptions.noHistory')}</TableEmpty>
              )}
            </TableBody>
          </Table>
        </TableRoot>
      </div>

      <ConfirmDialog
        open={pending === 'cancel'}
        title={t('commerceSubscriptions.endTitle')}
        confirmLabel={t('commerceSubscriptions.endConfirm')}
        busy={busy}
        error={dialogError}
        onCancel={() => setPending(null)}
        onConfirm={() => void confirmPending()}
      >
        <p className="m-0">{t('commerceSubscriptions.endBody', { name: customerName })}</p>
      </ConfirmDialog>

      <ConfirmDialog
        open={pending === 'pause'}
        title={t('commerceSubscriptions.pauseTitle')}
        confirmLabel={t('commerceSubscriptions.pause')}
        destructive={false}
        busy={busy}
        error={dialogError}
        onCancel={() => setPending(null)}
        onConfirm={() => void confirmPending()}
      >
        <p className="m-0">{t('commerceSubscriptions.pauseBody', { name: customerName })}</p>
      </ConfirmDialog>

      <Modal
        open={dateDialog}
        onOpenChange={(open) => {
          if (!open) setDateDialog(false)
        }}
        title={t('commerceSubscriptionDetail.dateTitle')}
        description={t('commerceSubscriptionDetail.dateBody')}
        closeLabel={t('common.close')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDateDialog(false)} disabled={busy}>
              {t('common.cancel')}
            </Button>
            <Button onClick={() => void saveDate()} disabled={busy}>
              {t('common.save')}
            </Button>
          </>
        }
      >
        <Field label={t('commerceSubscriptionDetail.dateLabel')} error={dateError}>
          {(control) => (
            <Input
              {...control}
              type="date"
              value={dateValue}
              onChange={(event) => setDateValue(event.target.value)}
            />
          )}
        </Field>
      </Modal>

      <Modal
        open={planDialog}
        onOpenChange={(open) => {
          if (!open) setPlanDialog(false)
        }}
        title={t('commerceSubscriptionDetail.changePlanHeading')}
        description={t('commerceSubscriptionDetail.changePlanIntro')}
        closeLabel={t('common.close')}
        className="w-[min(36rem,calc(100vw-2rem))]"
        footer={
          <>
            <Button variant="secondary" onClick={() => setPlanDialog(false)} disabled={busy}>
              {t('common.cancel')}
            </Button>
            {planPreview === null ? (
              <Button onClick={() => void runPlan(true)} disabled={busy}>
                {t('commerceSubscriptionDetail.changePlanSubmit')}
              </Button>
            ) : (
              <Button onClick={() => void runPlan(false)} disabled={busy}>
                {t('commerceSubscriptionDetail.changePlanConfirmButton')}
              </Button>
            )}
          </>
        }
      >
        <div className="flex flex-col gap-4">
          {token !== null && (
            <VariantPicker
              token={token}
              label={t('commerceSubscriptionDetail.changePlanProductLabel')}
              selected={planHit}
              error={planErrors['variant'] ?? null}
              onSelect={(hit) => {
                setPlanHit(hit)
                setPlanPreview(null)
              }}
            />
          )}
          <div className="grid items-start gap-4 sm:grid-cols-2">
            <Field
              label={t('commerceSubscriptionDetail.changePlanQuantityLabel')}
              error={planErrors['quantity'] ?? null}
            >
              {(control) => (
                <Input
                  {...control}
                  inputMode="numeric"
                  value={planQuantity}
                  onChange={(event) => {
                    setPlanQuantity(event.target.value)
                    setPlanPreview(null)
                  }}
                />
              )}
            </Field>
            <label className="mt-7 flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={prorate}
                onChange={(event) => {
                  setProrate(event.target.checked)
                  setPlanPreview(null)
                }}
              />
              {t('commerceSubscriptionDetail.changePlanProrateLabel')}
            </label>
          </div>
          {planPreview !== null && (
            <Notice tone={planPreview.prorationMinor < 0 ? 'warning' : 'info'} live="polite">
              <p>
                {planPreview.prorationMinor > 0
                  ? t('commerceSubscriptionDetail.previewCharge', {
                      amount: money(planPreview.prorationMinor),
                    })
                  : planPreview.prorationMinor < 0
                    ? t('commerceSubscriptionDetail.previewCredit', {
                        amount: money(Math.abs(planPreview.prorationMinor)),
                      })
                    : t('commerceSubscriptionDetail.previewNothing')}
              </p>
            </Notice>
          )}
          <DialogError message={planError} />
        </div>
      </Modal>
    </section>
  )
}
