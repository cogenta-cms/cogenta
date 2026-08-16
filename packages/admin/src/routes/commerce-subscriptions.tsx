import { type JSX, useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  cancelSubscription,
  listSubscriptions,
  type Subscription,
  type SubscriptionStatus,
} from '../api/commerce-client.js'
import { ApiError } from '../api/http.js'
import { useAuth } from '../auth/auth-context.js'
import { formatMinor } from '../commerce/money.js'
import {
  Button,
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

const STATUSES: readonly SubscriptionStatus[] = ['active', 'paused', 'cancelled']

/**
 * Subscriptions — contract E's back office (ADR-0024), from the admin. The
 * backend (`@cogenta/commerce`'s `SubscriptionStore`, its month/year
 * arithmetic already tested) was wired into `cogenta serve` for the first
 * time alongside this screen; only cancellation is exposed here, the one
 * action this screen's brief actually asks for.
 */
export function CommerceSubscriptionsRoute(): JSX.Element {
  const { t, i18n } = useTranslation()
  const auth = useAuth()
  const token = auth.state.status === 'authenticated' ? auth.state.token : null
  const roles = auth.state.status === 'authenticated' ? auth.state.user.roles : []
  const canRead = roles.length > 0

  const [subscriptions, setSubscriptions] = useState<readonly Subscription[]>([])
  const [statusFilter, setStatusFilter] = useState<SubscriptionStatus | ''>('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

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
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : t('commerceSubscriptions.loadError'))
    } finally {
      setLoading(false)
    }
  }, [token, canRead, statusFilter, t])

  useEffect(() => {
    void load()
  }, [load])

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
                    {subscription.status !== 'cancelled' && (
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => void cancel(subscription)}
                      >
                        {t('commerceSubscriptions.cancel')}
                      </Button>
                    )}
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
    </section>
  )
}
