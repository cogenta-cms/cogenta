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
import { formatMinor } from '../commerce/money.js'
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

  const load = useCallback(async () => {
    if (token === null || !canRead || id === '') return
    setLoading(true)
    setError(null)
    try {
      setDetail(await readCustomer(token, id))
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : t('commerceCustomerDetail.loadError'))
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
      setActionError(
        caught instanceof ApiError ? caught.message : t('commerceCustomerDetail.exportError'),
      )
    }
  }

  async function doAnonymize(): Promise<void> {
    if (token === null) return
    // A real, irreversible confirmation for GDPR erasure.
    if (!window.confirm(t('commerceCustomerDetail.anonymizeConfirm'))) return
    setActionError(null)
    try {
      await anonymizeCustomer(token, id)
      setNotice(t('commerceCustomerDetail.anonymized'))
      await load()
    } catch (caught) {
      setActionError(
        caught instanceof ApiError ? caught.message : t('commerceCustomerDetail.anonymizeError'),
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
  if (detail === null) return <p>{t('commerceCustomerDetail.notFound')}</p>

  const { customer, orders, totalSpentMinor, currency, subscriptions } = detail

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link to="/commerce/customers">{t('commerceCustomerDetail.back')}</Link>
          <h1 className="m-0 text-xl leading-7 font-semibold">{customer.name ?? customer.email}</h1>
          <p className="text-sm">{customer.email}</p>
        </div>
        {canWrite && (
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={() => void doExport()}>
              {t('commerceCustomerDetail.exportButton')}
            </Button>
            <Button variant="destructive" size="sm" onClick={() => void doAnonymize()}>
              {t('commerceCustomerDetail.anonymizeButton')}
            </Button>
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
            {t('commerceCustomerDetail.totalSpent')}:{' '}
            {currency === null ? '—' : formatMinor(totalSpentMinor, currency, i18n.language)}
          </p>
          <TableRoot label={t('commerceCustomerDetail.ordersTitle')}>
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
                    <TableCell>
                      <Link to={`/commerce/orders/${encodeURIComponent(order.id)}`}>
                        {order.reference}
                      </Link>
                    </TableCell>
                    <TableCell>{t(`commerceOrders.status.${order.status}`)}</TableCell>
                    <TableCell>
                      {formatMinor(order.totalMinor, order.currency, i18n.language)}
                    </TableCell>
                    <TableCell>{new Date(order.placedAt).toLocaleString(i18n.language)}</TableCell>
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
                <li key={subscription.id} className="text-sm">
                  {formatMinor(subscription.priceMinor, subscription.currency, i18n.language)} /{' '}
                  {subscription.intervalUnit} — {subscription.status}
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      )}
    </section>
  )
}
