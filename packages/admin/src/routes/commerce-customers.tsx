import { type JSX, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { type Customer, type CustomerStats, listCustomers } from '../api/commerce-client.js'
import { useAuth } from '../auth/auth-context.js'
import { commerceErrorMessage } from '../commerce/commerce-errors.js'
import { formatMinor } from '../commerce/money.js'
import {
  Button,
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
  const { t, i18n } = useTranslation()
  const auth = useAuth()
  const token = auth.state.status === 'authenticated' ? auth.state.token : null
  const roles = auth.state.status === 'authenticated' ? auth.state.user.roles : []
  const canRead = roles.length > 0

  const [customers, setCustomers] = useState<readonly Customer[]>([])
  const [stats, setStats] = useState<Readonly<Record<string, CustomerStats>>>({})
  const [search, setSearch] = useState('')
  const [pagination, setPagination] = useState<{
    cursors: readonly (string | undefined)[]
    index: number
  }>({ cursors: [undefined], index: 0 })
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const cursor = pagination.cursors[pagination.index]
  const resetPagination = (): void => setPagination({ cursors: [undefined], index: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (token === null || !canRead) return
    const controller = new AbortController()
    let cancelled = false
    setLoading(true)
    setError(null)
    setNextCursor(null)
    void (async () => {
      try {
        const response = await listCustomers(token, search, {
          limit: 20,
          ...(cursor === undefined ? {} : { cursor }),
          signal: controller.signal,
        })
        if (cancelled) return
        setCustomers(response.customers)
        setStats(response.stats ?? {})
        setNextCursor(response.page?.hasMore === true ? (response.page.nextCursor ?? null) : null)
      } catch (caught) {
        if (!cancelled) setError(commerceErrorMessage(t, caught, 'commerceCustomers.loadError'))
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
      controller.abort()
    }
  }, [token, canRead, search, cursor, t])

  if (!canRead) {
    return (
      <section aria-labelledby="commerce-customers-heading">
        <h1 id="commerce-customers-heading">{t('commerceCustomers.heading')}</h1>
        <p role="alert">{t('commerceOrders.signedInOnly')}</p>
      </section>
    )
  }

  return (
    <section className="flex flex-col gap-6">
      <h1
        id="commerce-customers-heading"
        className="m-0 text-2xl leading-tight font-bold tracking-tight"
      >
        {t('commerceCustomers.heading')}
      </h1>

      <div className="max-w-sm">
        <Field label={t('commerceCustomers.search')}>
          {(control) => (
            <Input
              {...control}
              type="search"
              placeholder={t('commerceCustomers.searchPlaceholder')}
              value={search}
              onChange={(event) => {
                setSearch(event.target.value)
                resetPagination()
              }}
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
        <TableRoot label={t('commerceCustomers.tableLabel')} stacked>
          <Table>
            <TableHead>
              <TableRow>
                <TableHeader>{t('commerceCustomers.nameColumn')}</TableHeader>
                <TableHeader>{t('commerceCustomers.emailColumn')}</TableHeader>
                <TableHeader>{t('commerceCustomers.ordersColumn')}</TableHeader>
                <TableHeader>{t('commerceCustomers.spentColumn')}</TableHeader>
                <TableHeader>{t('commerceCustomers.lastOrderColumn')}</TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {customers.map((customer) => {
                const figures = stats[customer.id]
                return (
                  <TableRow key={customer.id}>
                    <TableCell stack="heading">
                      <Link to={`/commerce/customers/${encodeURIComponent(customer.id)}`}>
                        {customer.anonymized === true
                          ? t('commerceCustomers.anonymized')
                          : (customer.name ?? customer.email)}
                      </Link>
                    </TableCell>
                    <TableCell label={t('commerceCustomers.emailColumn')}>
                      {customer.anonymized === true ? '—' : customer.email}
                    </TableCell>
                    <TableCell label={t('commerceCustomers.ordersColumn')}>
                      {figures?.orderCount ?? 0}
                    </TableCell>
                    <TableCell label={t('commerceCustomers.spentColumn')}>
                      {figures === undefined || figures.spentByCurrency.length === 0
                        ? '—'
                        : figures.spentByCurrency
                            .map((row) => formatMinor(row.amountMinor, row.currency, i18n.language))
                            .join(' + ')}
                    </TableCell>
                    <TableCell label={t('commerceCustomers.lastOrderColumn')}>
                      {figures?.lastOrderAt == null
                        ? '—'
                        : new Date(figures.lastOrderAt).toLocaleDateString(i18n.language)}
                    </TableCell>
                  </TableRow>
                )
              })}
              {customers.length === 0 && (
                <TableEmpty colSpan={5}>{t('commerceCustomers.empty')}</TableEmpty>
              )}
            </TableBody>
          </Table>
        </TableRoot>
      )}

      {error === null && (pagination.index > 0 || nextCursor !== null) && (
        <nav
          aria-label={t('commerceCustomers.paginationLabel')}
          className="flex flex-wrap items-center gap-2"
        >
          <Button
            variant="secondary"
            size="sm"
            disabled={loading || pagination.index === 0}
            onClick={() => setPagination((current) => ({ ...current, index: current.index - 1 }))}
          >
            {t('commerceCustomers.previousPage')}
          </Button>
          <span aria-live="polite">
            {t('commerceCustomers.pageInfo', { page: pagination.index + 1 })}
          </span>
          <Button
            variant="secondary"
            size="sm"
            disabled={loading || nextCursor === null}
            onClick={() => {
              if (nextCursor !== null)
                setPagination((current) => ({
                  cursors: [...current.cursors.slice(0, current.index + 1), nextCursor],
                  index: current.index + 1,
                }))
            }}
          >
            {t('commerceCustomers.nextPage')}
          </Button>
        </nav>
      )}
    </section>
  )
}
