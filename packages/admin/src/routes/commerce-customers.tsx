import { type JSX, useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { type Customer, listCustomers } from '../api/commerce-client.js'
import { ApiError } from '../api/http.js'
import { useAuth } from '../auth/auth-context.js'
import {
  Field,
  Input,
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
 * The customer list (fiche 52 task 3) — the screen this admin never had:
 * `GET /api/commerce/customers` already existed with a `search` filter, but
 * nothing in the admin ever called it. Read-only, like the order list — the
 * fiche and export/anonymise actions live on `CommerceCustomerRoute`.
 */
export function CommerceCustomersRoute(): JSX.Element {
  const { t } = useTranslation()
  const auth = useAuth()
  const token = auth.state.status === 'authenticated' ? auth.state.token : null
  const roles = auth.state.status === 'authenticated' ? auth.state.user.roles : []
  const canRead = roles.length > 0

  const [customers, setCustomers] = useState<readonly Customer[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (token === null || !canRead) return
    setLoading(true)
    setError(null)
    try {
      setCustomers((await listCustomers(token, search)).customers)
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : t('commerceCustomers.loadError'))
    } finally {
      setLoading(false)
    }
  }, [token, canRead, search, t])

  useEffect(() => {
    void load()
  }, [load])

  if (!canRead) {
    return (
      <section aria-labelledby="commerce-customers-heading">
        <h1 id="commerce-customers-heading">{t('commerceCustomers.heading')}</h1>
        <p role="alert">{t('commerceOrders.signedInOnly')}</p>
      </section>
    )
  }

  return (
    <section aria-labelledby="commerce-customers-heading" className="flex flex-col gap-6">
      <h1
        id="commerce-customers-heading"
        className="m-0 text-2xl leading-tight font-bold tracking-tight"
      >
        {t('commerceCustomers.heading')}
      </h1>

      <div className="max-w-xs">
        <Field label={t('commerceCustomers.search')}>
          {(control) => (
            <Input
              {...control}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          )}
        </Field>
      </div>

      {error !== null && (
        <Notice tone="danger" live="assertive">
          <p>{error}</p>
        </Notice>
      )}
      {loading && <p>{t('common.loading')}</p>}

      {!loading && error === null && (
        <TableRoot label={t('commerceCustomers.tableLabel')}>
          <Table>
            <TableHead>
              <TableRow>
                <TableHeader>{t('commerceCustomers.nameColumn')}</TableHeader>
                <TableHeader>{t('commerceCustomers.emailColumn')}</TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {customers.map((customer) => (
                <TableRow key={customer.id}>
                  <TableCell>
                    <Link to={`/commerce/customers/${encodeURIComponent(customer.id)}`}>
                      {customer.name ?? customer.email}
                    </Link>
                  </TableCell>
                  <TableCell>{customer.email}</TableCell>
                </TableRow>
              ))}
              {customers.length === 0 && (
                <TableEmpty colSpan={2}>{t('commerceCustomers.empty')}</TableEmpty>
              )}
            </TableBody>
          </Table>
        </TableRoot>
      )}
    </section>
  )
}
