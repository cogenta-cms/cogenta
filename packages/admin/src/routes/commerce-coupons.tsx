import { type FormEvent, type JSX, useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  type Coupon,
  type CouponKind,
  type CouponMetrics,
  createCoupon,
  deactivateCoupon,
  getCouponMetrics,
  listCoupons,
} from '../api/commerce-client.js'
import { ApiError } from '../api/http.js'
import { useAuth } from '../auth/auth-context.js'
import { majorTextToMinor, minorToMajorText } from '../commerce/money.js'
import {
  Button,
  Field,
  Input,
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

const COUPON_KINDS: readonly CouponKind[] = ['percentage', 'fixed', 'free_shipping']

/**
 * Coupons — contract E's back office (ADR-0024), from the admin. The backend
 * (`@cogenta/commerce`'s `CouponStore` and the router's `/coupons/*` routes)
 * already carried this in full; only the screen was missing.
 */
export function CommerceCouponsRoute(): JSX.Element {
  const { t } = useTranslation()
  const auth = useAuth()
  const token = auth.state.status === 'authenticated' ? auth.state.token : null
  const roles = auth.state.status === 'authenticated' ? auth.state.user.roles : []
  const canRead = roles.length > 0

  const [coupons, setCoupons] = useState<readonly Coupon[]>([])
  const [metrics, setMetrics] = useState<CouponMetrics | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const [creating, setCreating] = useState(false)
  const [code, setCode] = useState('')
  const [kind, setKind] = useState<CouponKind>('percentage')
  const [value, setValue] = useState('')
  const [currency, setCurrency] = useState('EUR')
  const [startsAt, setStartsAt] = useState('')
  const [endsAt, setEndsAt] = useState('')
  const [maxRedemptions, setMaxRedemptions] = useState('')
  const [maxRedemptionsPerCustomer, setMaxRedemptionsPerCustomer] = useState('')
  const [restrictedProductIds, setRestrictedProductIds] = useState('')

  const load = useCallback(async () => {
    if (token === null || !canRead) return
    setLoading(true)
    setError(null)
    try {
      const { coupons: list } = await listCoupons(token)
      setCoupons(list)
      // Best-effort: a metrics failure must not stop the coupon list itself
      // from loading, so it is fetched and swallowed separately.
      await getCouponMetrics(token)
        .then(setMetrics)
        .catch(() => setMetrics(null))
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : t('commerceCoupons.loadError'))
    } finally {
      setLoading(false)
    }
  }, [token, canRead, t])

  useEffect(() => {
    void load()
  }, [load])

  async function submitCreate(event: FormEvent): Promise<void> {
    event.preventDefault()
    if (token === null) return
    setActionError(null)

    let value_: number | undefined
    if (kind === 'percentage') {
      const percent = Number.parseFloat(value)
      if (!Number.isFinite(percent) || percent <= 0 || percent > 100) {
        setActionError(t('commerceCoupons.percentInvalid'))
        return
      }
      value_ = Math.round(percent * 100)
    } else if (kind === 'fixed') {
      const minor = majorTextToMinor(value, currency)
      if (minor === null || minor <= 0) {
        setActionError(t('commerceCoupons.amountInvalid'))
        return
      }
      value_ = minor
    }

    try {
      await createCoupon(token, {
        code,
        kind,
        ...(value_ === undefined ? {} : { value: value_ }),
        ...(kind === 'fixed' ? { currency } : {}),
        ...(startsAt === '' ? {} : { startsAt: new Date(startsAt).toISOString() }),
        ...(endsAt === '' ? {} : { endsAt: new Date(endsAt).toISOString() }),
        ...(maxRedemptions === '' ? {} : { maxRedemptions: Number.parseInt(maxRedemptions, 10) }),
        ...(maxRedemptionsPerCustomer === ''
          ? {}
          : { maxRedemptionsPerCustomer: Number.parseInt(maxRedemptionsPerCustomer, 10) }),
        ...(restrictedProductIds.trim() === ''
          ? {}
          : {
              restrictedProductIds: restrictedProductIds
                .split(',')
                .map((id) => id.trim())
                .filter((id) => id !== ''),
            }),
      })
      setCreating(false)
      setCode('')
      setValue('')
      setStartsAt('')
      setEndsAt('')
      setMaxRedemptions('')
      setMaxRedemptionsPerCustomer('')
      setRestrictedProductIds('')
      await load()
    } catch (caught) {
      setActionError(caught instanceof ApiError ? caught.message : t('commerceCoupons.createError'))
    }
  }

  async function deactivate(coupon: Coupon): Promise<void> {
    if (token === null) return
    setActionError(null)
    try {
      await deactivateCoupon(token, coupon.code)
      await load()
    } catch (caught) {
      setActionError(caught instanceof ApiError ? caught.message : t('commerceCoupons.updateError'))
    }
  }

  function describeValue(coupon: Coupon): string {
    if (coupon.kind === 'free_shipping') return t('commerceCoupons.kind.free_shipping')
    if (coupon.kind === 'percentage') return `${(coupon.value / 100).toString()}%`
    return minorToMajorText(coupon.value, coupon.currency ?? 'EUR')
  }

  if (!canRead) {
    return (
      <section aria-labelledby="commerce-coupons-heading">
        <h1 id="commerce-coupons-heading">{t('commerceCoupons.heading')}</h1>
        <p role="alert">{t('commerceCoupons.signedInOnly')}</p>
      </section>
    )
  }

  return (
    <section aria-labelledby="commerce-coupons-heading" className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1
          id="commerce-coupons-heading"
          className="m-0 text-2xl leading-tight font-bold tracking-tight"
        >
          {t('commerceCoupons.heading')}
        </h1>
        <Button onClick={() => setCreating(true)}>{t('commerceCoupons.newButton')}</Button>
      </div>

      {metrics !== null && (
        <dl className="flex flex-wrap gap-6 text-sm">
          <div>
            <dt className="text-muted-foreground">{t('commerceCoupons.metricsActive')}</dt>
            <dd className="m-0 text-lg font-semibold">{metrics.activeCoupons}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">{t('commerceCoupons.metricsRedemptions')}</dt>
            <dd className="m-0 text-lg font-semibold">{metrics.totalRedemptions}</dd>
          </div>
        </dl>
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
        <TableRoot label={t('commerceCoupons.tableLabel')}>
          <Table>
            <TableHead>
              <TableRow>
                <TableHeader>{t('commerceCoupons.codeColumn')}</TableHeader>
                <TableHeader>{t('commerceCoupons.kindColumn')}</TableHeader>
                <TableHeader>{t('commerceCoupons.valueColumn')}</TableHeader>
                <TableHeader>{t('commerceCoupons.redemptionsColumn')}</TableHeader>
                <TableHeader>{t('commerceCoupons.statusColumn')}</TableHeader>
                <TableHeader>{t('commerceCoupons.actionsColumn')}</TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {coupons.map((coupon) => (
                <TableRow key={coupon.code}>
                  <TableCell>{coupon.code}</TableCell>
                  <TableCell>{t(`commerceCoupons.kind.${coupon.kind}`)}</TableCell>
                  <TableCell>{describeValue(coupon)}</TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-0.5">
                      <span>
                        {coupon.maxRedemptions === null
                          ? t('commerceCoupons.unlimited', { used: coupon.redemptions })
                          : t('commerceCoupons.limited', {
                              used: coupon.redemptions,
                              max: coupon.maxRedemptions,
                            })}
                      </span>
                      {coupon.maxRedemptionsPerCustomer !== null && (
                        <span className="text-xs text-muted-foreground">
                          {t('commerceCoupons.perCustomerLimitLabel', {
                            max: coupon.maxRedemptionsPerCustomer,
                          })}
                        </span>
                      )}
                      {(coupon.restrictedProductIds?.length ?? 0) > 0 && (
                        <span className="text-xs text-muted-foreground">
                          {t('commerceCoupons.restrictedLabel', {
                            count: coupon.restrictedProductIds.length,
                          })}
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    {coupon.active ? t('commerceCoupons.active') : t('commerceCoupons.inactive')}
                  </TableCell>
                  <TableCell>
                    {coupon.active && (
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => void deactivate(coupon)}
                      >
                        {t('commerceCoupons.deactivate', { code: coupon.code })}
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {coupons.length === 0 && (
                <TableEmpty colSpan={6}>{t('commerceCoupons.empty')}</TableEmpty>
              )}
            </TableBody>
          </Table>
        </TableRoot>
      )}

      <Modal
        open={creating}
        onOpenChange={setCreating}
        title={t('commerceCoupons.newHeading')}
        closeLabel={t('commerceCoupons.close')}
      >
        <form onSubmit={submitCreate} className="flex flex-col gap-4">
          <Field
            label={t('commerceCoupons.codeColumn')}
            description={t('commerceCoupons.codeHint')}
          >
            {(control) => (
              <Input
                {...control}
                required
                value={code}
                onChange={(event) => setCode(event.target.value.toUpperCase())}
              />
            )}
          </Field>
          <Field label={t('commerceCoupons.kindColumn')}>
            {(control) => (
              <Select
                {...control}
                value={kind}
                onChange={(event) => setKind(event.target.value as CouponKind)}
              >
                {COUPON_KINDS.map((option) => (
                  <option key={option} value={option}>
                    {t(`commerceCoupons.kind.${option}`)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          {kind !== 'free_shipping' && (
            <div className="grid grid-cols-2 gap-4">
              <Field
                label={
                  kind === 'percentage'
                    ? t('commerceCoupons.percentValue')
                    : t('commerceCoupons.amountValue')
                }
              >
                {(control) => (
                  <Input
                    {...control}
                    type="text"
                    inputMode="decimal"
                    required
                    value={value}
                    onChange={(event) => setValue(event.target.value)}
                  />
                )}
              </Field>
              {kind === 'fixed' && (
                <Field label={t('commerceProducts.currencyColumn')}>
                  {(control) => (
                    <Input
                      {...control}
                      required
                      maxLength={3}
                      value={currency}
                      onChange={(event) => setCurrency(event.target.value.toUpperCase())}
                    />
                  )}
                </Field>
              )}
            </div>
          )}
          <div className="grid grid-cols-2 gap-4">
            <Field label={t('commerceCoupons.startsAt')}>
              {(control) => (
                <Input
                  {...control}
                  type="date"
                  value={startsAt}
                  onChange={(event) => setStartsAt(event.target.value)}
                />
              )}
            </Field>
            <Field label={t('commerceCoupons.endsAt')}>
              {(control) => (
                <Input
                  {...control}
                  type="date"
                  value={endsAt}
                  onChange={(event) => setEndsAt(event.target.value)}
                />
              )}
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field
              label={t('commerceCoupons.maxRedemptions')}
              description={t('commerceCoupons.maxRedemptionsHint')}
            >
              {(control) => (
                <Input
                  {...control}
                  type="number"
                  min={1}
                  value={maxRedemptions}
                  onChange={(event) => setMaxRedemptions(event.target.value)}
                />
              )}
            </Field>
            <Field
              label={t('commerceCoupons.maxRedemptionsPerCustomer')}
              description={t('commerceCoupons.maxRedemptionsPerCustomerHint')}
            >
              {(control) => (
                <Input
                  {...control}
                  type="number"
                  min={1}
                  value={maxRedemptionsPerCustomer}
                  onChange={(event) => setMaxRedemptionsPerCustomer(event.target.value)}
                />
              )}
            </Field>
          </div>
          <Field
            label={t('commerceCoupons.restrictedProductIds')}
            description={t('commerceCoupons.restrictedProductIdsHint')}
          >
            {(control) => (
              <Input
                {...control}
                value={restrictedProductIds}
                onChange={(event) => setRestrictedProductIds(event.target.value)}
              />
            )}
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setCreating(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit">{t('commerceCoupons.createButton')}</Button>
          </div>
        </form>
      </Modal>
    </section>
  )
}
