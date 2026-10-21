import { type FormEvent, type JSX, useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  activateCoupon,
  type Coupon,
  type CouponKind,
  type CouponMetrics,
  createCoupon,
  deactivateCoupon,
  deleteCoupon,
  getCouponMetrics,
  listCoupons,
  updateCoupon,
} from '../api/commerce-client.js'
import { useAuth } from '../auth/auth-context.js'
import { commerceErrorMessage } from '../commerce/commerce-errors.js'
import { ConfirmDialog } from '../commerce/confirm-dialog.js'
import { DialogError } from '../commerce/dialog-error.js'
import {
  basisPointsToPercentText,
  currencyOptions,
  formatBasisPoints,
  formatMinor,
  majorTextToMinor,
  minorToMajorText,
  percentTextToBasisPoints,
} from '../commerce/money.js'
import { ProductMultiPicker } from '../commerce/product-multi-picker.js'
import { useLocalPagination } from '../lib/use-local-pagination.js'
import {
  Badge,
  Button,
  Field,
  Input,
  Modal,
  Notice,
  Pagination,
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

const COUPON_KINDS: readonly CouponKind[] = ['percentage', 'fixed', 'free_shipping']
const CODE_PATTERN = /^[A-Z0-9_-]+$/u

interface CouponForm {
  readonly code: string
  readonly kind: CouponKind
  readonly value: string
  readonly currency: string
  readonly minSubtotal: string
  readonly startsAt: string
  readonly endsAt: string
  readonly maxRedemptions: string
  readonly maxRedemptionsPerCustomer: string
  readonly productIds: readonly string[]
}

const EMPTY_FORM: CouponForm = {
  code: '',
  kind: 'percentage',
  value: '',
  currency: 'EUR',
  minSubtotal: '',
  startsAt: '',
  endsAt: '',
  maxRedemptions: '',
  maxRedemptionsPerCustomer: '',
  productIds: [],
}

/** `2026-12-31T22:59:59.999Z` → the local calendar day `2026-12-31` a date field shows. */
function toDateInput(iso: string | null): string {
  if (iso === null) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const pad = (value: number): string => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/** A coupon is valid *from* the start of its first day and *through* the end of its last. */
function startOfDay(day: string): string {
  return new Date(`${day}T00:00:00`).toISOString()
}
function endOfDay(day: string): string {
  return new Date(`${day}T23:59:59`).toISOString()
}

function formFor(coupon: Coupon): CouponForm {
  const currency = coupon.currency ?? 'EUR'
  return {
    code: coupon.code,
    kind: coupon.kind,
    value:
      coupon.kind === 'percentage'
        ? basisPointsToPercentText(coupon.value)
        : coupon.kind === 'fixed'
          ? minorToMajorText(coupon.value, currency)
          : '',
    currency,
    minSubtotal:
      coupon.minSubtotalMinor > 0 ? minorToMajorText(coupon.minSubtotalMinor, currency) : '',
    startsAt: toDateInput(coupon.startsAt),
    endsAt: toDateInput(coupon.endsAt),
    maxRedemptions: coupon.maxRedemptions === null ? '' : String(coupon.maxRedemptions),
    maxRedemptionsPerCustomer:
      coupon.maxRedemptionsPerCustomer === null ? '' : String(coupon.maxRedemptionsPerCustomer),
    productIds: coupon.restrictedProductIds,
  }
}

type CouponState = 'active' | 'inactive' | 'scheduled' | 'expired' | 'exhausted'

function stateOf(coupon: Coupon, now: number): CouponState {
  if (!coupon.active) return 'inactive'
  if (coupon.endsAt !== null && new Date(coupon.endsAt).getTime() < now) return 'expired'
  if (coupon.startsAt !== null && new Date(coupon.startsAt).getTime() > now) return 'scheduled'
  if (coupon.maxRedemptions !== null && coupon.redemptions >= coupon.maxRedemptions)
    return 'exhausted'
  return 'active'
}

const STATE_TONE = {
  active: 'success',
  inactive: 'neutral',
  scheduled: 'info',
  expired: 'warning',
  exhausted: 'warning',
} as const

/**
 * Coupons — contract E's back office (ADR-0024). Create, edit, deactivate and
 * bring back, delete (while never used). Dates, limits and the products a code
 * is restricted to are all visible on the row; every refusal is shown inside
 * the dialog that raised it, in the admin's language.
 */
export function CommerceCouponsRoute(): JSX.Element {
  const { t, i18n } = useTranslation()
  const auth = useAuth()
  const token = auth.state.status === 'authenticated' ? auth.state.token : null
  const roles = auth.state.status === 'authenticated' ? auth.state.user.roles : []
  const canRead = roles.length > 0
  const canWrite =
    roles.includes('admin') || roles.includes('shopkeeper') || roles.includes('editor')

  const [coupons, setCoupons] = useState<readonly Coupon[]>([])
  const [metrics, setMetrics] = useState<CouponMetrics | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const [editing, setEditing] = useState<{ readonly original: Coupon | null } | null>(null)
  const [form, setForm] = useState<CouponForm>(EMPTY_FORM)
  const [errors, setErrors] = useState<Readonly<Record<string, string>>>({})
  const [dialogError, setDialogError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [toDeactivate, setToDeactivate] = useState<Coupon | null>(null)
  const [toDelete, setToDelete] = useState<Coupon | null>(null)

  const [search, setSearch] = useState('')
  const filteredCoupons = coupons.filter((coupon) =>
    coupon.code.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()),
  )
  const page = useLocalPagination(filteredCoupons, search)
  const pager = (
    <Pagination
      variant="pages"
      page={page.page}
      pageCount={page.pageCount}
      onPageChange={page.onPageChange}
      previousLabel={t('lists.previous')}
      nextLabel={t('lists.next')}
      pageInfo={t('lists.pageInfo', {
        from: page.start + 1,
        to: page.start + page.items.length,
        total: page.total,
      })}
    />
  )

  const currencies = useMemo(
    () => currencyOptions(i18n.language, [form.currency]),
    [i18n.language, form.currency],
  )

  const load = useCallback(async () => {
    if (token === null || !canRead) return
    setError(null)
    try {
      const { coupons: list } = await listCoupons(token)
      setCoupons(list)
      // Best-effort: a metrics failure must not stop the coupon list itself.
      await getCouponMetrics(token)
        .then(setMetrics)
        .catch(() => setMetrics(null))
    } catch (caught) {
      setError(commerceErrorMessage(t, caught, 'commerceCoupons.loadError'))
    } finally {
      setLoading(false)
    }
  }, [token, canRead, t])

  useEffect(() => {
    void load()
  }, [load])

  function openDialog(original: Coupon | null): void {
    setEditing({ original })
    setForm(original === null ? EMPTY_FORM : formFor(original))
    setErrors({})
    setDialogError(null)
  }

  function set<K extends keyof CouponForm>(key: K, value: CouponForm[K]): void {
    setForm((current) => ({ ...current, [key]: value }))
  }

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault()
    if (token === null || editing === null) return
    const found: Record<string, string> = {}
    const original = editing.original

    const code = form.code.trim().toUpperCase()
    if (original === null) {
      if (code === '') found['code'] = t('commerceCoupons.codeRequired')
      else if (!CODE_PATTERN.test(code)) found['code'] = t('commerceCoupons.codeInvalid')
      else if (code.length > 64) found['code'] = t('commerceCoupons.codeTooLong')
    }

    let value: number | undefined
    if (form.kind === 'percentage') {
      const basisPoints = percentTextToBasisPoints(form.value)
      if (basisPoints === null || basisPoints <= 0)
        found['value'] = t('commerceCoupons.percentInvalid')
      else value = basisPoints
    } else if (form.kind === 'fixed') {
      const minor = majorTextToMinor(form.value, form.currency)
      if (minor === null || minor <= 0) found['value'] = t('commerceCoupons.amountInvalid')
      else value = minor
    }

    let minSubtotalMinor = 0
    if (form.minSubtotal.trim() !== '') {
      const minor = majorTextToMinor(form.minSubtotal, form.currency)
      if (minor === null) found['minSubtotal'] = t('commerceCoupons.amountInvalid')
      else minSubtotalMinor = minor
    }

    if (form.startsAt !== '' && form.endsAt !== '' && form.endsAt < form.startsAt) {
      found['endsAt'] = t('commerceCoupons.windowInvalid')
    }

    const limit = (text: string, key: string): number | null | undefined => {
      if (text.trim() === '') return null
      const parsed = Number(text.trim())
      if (!Number.isInteger(parsed) || parsed < 1) {
        found[key] = t('commerceCoupons.limitInvalid')
        return undefined
      }
      return parsed
    }
    const maxRedemptions = limit(form.maxRedemptions, 'maxRedemptions')
    const perCustomer = limit(form.maxRedemptionsPerCustomer, 'maxRedemptionsPerCustomer')

    setErrors(found)
    if (Object.keys(found).length > 0) {
      setDialogError(t('commerceCoupons.fixErrors'))
      return
    }
    setDialogError(null)

    const fields = {
      kind: form.kind,
      ...(value === undefined ? {} : { value }),
      ...(form.kind === 'fixed' ? { currency: form.currency } : {}),
      minSubtotalMinor,
      startsAt: form.startsAt === '' ? null : startOfDay(form.startsAt),
      endsAt: form.endsAt === '' ? null : endOfDay(form.endsAt),
      maxRedemptions: maxRedemptions ?? null,
      maxRedemptionsPerCustomer: perCustomer ?? null,
      restrictedProductIds: form.productIds,
    }
    setBusy(true)
    try {
      if (original === null) {
        await createCoupon(token, {
          code,
          kind: form.kind,
          ...(value === undefined ? {} : { value }),
          ...(form.kind === 'fixed' ? { currency: form.currency } : {}),
          ...(minSubtotalMinor > 0 ? { minSubtotalMinor } : {}),
          ...(form.startsAt === '' ? {} : { startsAt: startOfDay(form.startsAt) }),
          ...(form.endsAt === '' ? {} : { endsAt: endOfDay(form.endsAt) }),
          ...(maxRedemptions == null ? {} : { maxRedemptions }),
          ...(perCustomer == null ? {} : { maxRedemptionsPerCustomer: perCustomer }),
          ...(form.productIds.length === 0 ? {} : { restrictedProductIds: form.productIds }),
        })
        setSuccess(t('commerceCoupons.createdDone', { code }))
      } else {
        await updateCoupon(token, original.code, fields)
        setSuccess(t('commerceCoupons.updatedDone', { code: original.code }))
      }
      setEditing(null)
      await load()
    } catch (caught) {
      setDialogError(commerceErrorMessage(t, caught, 'commerceCoupons.saveError'))
    } finally {
      setBusy(false)
    }
  }

  async function confirmDeactivate(): Promise<void> {
    if (token === null || toDeactivate === null) return
    setBusy(true)
    setDialogError(null)
    try {
      await deactivateCoupon(token, toDeactivate.code)
      setSuccess(t('commerceCoupons.deactivatedDone', { code: toDeactivate.code }))
      setToDeactivate(null)
      await load()
    } catch (caught) {
      setDialogError(commerceErrorMessage(t, caught, 'commerceCoupons.updateError'))
    } finally {
      setBusy(false)
    }
  }

  async function confirmDelete(): Promise<void> {
    if (token === null || toDelete === null) return
    setBusy(true)
    setDialogError(null)
    try {
      await deleteCoupon(token, toDelete.code)
      setSuccess(t('commerceCoupons.deletedDone', { code: toDelete.code }))
      setToDelete(null)
      await load()
    } catch (caught) {
      setDialogError(commerceErrorMessage(t, caught, 'commerceCoupons.deleteError'))
    } finally {
      setBusy(false)
    }
  }

  async function reactivate(coupon: Coupon): Promise<void> {
    if (token === null) return
    setActionError(null)
    try {
      await activateCoupon(token, coupon.code)
      setSuccess(t('commerceCoupons.activatedDone', { code: coupon.code }))
      await load()
    } catch (caught) {
      setActionError(commerceErrorMessage(t, caught, 'commerceCoupons.updateError'))
    }
  }

  function describeValue(coupon: Coupon): string {
    if (coupon.kind === 'free_shipping') return t('commerceCoupons.kind.free_shipping')
    if (coupon.kind === 'percentage') return formatBasisPoints(coupon.value, i18n.language)
    return formatMinor(coupon.value, coupon.currency ?? 'EUR', i18n.language)
  }

  function describeValidity(coupon: Coupon): string {
    const format = (iso: string): string => new Date(iso).toLocaleDateString(i18n.language)
    if (coupon.startsAt === null && coupon.endsAt === null) return t('commerceCoupons.alwaysValid')
    if (coupon.startsAt !== null && coupon.endsAt !== null) {
      return t('commerceCoupons.validBetween', {
        from: format(coupon.startsAt),
        to: format(coupon.endsAt),
      })
    }
    if (coupon.startsAt !== null)
      return t('commerceCoupons.validFrom', { from: format(coupon.startsAt) })
    return t('commerceCoupons.validUntil', { to: format(coupon.endsAt ?? '') })
  }

  if (!canRead) {
    return (
      <section aria-labelledby="commerce-coupons-heading">
        <h1 id="commerce-coupons-heading">{t('commerceCoupons.heading')}</h1>
        <p role="alert">{t('commerceCoupons.signedInOnly')}</p>
      </section>
    )
  }

  const now = Date.now()
  const sums = (rows: readonly { currency: string; amountMinor: number }[] | undefined): string =>
    rows === undefined || rows.length === 0
      ? '—'
      : rows.map((row) => formatMinor(row.amountMinor, row.currency, i18n.language)).join(' + ')

  return (
    <section aria-labelledby="commerce-coupons-heading" className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1
          id="commerce-coupons-heading"
          className="m-0 text-2xl leading-tight font-bold tracking-tight"
        >
          {t('commerceCoupons.heading')}
        </h1>
        {canWrite && (
          <Button onClick={() => openDialog(null)}>{t('commerceCoupons.newButton')}</Button>
        )}
      </div>

      {metrics !== null && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label={t('commerceCoupons.metricsActive')} value={String(metrics.activeCoupons)} />
          <Stat
            label={t('commerceCoupons.metricsRedemptions')}
            value={String(metrics.totalRedemptions)}
          />
          <Stat label={t('commerceCoupons.metricsRevenue')} value={sums(metrics.revenueMinor)} />
          <Stat
            label={t('commerceCoupons.metricsDiscount')}
            value={sums(metrics.discountGivenMinor)}
          />
        </div>
      )}

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
        <>
          <Field label={t('lists.search')} className="max-w-sm">
            {(control) => (
              <Input
                {...control}
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            )}
          </Field>
          {pager}
          <TableRoot label={t('commerceCoupons.tableLabel')} stacked>
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeader>{t('commerceCoupons.codeColumn')}</TableHeader>
                  <TableHeader>{t('commerceCoupons.valueColumn')}</TableHeader>
                  <TableHeader>{t('commerceCoupons.validityColumn')}</TableHeader>
                  <TableHeader>{t('commerceCoupons.redemptionsColumn')}</TableHeader>
                  <TableHeader>{t('commerceCoupons.statusColumn')}</TableHeader>
                  <TableHeader>{t('commerceCoupons.actionsColumn')}</TableHeader>
                </TableRow>
              </TableHead>
              <TableBody>
                {page.items.map((coupon) => {
                  const state = stateOf(coupon, now)
                  return (
                    <TableRow key={coupon.code}>
                      <TableCell stack="heading">{coupon.code}</TableCell>
                      <TableCell label={t('commerceCoupons.valueColumn')}>
                        <span className="flex flex-col">
                          <span>{describeValue(coupon)}</span>
                          <span className="text-xs text-muted-foreground">
                            {t(`commerceCoupons.kind.${coupon.kind}`)}
                            {coupon.minSubtotalMinor > 0 &&
                              ` · ${t('commerceCoupons.minimumLabel', {
                                amount: formatMinor(
                                  coupon.minSubtotalMinor,
                                  coupon.currency ?? 'EUR',
                                  i18n.language,
                                ),
                              })}`}
                          </span>
                        </span>
                      </TableCell>
                      <TableCell label={t('commerceCoupons.validityColumn')}>
                        {describeValidity(coupon)}
                      </TableCell>
                      <TableCell label={t('commerceCoupons.redemptionsColumn')}>
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
                          {coupon.restrictedProductIds.length > 0 && (
                            <span className="text-xs text-muted-foreground">
                              {t('commerceCoupons.restrictedLabel', {
                                count: coupon.restrictedProductIds.length,
                              })}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell label={t('commerceCoupons.statusColumn')}>
                        <Badge tone={STATE_TONE[state]}>
                          {t(`commerceCoupons.state.${state}`)}
                        </Badge>
                      </TableCell>
                      <TableCell stack="actions">
                        {canWrite && (
                          <div className="flex flex-wrap gap-2">
                            <Button
                              variant="secondary"
                              size="sm"
                              aria-label={t('commerceCoupons.editLabel', { code: coupon.code })}
                              onClick={() => openDialog(coupon)}
                            >
                              {t('commerceCoupons.edit')}
                            </Button>
                            {coupon.active ? (
                              <Button
                                variant="secondary"
                                size="sm"
                                aria-label={t('commerceCoupons.deactivate', { code: coupon.code })}
                                onClick={() => {
                                  setDialogError(null)
                                  setToDeactivate(coupon)
                                }}
                              >
                                {t('commerceCoupons.deactivateShort')}
                              </Button>
                            ) : (
                              <Button
                                variant="secondary"
                                size="sm"
                                aria-label={t('commerceCoupons.reactivate', { code: coupon.code })}
                                onClick={() => void reactivate(coupon)}
                              >
                                {t('commerceCoupons.reactivateShort')}
                              </Button>
                            )}
                            {coupon.redemptions === 0 && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-destructive"
                                aria-label={t('commerceCoupons.deleteLabel', { code: coupon.code })}
                                onClick={() => {
                                  setDialogError(null)
                                  setToDelete(coupon)
                                }}
                              >
                                {t('commerceCoupons.delete')}
                              </Button>
                            )}
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })}
                {filteredCoupons.length === 0 && (
                  <TableEmpty colSpan={6}>{t('commerceCoupons.empty')}</TableEmpty>
                )}
              </TableBody>
            </Table>
          </TableRoot>
          {pager}
        </>
      )}

      <Modal
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) setEditing(null)
        }}
        title={
          editing?.original == null
            ? t('commerceCoupons.newHeading')
            : t('commerceCoupons.editHeading', { code: editing.original.code })
        }
        closeLabel={t('common.close')}
        className="w-[min(40rem,calc(100vw-2rem))]"
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditing(null)} disabled={busy}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" form="coupon-form" disabled={busy}>
              {editing?.original == null
                ? t('commerceCoupons.createButton')
                : t('commerceCoupons.saveButton')}
            </Button>
          </>
        }
      >
        <form
          id="coupon-form"
          noValidate
          onSubmit={(event) => void submit(event)}
          className="flex flex-col gap-4"
        >
          <Field
            label={t('commerceCoupons.codeColumn')}
            description={
              editing?.original == null
                ? t('commerceCoupons.codeHint')
                : t('commerceCoupons.codeFixedHint')
            }
            error={errors['code'] ?? null}
          >
            {(control) => (
              <Input
                {...control}
                value={form.code}
                disabled={editing?.original != null}
                autoComplete="off"
                onChange={(event) => set('code', event.target.value.toUpperCase())}
              />
            )}
          </Field>
          <Field
            label={t('commerceCoupons.kindColumn')}
            description={
              editing?.original != null && editing.original.redemptions > 0
                ? t('commerceCoupons.kindLockedHint')
                : undefined
            }
          >
            {(control) => (
              <Select
                {...control}
                value={form.kind}
                onChange={(event) => set('kind', event.target.value as CouponKind)}
              >
                {COUPON_KINDS.map((option) => (
                  <option key={option} value={option}>
                    {t(`commerceCoupons.kind.${option}`)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          {form.kind !== 'free_shipping' && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label={
                  form.kind === 'percentage'
                    ? t('commerceCoupons.percentValue')
                    : t('commerceCoupons.amountValue')
                }
                description={
                  form.kind === 'percentage'
                    ? t('commerceCoupons.percentHint')
                    : t('commerceCoupons.amountHint')
                }
                error={errors['value'] ?? null}
              >
                {(control) => (
                  <Input
                    {...control}
                    inputMode="decimal"
                    value={form.value}
                    onChange={(event) => set('value', event.target.value)}
                  />
                )}
              </Field>
              {form.kind === 'fixed' && (
                <Field label={t('commerceProducts.currencyColumn')}>
                  {(control) => (
                    <Select
                      {...control}
                      value={form.currency}
                      onChange={(event) => set('currency', event.target.value)}
                    >
                      {currencies.map((option) => (
                        <option key={option.code} value={option.code}>
                          {option.name}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>
              )}
            </div>
          )}
          <Field
            label={t('commerceCoupons.minSubtotal')}
            description={t('commerceCoupons.minSubtotalHint')}
            error={errors['minSubtotal'] ?? null}
          >
            {(control) => (
              <Input
                {...control}
                inputMode="decimal"
                value={form.minSubtotal}
                onChange={(event) => set('minSubtotal', event.target.value)}
              />
            )}
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('commerceCoupons.startsAt')} error={errors['startsAt'] ?? null}>
              {(control) => (
                <Input
                  {...control}
                  type="date"
                  value={form.startsAt}
                  onChange={(event) => set('startsAt', event.target.value)}
                />
              )}
            </Field>
            <Field
              label={t('commerceCoupons.endsAt')}
              description={t('commerceCoupons.endsAtHint')}
              error={errors['endsAt'] ?? null}
            >
              {(control) => (
                <Input
                  {...control}
                  type="date"
                  value={form.endsAt}
                  onChange={(event) => set('endsAt', event.target.value)}
                />
              )}
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label={t('commerceCoupons.maxRedemptions')}
              description={t('commerceCoupons.maxRedemptionsHint')}
              error={errors['maxRedemptions'] ?? null}
            >
              {(control) => (
                <Input
                  {...control}
                  inputMode="numeric"
                  value={form.maxRedemptions}
                  onChange={(event) => set('maxRedemptions', event.target.value)}
                />
              )}
            </Field>
            <Field
              label={t('commerceCoupons.maxRedemptionsPerCustomer')}
              description={t('commerceCoupons.maxRedemptionsPerCustomerHint')}
              error={errors['maxRedemptionsPerCustomer'] ?? null}
            >
              {(control) => (
                <Input
                  {...control}
                  inputMode="numeric"
                  value={form.maxRedemptionsPerCustomer}
                  onChange={(event) => set('maxRedemptionsPerCustomer', event.target.value)}
                />
              )}
            </Field>
          </div>
          {token !== null && (
            <ProductMultiPicker
              token={token}
              label={t('commerceCoupons.restrictedProductIds')}
              description={t('commerceCoupons.restrictedProductIdsHint')}
              valueIds={form.productIds}
              onChange={(ids) => set('productIds', ids)}
            />
          )}
          <DialogError message={dialogError} />
        </form>
      </Modal>

      <ConfirmDialog
        open={toDeactivate !== null}
        title={t('commerceCoupons.deactivateTitle')}
        confirmLabel={t('commerceCoupons.deactivateConfirm')}
        busy={busy}
        error={dialogError}
        onCancel={() => setToDeactivate(null)}
        onConfirm={() => void confirmDeactivate()}
      >
        <p className="m-0">
          {t('commerceCoupons.deactivateBody', { code: toDeactivate?.code ?? '' })}
        </p>
      </ConfirmDialog>

      <ConfirmDialog
        open={toDelete !== null}
        title={t('commerceCoupons.deleteTitle')}
        confirmLabel={t('commerceCoupons.deleteConfirm')}
        busy={busy}
        error={dialogError}
        onCancel={() => setToDelete(null)}
        onConfirm={() => void confirmDelete()}
      >
        <p className="m-0">{t('commerceCoupons.deleteBody', { code: toDelete?.code ?? '' })}</p>
      </ConfirmDialog>
    </section>
  )
}
