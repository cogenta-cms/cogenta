import { type JSX, useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router'
import {
  type ChangePlanResult,
  cancelSubscription,
  changeSubscriptionPlan,
  listProducts,
  type Product,
  pauseSubscription,
  readProduct,
  readSubscription,
  resumeSubscription,
  type Subscription,
  type SubscriptionCycle,
  type SubscriptionDunning,
  type Variant,
} from '../api/commerce-client.js'
import { ApiError } from '../api/http.js'
import { useAuth } from '../auth/auth-context.js'
import { formatMinor } from '../commerce/money.js'
import {
  Button,
  Field,
  Input,
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

  // ---- change plan (audit T-COM-02: `changeSubscriptionPlan` shipped with
  // fiche 53 but no screen ever called it) --------------------------------
  const [changePlanOpen, setChangePlanOpen] = useState(false)
  const [products, setProducts] = useState<readonly Product[] | null>(null)
  const [productsError, setProductsError] = useState<string | null>(null)
  const [selectedProductId, setSelectedProductId] = useState('')
  const [variants, setVariants] = useState<readonly Variant[] | null>(null)
  const [variantsError, setVariantsError] = useState<string | null>(null)
  const [selectedVariantId, setSelectedVariantId] = useState('')
  const [quantityText, setQuantityText] = useState('1')
  const [prorate, setProrate] = useState(true)
  // Two clicks, not one: the fiche's own acceptance criterion is that a
  // change is never applied "à l'aveugle" — a plan change moves money
  // immediately (a positive proration is charged as a real order, see
  // `changePlan`'s own doc), so the first click only opens this confirmation,
  // the second actually calls the API.
  const [confirmingChange, setConfirmingChange] = useState(false)
  const [changingPlan, setChangingPlan] = useState(false)
  const [changePlanError, setChangePlanError] = useState<string | null>(null)
  const [changePlanResult, setChangePlanResult] = useState<ChangePlanResult | null>(null)

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

  async function openChangePlan(): Promise<void> {
    setChangePlanOpen(true)
    setChangePlanError(null)
    setChangePlanResult(null)
    setConfirmingChange(false)
    if (token === null || products !== null) return
    setProductsError(null)
    try {
      const result = await listProducts(token, { status: 'active', limit: 200 })
      setProducts(result.products)
    } catch (caught) {
      setProductsError(
        caught instanceof ApiError
          ? caught.message
          : t('commerceSubscriptionDetail.changePlanLoadProductsError'),
      )
    }
  }

  async function selectProduct(productId: string): Promise<void> {
    setSelectedProductId(productId)
    setSelectedVariantId('')
    setVariants(null)
    setVariantsError(null)
    setConfirmingChange(false)
    if (token === null || productId === '') return
    try {
      const result = await readProduct(token, productId)
      // Only a variant billed in the same currency can ever be picked — the
      // store itself refuses the rest with `COMMERCE_CURRENCY_MISMATCH`
      // (changing currency mid-subscription is not supported), so filtering
      // here keeps this form from ever offering a choice that fails.
      setVariants(result.variants.filter((variant) => variant.currency === subscription?.currency))
    } catch (caught) {
      setVariantsError(
        caught instanceof ApiError
          ? caught.message
          : t('commerceSubscriptionDetail.changePlanLoadVariantsError'),
      )
    }
  }

  async function confirmChangePlan(): Promise<void> {
    if (token === null || selectedVariantId === '') return
    const quantity = Number.parseInt(quantityText, 10)
    setChangingPlan(true)
    setChangePlanError(null)
    try {
      const result = await changeSubscriptionPlan(token, id, {
        variantId: selectedVariantId,
        ...(Number.isInteger(quantity) && quantity > 0 ? { quantity } : {}),
        prorate,
      })
      setSubscription(result.subscription)
      setChangePlanResult(result)
      setConfirmingChange(false)
      setChangePlanOpen(false)
    } catch (caught) {
      setChangePlanError(
        caught instanceof ApiError
          ? caught.message
          : t('commerceSubscriptionDetail.changePlanError'),
      )
    } finally {
      setChangingPlan(false)
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
          <h1 className="m-0 text-2xl leading-tight font-bold tracking-tight">
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
          {subscription.status !== 'cancelled' && !changePlanOpen && (
            <Button variant="secondary" size="sm" onClick={() => void openChangePlan()}>
              {t('commerceSubscriptionDetail.changePlanOpen')}
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

      {changePlanResult !== null && (
        <Notice tone={changePlanResult.prorationMinor < 0 ? 'warning' : 'success'} live="polite">
          <p>
            {changePlanResult.prorationMinor > 0
              ? t('commerceSubscriptionDetail.changePlanChargedResult', {
                  amount: formatMinor(
                    changePlanResult.prorationMinor,
                    subscription.currency,
                    i18n.language,
                  ),
                })
              : changePlanResult.prorationMinor < 0
                ? t('commerceSubscriptionDetail.changePlanCreditResult', {
                    amount: formatMinor(
                      Math.abs(changePlanResult.prorationMinor),
                      subscription.currency,
                      i18n.language,
                    ),
                  })
                : t('commerceSubscriptionDetail.changePlanNoChargeResult')}
          </p>
        </Notice>
      )}

      {changePlanOpen && (
        <div className="flex flex-col gap-3 rounded-md border border-input bg-card p-4">
          <h2 className="m-0 text-sm font-semibold">
            {t('commerceSubscriptionDetail.changePlanHeading')}
          </h2>

          {productsError !== null && (
            <Notice tone="danger" live="assertive">
              <p>{productsError}</p>
            </Notice>
          )}

          <Field label={t('commerceSubscriptionDetail.changePlanProductLabel')}>
            {(control) => (
              <Select
                {...control}
                value={selectedProductId}
                onChange={(event) => void selectProduct(event.target.value)}
                disabled={products === null}
              >
                <option value="">
                  {t('commerceSubscriptionDetail.changePlanProductPlaceholder')}
                </option>
                {(products ?? []).map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.title}
                  </option>
                ))}
              </Select>
            )}
          </Field>

          {variantsError !== null && (
            <Notice tone="danger" live="assertive">
              <p>{variantsError}</p>
            </Notice>
          )}

          {selectedProductId !== '' && (
            <Field label={t('commerceSubscriptionDetail.changePlanVariantLabel')}>
              {(control) => (
                <Select
                  {...control}
                  value={selectedVariantId}
                  onChange={(event) => {
                    setSelectedVariantId(event.target.value)
                    setConfirmingChange(false)
                  }}
                  disabled={variants === null}
                >
                  <option value="">
                    {t('commerceSubscriptionDetail.changePlanVariantPlaceholder')}
                  </option>
                  {(variants ?? []).map((variant) => (
                    <option key={variant.id} value={variant.id}>
                      {variant.title} —{' '}
                      {formatMinor(variant.priceMinor, variant.currency, i18n.language)}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          )}

          <div className="grid grid-cols-2 gap-4">
            <Field label={t('commerceSubscriptionDetail.changePlanQuantityLabel')}>
              {(control) => (
                <Input
                  {...control}
                  type="number"
                  min={1}
                  step={1}
                  value={quantityText}
                  onChange={(event) => {
                    setQuantityText(event.target.value)
                    setConfirmingChange(false)
                  }}
                />
              )}
            </Field>
            <label className="mt-6 flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={prorate}
                onChange={(event) => {
                  setProrate(event.target.checked)
                  setConfirmingChange(false)
                }}
              />
              {t('commerceSubscriptionDetail.changePlanProrateLabel')}
            </label>
          </div>

          {changePlanError !== null && (
            <Notice tone="danger" live="assertive">
              <p>{changePlanError}</p>
            </Notice>
          )}

          {confirmingChange && (
            <Notice tone="warning" live="polite">
              <p>{t('commerceSubscriptionDetail.changePlanConfirmPrompt')}</p>
            </Notice>
          )}

          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setChangePlanOpen(false)
                setConfirmingChange(false)
              }}
            >
              {t('commerceSubscriptionDetail.changePlanCancelButton')}
            </Button>
            {confirmingChange ? (
              <Button
                variant="primary"
                size="sm"
                disabled={changingPlan}
                onClick={() => void confirmChangePlan()}
              >
                {t('commerceSubscriptionDetail.changePlanConfirmButton')}
              </Button>
            ) : (
              <Button
                variant="primary"
                size="sm"
                disabled={selectedVariantId === ''}
                onClick={() => setConfirmingChange(true)}
              >
                {t('commerceSubscriptionDetail.changePlanSubmit')}
              </Button>
            )}
          </div>
        </div>
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
