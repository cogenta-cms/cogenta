import { type JSX, useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import {
  cancelSubscription,
  getSubscriptionMetrics,
  listSubscriptions,
  pauseSubscription,
  resumeSubscription,
  type Subscription,
  type SubscriptionCustomer,
  type SubscriptionMetrics,
  type SubscriptionStatus,
  type SubscriptionVariantSummary,
} from '../api/commerce-client.js'
import { useAuth } from '../auth/auth-context.js'
import { commerceErrorMessage } from '../commerce/commerce-errors.js'
import { ConfirmDialog } from '../commerce/confirm-dialog.js'
import { formatMinor } from '../commerce/money.js'
import { NewSubscriptionModal } from '../commerce/new-subscription-modal.js'
import { SubscriptionStatusBadge } from '../commerce/subscription-status.js'
import {
  Button,
  Field,
  Notice,
  Select,
  Stat,
  Table,
  TableBody,
  TableCell,
  TableEmpty,
  TableHead,
  TableHeader,
  TableRoot,
  TableRow,
} from '../ui/index.js'

const STATUSES: readonly SubscriptionStatus[] = ['active', 'past_due', 'paused', 'cancelled']

/**
 * Subscriptions — contract E's back office (ADR-0024). A subscription opens
 * when an order for a recurring product is paid, or by hand from here; this
 * screen then pauses, resumes and ends them, always naming the person and the
 * product rather than showing identifiers.
 */
export function CommerceSubscriptionsRoute(): JSX.Element {
  const { t, i18n } = useTranslation()
  const auth = useAuth()
  const token = auth.state.status === 'authenticated' ? auth.state.token : null
  const roles = auth.state.status === 'authenticated' ? auth.state.user.roles : []
  const canRead = roles.length > 0
  const canWrite = roles.includes('admin') || roles.includes('shopkeeper')

  const [subscriptions, setSubscriptions] = useState<readonly Subscription[]>([])
  const [customers, setCustomers] = useState<Readonly<Record<string, SubscriptionCustomer>>>({})
  const [variants, setVariants] = useState<Readonly<Record<string, SubscriptionVariantSummary>>>({})
  const [metrics, setMetrics] = useState<SubscriptionMetrics | null>(null)
  const [statusFilter, setStatusFilter] = useState<SubscriptionStatus | ''>('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [toCancel, setToCancel] = useState<Subscription | null>(null)
  const [dialogError, setDialogError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    if (token === null || !canRead) return
    setError(null)
    try {
      const response = await listSubscriptions(
        token,
        statusFilter === '' ? undefined : statusFilter,
      )
      setSubscriptions(response.subscriptions)
      setCustomers(response.customers ?? {})
      setVariants(response.variants ?? {})
      // Best-effort: a metrics failure must not stop the list itself.
      await getSubscriptionMetrics(token)
        .then(setMetrics)
        .catch(() => setMetrics(null))
    } catch (caught) {
      setError(commerceErrorMessage(t, caught, 'commerceSubscriptions.loadError'))
    } finally {
      setLoading(false)
    }
  }, [token, canRead, statusFilter, t])

  useEffect(() => {
    void load()
  }, [load])

  async function simple(
    action: (token: string, id: string) => Promise<unknown>,
    subscription: Subscription,
    fallback: string,
    successKey: string,
  ): Promise<void> {
    if (token === null) return
    setActionError(null)
    try {
      await action(token, subscription.id)
      setSuccess(t(successKey))
      await load()
    } catch (caught) {
      setActionError(commerceErrorMessage(t, caught, fallback))
    }
  }

  async function confirmCancel(): Promise<void> {
    if (token === null || toCancel === null) return
    setBusy(true)
    setDialogError(null)
    try {
      await cancelSubscription(token, toCancel.id)
      setToCancel(null)
      setSuccess(t('commerceSubscriptions.cancelledDone'))
      await load()
    } catch (caught) {
      setDialogError(commerceErrorMessage(t, caught, 'commerceSubscriptions.cancelError'))
    } finally {
      setBusy(false)
    }
  }

  if (!canRead) {
    return (
      <section aria-labelledby="commerce-subscriptions-heading">
        <h1 id="commerce-subscriptions-heading">{t('commerceSubscriptions.heading')}</h1>
        <p role="alert">{t('commerceSubscriptions.signedInOnly')}</p>
      </section>
    )
  }

  const customerLabel = (id: string): { name: string; email: string | null } => {
    const customer = customers[id]
    if (customer === undefined)
      return { name: t('commerceSubscriptions.unknownCustomer'), email: null }
    return customer.name !== null && customer.name !== ''
      ? { name: customer.name, email: customer.email }
      : { name: customer.email, email: null }
  }

  return (
    <section aria-labelledby="commerce-subscriptions-heading" className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1
          id="commerce-subscriptions-heading"
          className="m-0 text-2xl leading-tight font-bold tracking-tight"
        >
          {t('commerceSubscriptions.heading')}
        </h1>
        {canWrite && (
          <Button onClick={() => setCreating(true)}>{t('commerceSubscriptions.newButton')}</Button>
        )}
      </div>

      {metrics !== null && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label={t('commerceSubscriptions.metricsActive')} value={String(metrics.active)} />
          <Stat
            label={t('commerceSubscriptions.metricsMrr')}
            hint={t('commerceSubscriptions.metricsMrrHint')}
            value={
              metrics.mrrMinor.length === 0
                ? '—'
                : metrics.mrrMinor
                    .map((entry) => formatMinor(entry.amountMinor, entry.currency, i18n.language))
                    .join(' + ')
            }
          />
          <Stat
            label={t('commerceSubscriptions.metricsPastDue')}
            value={String(metrics.pastDue)}
            tone={metrics.pastDue > 0 ? 'warning' : 'default'}
          />
          <Stat
            label={t('commerceSubscriptions.metricsChurn')}
            hint={t('commerceSubscriptions.metricsChurnHint')}
            value={`${(metrics.churnRate * 100).toLocaleString(i18n.language, {
              maximumFractionDigits: 1,
            })} %`}
          />
        </div>
      )}

      <div className="max-w-xs">
        <Field label={t('commerceSubscriptions.statusFilter')}>
          {(control) => (
            <Select
              {...control}
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as SubscriptionStatus | '')}
            >
              <option value="">{t('commerceSubscriptions.allStatuses')}</option>
              {STATUSES.map((status) => (
                <option key={status} value={status}>
                  {t(`commerceSubscriptions.status.${status}`)}
                </option>
              ))}
            </Select>
          )}
        </Field>
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
      {error !== null && (
        <Notice tone="danger" live="assertive">
          <p>{error}</p>
        </Notice>
      )}
      {loading && <p>{t('common.loading')}</p>}

      {!loading && error === null && (
        <TableRoot label={t('commerceSubscriptions.tableLabel')} stacked>
          <Table>
            <TableHead>
              <TableRow>
                <TableHeader>{t('commerceSubscriptions.customerColumn')}</TableHeader>
                <TableHeader>{t('commerceSubscriptions.productColumn')}</TableHeader>
                <TableHeader>{t('commerceSubscriptions.statusColumn')}</TableHeader>
                <TableHeader>{t('commerceSubscriptions.nextBillingColumn')}</TableHeader>
                <TableHeader>{t('commerceSubscriptions.amountColumn')}</TableHeader>
                <TableHeader>{t('commerceSubscriptions.actionsColumn')}</TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {subscriptions.map((subscription) => {
                const who = customerLabel(subscription.customerId)
                const variant = variants[subscription.variantId]
                return (
                  <TableRow key={subscription.id}>
                    <TableCell stack="heading">
                      <span className="flex flex-col">
                        <Link to={`/commerce/subscriptions/${encodeURIComponent(subscription.id)}`}>
                          {who.name}
                        </Link>
                        {who.email !== null && (
                          <span className="text-xs font-normal text-muted-foreground">
                            {who.email}
                          </span>
                        )}
                      </span>
                    </TableCell>
                    <TableCell label={t('commerceSubscriptions.productColumn')}>
                      {variant === undefined ? (
                        '—'
                      ) : (
                        <span className="flex flex-col">
                          <span>{variant.productTitle}</span>
                          <span className="text-xs text-muted-foreground">
                            {variant.title}
                            {subscription.quantity > 1 && ` × ${subscription.quantity}`}
                          </span>
                        </span>
                      )}
                    </TableCell>
                    <TableCell label={t('commerceSubscriptions.statusColumn')}>
                      <SubscriptionStatusBadge status={subscription.status} />
                    </TableCell>
                    <TableCell label={t('commerceSubscriptions.nextBillingColumn')}>
                      {subscription.status === 'cancelled'
                        ? '—'
                        : new Date(subscription.nextBillingAt).toLocaleDateString(i18n.language)}
                    </TableCell>
                    <TableCell label={t('commerceSubscriptions.amountColumn')}>
                      {formatMinor(
                        subscription.priceMinor * subscription.quantity,
                        subscription.currency,
                        i18n.language,
                      )}{' '}
                      /{' '}
                      {t(`commerceSubscriptions.interval.${subscription.intervalUnit}`, {
                        count: subscription.intervalCount,
                      })}
                    </TableCell>
                    <TableCell stack="actions">
                      <div className="flex flex-wrap gap-2">
                        <Link
                          to={`/commerce/subscriptions/${encodeURIComponent(subscription.id)}`}
                          className="inline-flex h-8 items-center rounded-full border border-border bg-card px-3 text-xs font-medium text-card-foreground no-underline hover:bg-accent"
                        >
                          {t('commerceSubscriptions.viewDetail')}
                        </Link>
                        {canWrite &&
                          (subscription.status === 'active' ||
                            subscription.status === 'past_due') && (
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() =>
                                void simple(
                                  pauseSubscription,
                                  subscription,
                                  'commerceSubscriptions.pauseError',
                                  'commerceSubscriptions.pausedDone',
                                )
                              }
                            >
                              {t('commerceSubscriptions.pause')}
                            </Button>
                          )}
                        {canWrite && subscription.status === 'paused' && (
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() =>
                              void simple(
                                resumeSubscription,
                                subscription,
                                'commerceSubscriptions.resumeError',
                                'commerceSubscriptions.resumedDone',
                              )
                            }
                          >
                            {t('commerceSubscriptions.resume')}
                          </Button>
                        )}
                        {canWrite && subscription.status !== 'cancelled' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive"
                            onClick={() => {
                              setDialogError(null)
                              setToCancel(subscription)
                            }}
                          >
                            {t('commerceSubscriptions.end')}
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
              {subscriptions.length === 0 && (
                <TableEmpty colSpan={6}>
                  <span className="flex flex-col items-center gap-1">
                    <span>{t('commerceSubscriptions.empty')}</span>
                    <span className="max-w-xl text-xs">{t('commerceSubscriptions.emptyHelp')}</span>
                  </span>
                </TableEmpty>
              )}
            </TableBody>
          </Table>
        </TableRoot>
      )}

      {token !== null && (
        <NewSubscriptionModal
          open={creating}
          token={token}
          onClose={() => setCreating(false)}
          onCreated={() => {
            setCreating(false)
            setSuccess(t('commerceSubscriptions.createdDone'))
            void load()
          }}
        />
      )}

      <ConfirmDialog
        open={toCancel !== null}
        title={t('commerceSubscriptions.endTitle')}
        confirmLabel={t('commerceSubscriptions.endConfirm')}
        busy={busy}
        error={dialogError}
        onCancel={() => setToCancel(null)}
        onConfirm={() => void confirmCancel()}
      >
        <p className="m-0">
          {t('commerceSubscriptions.endBody', {
            name: toCancel === null ? '' : customerLabel(toCancel.customerId).name,
          })}
        </p>
      </ConfirmDialog>
    </section>
  )
}
