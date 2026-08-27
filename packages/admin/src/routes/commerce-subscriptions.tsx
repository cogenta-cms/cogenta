import { type JSX, useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  cancelSubscription,
  getSubscriptionMetrics,
  listSubscriptions,
  pauseSubscription,
  readSubscription,
  resumeSubscription,
  type Subscription,
  type SubscriptionCycle,
  type SubscriptionDunning,
  type SubscriptionMetrics,
  type SubscriptionStatus,
} from '../api/commerce-client.js'
import { ApiError } from '../api/http.js'
import { useAuth } from '../auth/auth-context.js'
import { formatMinor } from '../commerce/money.js'
import {
  Button,
  Field,
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

const STATUSES: readonly SubscriptionStatus[] = ['active', 'past_due', 'paused', 'cancelled']

/**
 * Subscriptions — contract E's back office (ADR-0024), from the admin.
 *
 * Fiche 53 task 1: pause, resume and billing history were already routed
 * server-side (`SubscriptionStore.pause`/`resume`/`cycles`) but never
 * exposed here — only cancellation was. This screen now exposes all three,
 * plus the open dunning cycle (task 3) a subscription's own detail carries.
 */
export function CommerceSubscriptionsRoute(): JSX.Element {
  const { t, i18n } = useTranslation()
  const auth = useAuth()
  const token = auth.state.status === 'authenticated' ? auth.state.token : null
  const roles = auth.state.status === 'authenticated' ? auth.state.user.roles : []
  const canRead = roles.length > 0

  const [subscriptions, setSubscriptions] = useState<readonly Subscription[]>([])
  const [metrics, setMetrics] = useState<SubscriptionMetrics | null>(null)
  const [statusFilter, setStatusFilter] = useState<SubscriptionStatus | ''>('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const [detailId, setDetailId] = useState<string | null>(null)
  const [detailCycles, setDetailCycles] = useState<readonly SubscriptionCycle[]>([])
  const [detailDunning, setDetailDunning] = useState<SubscriptionDunning | null>(null)
  const [detailError, setDetailError] = useState<string | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  const load = useCallback(async () => {
    if (token === null || !canRead) return
    setLoading(true)
    setError(null)
    try {
      const { subscriptions: list } = await listSubscriptions(
        token,
        statusFilter === '' ? undefined : statusFilter,
      )
      setSubscriptions(list)
      // Best-effort: a metrics failure must not stop the subscription list
      // itself from loading, so it is fetched and swallowed separately.
      await getSubscriptionMetrics(token)
        .then(setMetrics)
        .catch(() => setMetrics(null))
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : t('commerceSubscriptions.loadError'))
    } finally {
      setLoading(false)
    }
  }, [token, canRead, statusFilter, t])

  useEffect(() => {
    void load()
  }, [load])

  async function pause(subscription: Subscription): Promise<void> {
    if (token === null) return
    setActionError(null)
    try {
      await pauseSubscription(token, subscription.id)
      await load()
    } catch (caught) {
      setActionError(
        caught instanceof ApiError ? caught.message : t('commerceSubscriptions.pauseError'),
      )
    }
  }

  async function resume(subscription: Subscription): Promise<void> {
    if (token === null) return
    setActionError(null)
    try {
      await resumeSubscription(token, subscription.id)
      await load()
    } catch (caught) {
      setActionError(
        caught instanceof ApiError ? caught.message : t('commerceSubscriptions.resumeError'),
      )
    }
  }

  async function cancel(subscription: Subscription): Promise<void> {
    if (token === null) return
    setActionError(null)
    try {
      await cancelSubscription(token, subscription.id)
      await load()
    } catch (caught) {
      setActionError(
        caught instanceof ApiError ? caught.message : t('commerceSubscriptions.cancelError'),
      )
    }
  }

  async function openDetail(subscription: Subscription): Promise<void> {
    if (token === null) return
    setDetailId(subscription.id)
    setDetailError(null)
    setDetailLoading(true)
    try {
      const { cycles, dunning } = await readSubscription(token, subscription.id)
      setDetailCycles(cycles)
      setDetailDunning(dunning)
    } catch (caught) {
      setDetailError(
        caught instanceof ApiError ? caught.message : t('commerceSubscriptions.detailError'),
      )
    } finally {
      setDetailLoading(false)
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

  return (
    <section aria-labelledby="commerce-subscriptions-heading" className="flex flex-col gap-6">
      <h1 id="commerce-subscriptions-heading" className="m-0 text-xl leading-7 font-semibold">
        {t('commerceSubscriptions.heading')}
      </h1>

      {metrics !== null && (
        <dl className="flex flex-wrap gap-6 text-sm">
          <div>
            <dt className="text-muted-foreground">{t('commerceSubscriptions.metricsActive')}</dt>
            <dd className="m-0 text-lg font-semibold">{metrics.active}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">{t('commerceSubscriptions.metricsMrr')}</dt>
            <dd className="m-0 text-lg font-semibold">
              {metrics.mrrMinor.length === 0
                ? '—'
                : metrics.mrrMinor
                    .map((entry) => formatMinor(entry.amountMinor, entry.currency, i18n.language))
                    .join(' + ')}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">{t('commerceSubscriptions.metricsChurn')}</dt>
            <dd className="m-0 text-lg font-semibold">
              {(metrics.churnRate * 100).toLocaleString(i18n.language, {
                maximumFractionDigits: 1,
              })}
              %
            </dd>
          </div>
        </dl>
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
        <TableRoot label={t('commerceSubscriptions.tableLabel')}>
          <Table>
            <TableHead>
              <TableRow>
                <TableHeader>{t('commerceSubscriptions.customerColumn')}</TableHeader>
                <TableHeader>{t('commerceSubscriptions.statusColumn')}</TableHeader>
                <TableHeader>{t('commerceSubscriptions.nextBillingColumn')}</TableHeader>
                <TableHeader>{t('commerceSubscriptions.amountColumn')}</TableHeader>
                <TableHeader>{t('commerceSubscriptions.actionsColumn')}</TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {subscriptions.map((subscription) => (
                <TableRow key={subscription.id}>
                  <TableCell>{subscription.customerId}</TableCell>
                  <TableCell>{t(`commerceSubscriptions.status.${subscription.status}`)}</TableCell>
                  <TableCell>
                    {subscription.status === 'cancelled'
                      ? '—'
                      : new Date(subscription.nextBillingAt).toLocaleDateString(i18n.language)}
                  </TableCell>
                  <TableCell>
                    {formatMinor(subscription.priceMinor, subscription.currency, i18n.language)} /{' '}
                    {t(`commerceSubscriptions.interval.${subscription.intervalUnit}`, {
                      count: subscription.intervalCount,
                    })}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => void openDetail(subscription)}
                      >
                        {t('commerceSubscriptions.viewDetail')}
                      </Button>
                      {(subscription.status === 'active' || subscription.status === 'past_due') && (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => void pause(subscription)}
                        >
                          {t('commerceSubscriptions.pause')}
                        </Button>
                      )}
                      {subscription.status === 'paused' && (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => void resume(subscription)}
                        >
                          {t('commerceSubscriptions.resume')}
                        </Button>
                      )}
                      {subscription.status !== 'cancelled' && (
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => void cancel(subscription)}
                        >
                          {t('commerceSubscriptions.cancel')}
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {subscriptions.length === 0 && (
                <TableEmpty colSpan={5}>{t('commerceSubscriptions.empty')}</TableEmpty>
              )}
            </TableBody>
          </Table>
        </TableRoot>
      )}

      <Modal
        open={detailId !== null}
        onOpenChange={(open) => {
          if (!open) setDetailId(null)
        }}
        title={t('commerceSubscriptions.detailHeading')}
        closeLabel={t('commerceSubscriptions.close')}
      >
        <div className="flex flex-col gap-4">
          {detailError !== null && (
            <Notice tone="danger" live="assertive">
              <p>{detailError}</p>
            </Notice>
          )}
          {detailLoading && <p>{t('common.loading')}</p>}

          {!detailLoading && detailError === null && (
            <>
              {detailDunning !== null && (
                <Notice
                  tone={detailDunning.suspendedAt !== null ? 'danger' : 'warning'}
                  live="polite"
                >
                  <p>
                    {detailDunning.suspendedAt !== null
                      ? t('commerceSubscriptions.dunningSuspended', {
                          count: detailDunning.failureCount,
                        })
                      : t('commerceSubscriptions.dunningInProgress', {
                          count: detailDunning.failureCount,
                          reason: detailDunning.lastReason ?? '',
                        })}
                  </p>
                </Notice>
              )}

              <h3 className="m-0 text-sm font-semibold">
                {t('commerceSubscriptions.billingHistoryHeading')}
              </h3>
              <TableRoot label={t('commerceSubscriptions.billingHistoryHeading')}>
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableHeader>{t('commerceSubscriptions.periodColumn')}</TableHeader>
                      <TableHeader>{t('commerceSubscriptions.cycleStatusColumn')}</TableHeader>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {detailCycles.map((cycle) => (
                      <TableRow key={cycle.id}>
                        <TableCell>
                          {new Date(cycle.periodStart).toLocaleDateString(i18n.language)}
                        </TableCell>
                        <TableCell>
                          {t(`commerceSubscriptions.cycleStatus.${cycle.status}`)}
                        </TableCell>
                      </TableRow>
                    ))}
                    {detailCycles.length === 0 && (
                      <TableEmpty colSpan={2}>{t('commerceSubscriptions.noHistory')}</TableEmpty>
                    )}
                  </TableBody>
                </Table>
              </TableRoot>
            </>
          )}

          <div className="flex justify-end">
            <Button variant="secondary" onClick={() => setDetailId(null)}>
              {t('commerceSubscriptions.close')}
            </Button>
          </div>
        </div>
      </Modal>
    </section>
  )
}
