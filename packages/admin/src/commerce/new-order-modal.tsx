import { type FormEvent, type JSX, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  createManualOrder,
  listShippingMethods,
  MANUAL_PAYMENT_METHODS,
  type ManualPaymentMethod,
  type PlaceOrderOutcome,
  type ShippingMethod,
  type VariantSearchHit,
} from '../api/commerce-client.js'
import { Button, Field, Input, Modal, Select } from '../ui/index.js'
import { commerceErrorMessage } from './commerce-errors.js'
import { countryOptions } from './countries.js'
import { DialogError } from './dialog-error.js'
import { VariantPicker } from './variant-picker.js'

interface DraftLine {
  readonly key: number
  readonly hit: VariantSearchHit | null
  readonly quantity: string
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u

export interface NewOrderModalProps {
  readonly open: boolean
  readonly token: string
  /** Whether the person may also record the payment (`commerce.payment.settle`). */
  readonly canSettle: boolean
  onClose(): void
  onCreated(orderId: string): void
}

/**
 * A shopkeeper-entered order — a phone order, a trade-show sale, a correction.
 *
 * Products are found by typing their name or SKU. Everything that can be wrong
 * is said next to the field that is wrong, and a refusal from the shop (no
 * stock, a coupon that does not apply) is shown inside this dialog, never on
 * the page behind it. Nothing is created unless the whole order stands: a
 * refused order leaves no customer behind (the server places the customer in
 * the same transaction as the order).
 */
export function NewOrderModal(props: NewOrderModalProps): JSX.Element {
  const { t, i18n } = useTranslation()
  const [email, setEmail] = useState('')
  const [customerName, setCustomerName] = useState('')
  const [country, setCountry] = useState('')
  const [lines, setLines] = useState<readonly DraftLine[]>([{ key: 1, hit: null, quantity: '1' }])
  const [nextKey, setNextKey] = useState(2)
  const [line1, setLine1] = useState('')
  const [line2, setLine2] = useState('')
  const [city, setCity] = useState('')
  const [postalCode, setPostalCode] = useState('')
  const [phone, setPhone] = useState('')
  const [methods, setMethods] = useState<readonly ShippingMethod[]>([])
  const [shippingMethodId, setShippingMethodId] = useState('')
  const [couponCode, setCouponCode] = useState('')
  const [alreadyPaid, setAlreadyPaid] = useState(false)
  const [payMethod, setPayMethod] = useState<ManualPaymentMethod>('bank_transfer')
  const [fieldErrors, setFieldErrors] = useState<Readonly<Record<string, string>>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const countries = useMemo(() => countryOptions(i18n.language), [i18n.language])

  useEffect(() => {
    if (!props.open) return
    let cancelled = false
    listShippingMethods(props.token)
      .then((response) => {
        if (!cancelled) setMethods(response.methods.filter((method) => method.active))
      })
      .catch(() => {
        if (!cancelled) setMethods([])
      })
    return () => {
      cancelled = true
    }
  }, [props.open, props.token])

  const offeredMethods = methods.filter(
    (method) => method.country === null || country === '' || method.country === country,
  )

  function reset(): void {
    setEmail('')
    setCustomerName('')
    setCountry('')
    setLines([{ key: 1, hit: null, quantity: '1' }])
    setNextKey(2)
    setLine1('')
    setLine2('')
    setCity('')
    setPostalCode('')
    setPhone('')
    setShippingMethodId('')
    setCouponCode('')
    setAlreadyPaid(false)
    setPayMethod('bank_transfer')
    setFieldErrors({})
    setFormError(null)
  }

  function describeOutcome(outcome: Exclude<PlaceOrderOutcome, { kind: 'placed' }>): string {
    if (outcome.kind === 'out_of_stock') {
      return outcome.shortfalls
        .map((shortfall) => {
          const hit = lines.find((line) => line.hit?.variant.id === shortfall.variantId)?.hit
          return t('commerceManualOrder.outOfStockLine', {
            name:
              hit === undefined || hit === null
                ? shortfall.variantId
                : `${hit.product.title} — ${hit.variant.title}`,
            requested: shortfall.requested,
            available: shortfall.available,
          })
        })
        .join(' ')
    }
    if (outcome.kind === 'coupon_refused') {
      const key = `commerceErrors.${outcome.code ?? ''}`
      const translated = t(key)
      return translated === key ? t('commerceManualOrder.couponRefused') : translated
    }
    return t('commerceManualOrder.empty')
  }

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault()
    setFormError(null)
    const errors: Record<string, string> = {}

    if (!EMAIL_PATTERN.test(email.trim())) errors['email'] = t('commerceManualOrder.emailInvalid')

    const chosen = lines.filter((line) => line.hit !== null)
    if (chosen.length === 0) {
      errors['lines'] = t('commerceManualOrder.empty')
    }
    const parsedLines: { variantId: string; quantity: number }[] = []
    for (const line of chosen) {
      const quantity = Number(line.quantity.trim())
      if (!Number.isInteger(quantity) || quantity < 1) {
        errors[`quantity-${line.key}`] = t('commerceManualOrder.quantityInvalid')
      } else if (line.hit !== null) {
        parsedLines.push({ variantId: line.hit.variant.id, quantity })
      }
    }
    const currencies = new Set(chosen.map((line) => line.hit?.variant.currency))
    if (currencies.size > 1) errors['lines'] = t('commerceManualOrder.mixedCurrencies')

    const addressFilled = [line1, city, postalCode].some((value) => value.trim() !== '')
    if (addressFilled) {
      if (line1.trim() === '') errors['line1'] = t('commerceManualOrder.addressRequired')
      if (city.trim() === '') errors['city'] = t('commerceManualOrder.addressRequired')
      if (postalCode.trim() === '') errors['postalCode'] = t('commerceManualOrder.addressRequired')
    }
    setFieldErrors(errors)
    if (Object.keys(errors).length > 0) {
      setFormError(t('commerceManualOrder.fixErrors'))
      return
    }

    const currency = chosen[0]?.hit?.variant.currency ?? 'EUR'
    setBusy(true)
    try {
      const outcome = await createManualOrder(props.token, {
        email: email.trim(),
        currency,
        lines: parsedLines,
        ...(customerName.trim() === '' ? {} : { customerName: customerName.trim() }),
        ...(country === '' ? {} : { shippingCountry: country }),
        ...(addressFilled
          ? {
              shippingAddress: {
                line1: line1.trim(),
                city: city.trim(),
                postalCode: postalCode.trim(),
                ...(line2.trim() === '' ? {} : { line2: line2.trim() }),
                ...(phone.trim() === '' ? {} : { phone: phone.trim() }),
                ...(customerName.trim() === '' ? {} : { recipient: customerName.trim() }),
                ...(country === '' ? {} : { country }),
              },
            }
          : {}),
        ...(shippingMethodId === '' ? {} : { shippingMethodId }),
        ...(couponCode.trim() === '' ? {} : { couponCode: couponCode.trim() }),
        ...(alreadyPaid && props.canSettle ? { paid: { method: payMethod } } : {}),
      })
      if (outcome.kind === 'placed') {
        reset()
        props.onCreated(outcome.order.id)
        return
      }
      setFormError(describeOutcome(outcome))
    } catch (caught) {
      setFormError(commerceErrorMessage(t, caught, 'commerceManualOrder.createError'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={props.open}
      onOpenChange={(open) => {
        if (!open) props.onClose()
      }}
      title={t('commerceManualOrder.heading')}
      description={t('commerceManualOrder.description')}
      closeLabel={t('common.close')}
      className="w-[min(42rem,calc(100vw-2rem))]"
      footer={
        <>
          <Button variant="secondary" onClick={() => props.onClose()} disabled={busy}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form="manual-order-form" disabled={busy}>
            {t('commerceManualOrder.create')}
          </Button>
        </>
      }
    >
      <form
        id="manual-order-form"
        noValidate
        onSubmit={(event) => void submit(event)}
        className="flex flex-col gap-4"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('commerceManualOrder.email')} error={fieldErrors['email'] ?? null}>
            {(control) => (
              <Input
                {...control}
                type="email"
                autoComplete="off"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            )}
          </Field>
          <Field label={t('commerceManualOrder.customerName')}>
            {(control) => (
              <Input
                {...control}
                autoComplete="off"
                value={customerName}
                onChange={(event) => setCustomerName(event.target.value)}
              />
            )}
          </Field>
        </div>

        <fieldset className="m-0 flex min-w-0 flex-col gap-3 border-0 p-0">
          <legend className="mb-1 p-0 text-sm font-medium">{t('commerceManualOrder.lines')}</legend>
          {lines.map((line, index) => (
            <div key={line.key} className="flex flex-wrap items-start gap-2">
              <div className="min-w-0 flex-1 basis-60">
                <VariantPicker
                  token={props.token}
                  label={t('commerceManualOrder.product')}
                  selected={line.hit}
                  excludeVariantIds={lines.flatMap((entry) =>
                    entry.hit === null ? [] : [entry.hit.variant.id],
                  )}
                  onSelect={(hit) =>
                    setLines((current) =>
                      current.map((entry) => (entry.key === line.key ? { ...entry, hit } : entry)),
                    )
                  }
                />
              </div>
              <div className="w-24">
                <Field
                  label={t('commerceManualOrder.quantity')}
                  error={fieldErrors[`quantity-${line.key}`] ?? null}
                >
                  {(control) => (
                    <Input
                      {...control}
                      inputMode="numeric"
                      value={line.quantity}
                      onChange={(event) =>
                        setLines((current) =>
                          current.map((entry) =>
                            entry.key === line.key
                              ? { ...entry, quantity: event.target.value }
                              : entry,
                          ),
                        )
                      }
                    />
                  )}
                </Field>
              </div>
              {lines.length > 1 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="mt-6"
                  aria-label={t('commerceManualOrder.removeLineN', { n: index + 1 })}
                  onClick={() => setLines((current) => current.filter((e) => e.key !== line.key))}
                >
                  {t('commerceManualOrder.removeLine')}
                </Button>
              )}
            </div>
          ))}
          {fieldErrors['lines'] !== undefined && (
            <p role="alert" className="m-0 text-xs font-medium text-destructive">
              {fieldErrors['lines']}
            </p>
          )}
          <div>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => {
                setLines((current) => [...current, { key: nextKey, hit: null, quantity: '1' }])
                setNextKey((key) => key + 1)
              }}
            >
              {t('commerceManualOrder.addLine')}
            </Button>
          </div>
        </fieldset>

        <fieldset className="m-0 flex min-w-0 flex-col gap-3 border-0 p-0">
          <legend className="mb-1 p-0 text-sm font-medium">
            {t('commerceManualOrder.deliveryHeading')}
          </legend>
          <Field
            label={t('commerceManualOrder.country')}
            description={t('commerceManualOrder.countryHint')}
          >
            {(control) => (
              <Select
                {...control}
                value={country}
                onChange={(event) => {
                  setCountry(event.target.value)
                  setShippingMethodId('')
                }}
              >
                <option value="">{t('commerceManualOrder.noCountry')}</option>
                {countries.map((option) => (
                  <option key={option.code} value={option.code}>
                    {option.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label={t('commerceOrderDetail.addressLine1')} error={fieldErrors['line1'] ?? null}>
            {(control) => (
              <Input {...control} value={line1} onChange={(e) => setLine1(e.target.value)} />
            )}
          </Field>
          <Field label={t('commerceOrderDetail.addressLine2')}>
            {(control) => (
              <Input {...control} value={line2} onChange={(e) => setLine2(e.target.value)} />
            )}
          </Field>
          <div className="grid gap-3 sm:grid-cols-[10rem_1fr]">
            <Field
              label={t('commerceOrderDetail.addressPostalCode')}
              error={fieldErrors['postalCode'] ?? null}
            >
              {(control) => (
                <Input
                  {...control}
                  value={postalCode}
                  onChange={(e) => setPostalCode(e.target.value)}
                />
              )}
            </Field>
            <Field label={t('commerceOrderDetail.addressCity')} error={fieldErrors['city'] ?? null}>
              {(control) => (
                <Input {...control} value={city} onChange={(e) => setCity(e.target.value)} />
              )}
            </Field>
          </div>
          <Field label={t('commerceOrderDetail.addressPhone')}>
            {(control) => (
              <Input
                {...control}
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            )}
          </Field>
          <Field label={t('commerceManualOrder.shippingMethod')}>
            {(control) => (
              <Select
                {...control}
                value={shippingMethodId}
                onChange={(event) => setShippingMethodId(event.target.value)}
              >
                <option value="">{t('commerceManualOrder.noShipping')}</option>
                {offeredMethods.map((method) => (
                  <option key={method.id} value={method.id}>
                    {method.label}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </fieldset>

        <Field
          label={t('commerceManualOrder.coupon')}
          description={t('commerceManualOrder.couponHint')}
        >
          {(control) => (
            <Input
              {...control}
              value={couponCode}
              onChange={(event) => setCouponCode(event.target.value.toUpperCase())}
            />
          )}
        </Field>

        {props.canSettle && (
          <fieldset className="m-0 flex min-w-0 flex-col gap-2 border-0 p-0">
            <legend className="mb-1 p-0 text-sm font-medium">
              {t('commerceManualOrder.paymentHeading')}
            </legend>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={alreadyPaid}
                onChange={(event) => setAlreadyPaid(event.target.checked)}
              />
              {t('commerceManualOrder.alreadyPaid')}
            </label>
            {alreadyPaid && (
              <Field label={t('commerceManualOrder.payMethod')}>
                {(control) => (
                  <Select
                    {...control}
                    value={payMethod}
                    onChange={(event) => setPayMethod(event.target.value as ManualPaymentMethod)}
                  >
                    {MANUAL_PAYMENT_METHODS.map((method) => (
                      <option key={method} value={method}>
                        {t(`commercePaymentMethod.${method}`)}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
            )}
          </fieldset>
        )}

        <DialogError message={formError} />
      </form>
    </Modal>
  )
}
