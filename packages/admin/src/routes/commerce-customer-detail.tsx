import { type JSX, useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router'
import {
  anonymizeCustomer,
  type CustomerDetail,
  exportCustomer,
  readCustomer,
} from '../api/commerce-client.js'
import { ApiError } from '../api/http.js'
import { useAuth } from '../auth/auth-context.js'
import { commerceErrorMessage } from '../commerce/commerce-errors.js'
import { ConfirmDialog } from '../commerce/confirm-dialog.js'
import { formatMinor } from '../commerce/money.js'
import { OrderStatusBadge } from '../commerce/order-status.js'
import { SubscriptionStatusBadge } from '../commerce/subscription-status.js'
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
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

/**
 * A customer's own fiche (fiche 52 task 3): their record, every order they
 * placed, what they spent, and their subscriptions if the shop has any —
 * `GET /api/commerce/customers/{id}` aggregates all of it server-side
 * (`customerDetail` in `@cogenta/commerce`'s admin router), so this screen
 * is a straight render of one response, not a second aggregation.
 */
export function CommerceCustomerRoute(): JSX.Element {
  const { t, i18n } = useTranslation()
  const { id = '' } = useParams<{ id: string }>()
  const auth = useAuth()
  const token = auth.state.status === 'authenticated' ? auth.state.token : null
  const roles = auth.state.status === 'authenticated' ? auth.state.user.roles : []
  const canRead = roles.length > 0
  const canWrite = roles.includes('admin') || roles.includes('shopkeeper')

  const [detail, setDetail] = useState<CustomerDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [dialogError, setDialogError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    if (token === null || !canRead || id === '') return
    setLoading(true)
    setError(null)
    try {
      setDetail(await readCustomer(token, id))
    } catch (caught) {
      setError(
        caught instanceof ApiError && caught.code === 'COMMERCE_CUSTOMER_NOT_FOUND'
          ? t('commerceCustomerDetail.notFound')
          : commerceErrorMessage(t, caught, 'commerceCustomerDetail.loadError'),
      )
    } finally {
      setLoading(false)
    }
  }, [token, canRead, id, t])

  useEffect(() => {
    void load()
  }, [load])

  async function doExport(): Promise<void> {
    if (token === null) return
    setActionError(null)
    try {
      const exported = await exportCustomer(token, id)
      const blob = new Blob([JSON.stringify(exported, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `customer-${id}.json`
      link.click()
      URL.revokeObjectURL(url)
    } catch (caught) {
      setActionError(commerceErrorMessage(t, caught, 'commerceCustomerDetail.exportError'))
    }
  }

  async function doAnonymize(): Promise<void> {
    if (token === null) return
    setBusy(true)
    setDialogError(null)
    try {
      await anonymizeCustomer(token, id)
      setConfirming(false)
      setNotice(t('commerceCustomerDetail.anonymized'))
      await load()
    } catch (caught) {
      setDialogError(commerceErrorMessage(t, caught, 'commerceCustomerDetail.anonymizeError'))
    } finally {
      setBusy(false)
    }
  }

  if (!canRead) {
    return (
      <section>
        <PageHeader title={t('commerceCustomerDetail.heading')} />
        <p role="alert">{t('commerceOrders.signedInOnly')}</p>
      </section>
    )
  }

  if (loading) return <p>{t('common.loading')}</p>
  if (error !== null || detail === null) {
    return (
      <section className="flex flex-col gap-4">
        <PageHeader title={t('commerceCustomerDetail.heading')} />
        <Link to="/commerce/customers">{t('commerceCustomerDetail.back')}</Link>
        <Notice tone="danger" live="assertive">
          <p>{error ?? t('commerceCustomerDetail.notFound')}</p>
        </Notice>
      </section>
    )
  }

  const { customer, orders, totalSpentMinor, currency, subscriptions } = detail

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link to="/commerce/customers">{t('commerceCustomerDetail.back')}</Link>
          <h1 className="m-0 text-2xl leading-tight font-bold tracking-tight">
            {customer.anonymized === true
              ? t('commerceCustomers.anonymized')
              : (customer.name ?? customer.email)}
          </h1>
          {customer.anonymized !== true && <p className="text-sm">{customer.email}</p>}
        </div>
        {canWrite && (
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => void doExport()}>
              {t('commerceCustomerDetail.exportButton')}
            </Button>
            {customer.anonymized !== true && (
              <Button
                variant="secondary"
                className="text-destructive"
                onClick={() => {
                  setDialogError(null)
                  setConfirming(true)
                }}
              >
                {t('commerceCustomerDetail.anonymizeButton')}
              </Button>
            )}
          </div>
        )}
      </div>

      {notice !== null && (
        <Notice tone="success" live="polite">
          <p>{notice}</p>
        </Notice>
      )}
      {actionError !== null && (
        <Notice tone="danger" live="assertive">
          <p>{actionError}</p>
        </Notice>
      )}

      <Card>
        <CardHeader>
          <CardTitle>
            <h2>{t('commerceCustomerDetail.ordersTitle')}</h2>
          </CardTitle>
        </CardHeader>
        <CardBody>
          <p className="text-sm font-semibold">
            {t('commerceCustomerDetail.totalSpentLine', {
              amount:
                currency === null ? '—' : formatMinor(totalSpentMinor, currency, i18n.language),
            })}
          </p>
          <TableRoot label={t('commerceCustomerDetail.ordersTitle')} stacked>
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeader>{t('commerceOrders.referenceColumn')}</TableHeader>
                  <TableHeader>{t('commerceOrders.statusColumn')}</TableHeader>
                  <TableHeader>{t('commerceOrders.totalColumn')}</TableHeader>
                  <TableHeader>{t('commerceOrders.placedAtColumn')}</TableHeader>
                </TableRow>
              </TableHead>
              <TableBody>
                {orders.map((order) => (
                  <TableRow key={order.id}>
                    <TableCell stack="heading">
                      <Link to={`/commerce/orders/${encodeURIComponent(order.id)}`}>
                        {order.reference}
                      </Link>
                    </TableCell>
                    <TableCell label={t('commerceOrders.statusColumn')}>
                      <OrderStatusBadge status={order.status} />
                    </TableCell>
                    <TableCell label={t('commerceOrders.totalColumn')}>
                      {formatMinor(order.totalMinor, order.currency, i18n.language)}
                    </TableCell>
                    <TableCell label={t('commerceOrders.placedAtColumn')}>
                      {new Date(order.placedAt).toLocaleString(i18n.language)}
                    </TableCell>
                  </TableRow>
                ))}
                {orders.length === 0 && (
                  <TableEmpty colSpan={4}>{t('commerceOrders.empty')}</TableEmpty>
                )}
              </TableBody>
            </Table>
          </TableRoot>
        </CardBody>
      </Card>

      {subscriptions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>
              <h2>{t('commerceCustomerDetail.subscriptionsTitle')}</h2>
            </CardTitle>
          </CardHeader>
          <CardBody>
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              {subscriptions.map((subscription) => (
                <li key={subscription.id} className="flex flex-wrap items-center gap-2 text-sm">
                  <Link to={`/commerce/subscriptions/${encodeURIComponent(subscription.id)}`}>
                    {formatMinor(subscription.priceMinor, subscription.currency, i18n.language)} /{' '}
                    {t(`commerceSubscriptions.interval.${subscription.intervalUnit}`, {
                      count: subscription.intervalCount,
                    })}
                  </Link>
                  <SubscriptionStatusBadge status={subscription.status} />
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      )}
      <ConfirmDialog
        open={confirming}
        title={t('commerceCustomerDetail.anonymizeTitle')}
        confirmLabel={t('commerceCustomerDetail.anonymizeButton')}
        busy={busy}
        error={dialogError}
        onCancel={() => setConfirming(false)}
        onConfirm={() => void doAnonymize()}
      >
        <p className="m-0">{t('commerceCustomerDetail.anonymizeConfirm')}</p>
      </ConfirmDialog>
    </section>
  )
}
