import { type JSX, useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router'
import {
  cancelSubscription,
  pauseSubscription,
  readSubscription,
  resumeSubscription,
  type Subscription,
  type SubscriptionCycle,
  type SubscriptionDunning,
} from '../api/commerce-client.js'
import { ApiError } from '../api/http.js'
import { useAuth } from '../auth/auth-context.js'
import { formatMinor } from '../commerce/money.js'
import {
  Button,
  Notice,
  Table,
  TableBody,
  TableCell,
  TableEmpty,
  TableHead,
  TableHeader,
  TableRoot,
  TableRow,
} from '../ui/index.js'

/**
 * One subscription, in full — fiche 71: this used to be a modal opened from
 * `CommerceSubscriptionsRoute` (`detailId` state), so the URL never changed
 * and an F5 or a shared link always lost the open detail. Now a real route
 * (`commerce/subscriptions/:id`), the same shape as `CommerceOrderRoute`
 * (`commerce/orders/:id`) already uses — a "Retour" `<Link>`, never
 * `history.back()`, and a named message rather than a blank screen when the
 * id in the URL no longer resolves to a real subscription.
 */
export function CommerceSubscriptionDetailRoute(): JSX.Element {
  const { t, i18n } = useTranslation()
  const { id = '' } = useParams<{ id: string }>()
  const auth = useAuth()
  const token = auth.state.status === 'authenticated' ? auth.state.token : null
  const roles = auth.state.status === 'authenticated' ? auth.state.user.roles : []
  const canRead = roles.length > 0

  const [subscription, setSubscription] = useState<Subscription | null>(null)
  const [cycles, setCycles] = useState<readonly SubscriptionCycle[]>([])
  const [dunning, setDunning] = useState<SubscriptionDunning | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (token === null || !canRead || id === '') return
    setLoading(true)
    setError(null)
    setNotFound(false)
    try {
      const result = await readSubscription(token, id)
      setSubscription(result.subscription)
      setCycles(result.cycles)
      setDunning(result.dunning)
    } catch (caught) {
      // A URL pointing at a subscription that no longer exists (deleted, or
      // never real) gets this screen's own French message — the fiche's own
      // named pitfall for a route-based detail panel — rather than the
      // server's English `CogentaError.message` surfacing raw in a French UI.
      if (caught instanceof ApiError && caught.code === 'COMMERCE_SUBSCRIPTION_NOT_FOUND') {
        setNotFound(true)
      } else {
        setError(
          caught instanceof ApiError ? caught.message : t('commerceSubscriptionDetail.loadError'),
        )
      }
    } finally {
      setLoading(false)
    }
  }, [token, canRead, id, t])

  useEffect(() => {
    void load()
  }, [load])

  async function pause(): Promise<void> {
    if (token === null) return
    setActionError(null)
    try {
      setSubscription(await pauseSubscription(token, id))
    } catch (caught) {
      setActionError(
        caught instanceof ApiError ? caught.message : t('commerceSubscriptions.pauseError'),
      )
    }
  }

  async function resume(): Promise<void> {
    if (token === null) return
    setActionError(null)
    try {
      setSubscription(await resumeSubscription(token, id))
    } catch (caught) {
      setActionError(
        caught instanceof ApiError ? caught.message : t('commerceSubscriptions.resumeError'),
      )
    }
  }

  async function cancel(): Promise<void> {
    if (token === null) return
    setActionError(null)
    try {
      setSubscription(await cancelSubscription(token, id))
    } catch (caught) {
      setActionError(
        caught instanceof ApiError ? caught.message : t('commerceSubscriptions.cancelError'),
      )
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
        <Link to="/commerce/subscriptions">{t('commerceSubscriptionDetail.back')}</Link>
        <Notice tone="danger" live="assertive">
          <p>{error}</p>
        </Notice>
      </section>
    )
  }

  // Handles a URL pointing at a subscription that no longer exists (deleted
  // or never real) with a named message, never a blank screen — the fiche's
  // own named pitfall for a route-based detail panel.
  if (notFound || subscription === null) {
    return (
      <section className="flex flex-col gap-4">
        <Link to="/commerce/subscriptions">{t('commerceSubscriptionDetail.back')}</Link>
        <Notice tone="warning" live="polite">
          <p>{t('commerceSubscriptionDetail.notFound')}</p>
        </Notice>
      </section>
    )
  }

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link to="/commerce/subscriptions">{t('commerceSubscriptionDetail.back')}</Link>
          <h1 className="m-0 text-xl leading-7 font-semibold">
            {t('commerceSubscriptions.detailHeading')}
          </h1>
          <p className="text-sm">
            {subscription.customerId} — {t(`commerceSubscriptions.status.${subscription.status}`)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {(subscription.status === 'active' || subscription.status === 'past_due') && (
            <Button variant="secondary" size="sm" onClick={() => void pause()}>
              {t('commerceSubscriptions.pause')}
            </Button>
          )}
          {subscription.status === 'paused' && (
            <Button variant="secondary" size="sm" onClick={() => void resume()}>
              {t('commerceSubscriptions.resume')}
            </Button>
          )}
          {subscription.status !== 'cancelled' && (
            <Button variant="destructive" size="sm" onClick={() => void cancel()}>
              {t('commerceSubscriptions.cancel')}
            </Button>
          )}
        </div>
      </div>

      {actionError !== null && (
        <Notice tone="danger" live="assertive">
          <p>{actionError}</p>
        </Notice>
      )}

      <p className="text-sm">
        {formatMinor(subscription.priceMinor, subscription.currency, i18n.language)} /{' '}
        {t(`commerceSubscriptions.interval.${subscription.intervalUnit}`, {
          count: subscription.intervalCount,
        })}
        {subscription.status !== 'cancelled' &&
          ` — ${t('commerceSubscriptions.nextBillingColumn')}: ${new Date(
            subscription.nextBillingAt,
          ).toLocaleDateString(i18n.language)}`}
      </p>

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

      <div>
        <h2 className="m-0 mb-2 text-sm font-semibold">
          {t('commerceSubscriptions.billingHistoryHeading')}
        </h2>
        <TableRoot label={t('commerceSubscriptions.billingHistoryHeading')}>
          <Table>
            <TableHead>
              <TableRow>
                <TableHeader>{t('commerceSubscriptions.periodColumn')}</TableHeader>
                <TableHeader>{t('commerceSubscriptions.cycleStatusColumn')}</TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {cycles.map((cycle) => (
                <TableRow key={cycle.id}>
                  <TableCell>
                    {new Date(cycle.periodStart).toLocaleDateString(i18n.language)}
                  </TableCell>
                  <TableCell>{t(`commerceSubscriptions.cycleStatus.${cycle.status}`)}</TableCell>
                </TableRow>
              ))}
              {cycles.length === 0 && (
                <TableEmpty colSpan={2}>{t('commerceSubscriptions.noHistory')}</TableEmpty>
              )}
            </TableBody>
          </Table>
        </TableRoot>
      </div>
    </section>
  )
}
