import { type FormEvent, type JSX, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  createSubscription,
  type IntervalUnit,
  type Subscription,
  type VariantSearchHit,
} from '../api/commerce-client.js'
import { Button, Field, Input, Modal, Select } from '../ui/index.js'
import { commerceErrorMessage } from './commerce-errors.js'
import { countryOptions } from './countries.js'
import { DialogError } from './dialog-error.js'
import { majorTextToMinor, minorToMajorText } from './money.js'
import { VariantPicker } from './variant-picker.js'

const UNITS: readonly IntervalUnit[] = ['day', 'week', 'month', 'year']
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u

export interface NewSubscriptionModalProps {
  readonly open: boolean
  readonly token: string
  onClose(): void
  onCreated(subscription: Subscription): void
}

function today(): string {
  const now = new Date()
  const pad = (value: number): string => String(value).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

/**
 * Opens a subscription by hand: a customer (found or created by e-mail), a
 * product picked by name, a cadence, and the day of the first charge. The
 * usual path is a paid order for a recurring product; this is the other one —
 * a standing order agreed by phone, a customer moved over from another tool.
 */
export function NewSubscriptionModal(props: NewSubscriptionModalProps): JSX.Element {
  const { t, i18n } = useTranslation()
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [hit, setHit] = useState<VariantSearchHit | null>(null)
  const [quantity, setQuantity] = useState('1')
  const [every, setEvery] = useState('1')
  const [unit, setUnit] = useState<IntervalUnit>('month')
  const [price, setPrice] = useState('')
  const [startAt, setStartAt] = useState(today())
  const [country, setCountry] = useState('')
  const [errors, setErrors] = useState<Readonly<Record<string, string>>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const countries = useMemo(() => countryOptions(i18n.language), [i18n.language])

  function reset(): void {
    setEmail('')
    setName('')
    setHit(null)
    setQuantity('1')
    setEvery('1')
    setUnit('month')
    setPrice('')
    setStartAt(today())
    setCountry('')
    setErrors({})
    setFormError(null)
  }

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault()
    const found: Record<string, string> = {}
    if (!EMAIL_PATTERN.test(email.trim())) found['email'] = t('commerceManualOrder.emailInvalid')
    if (hit === null) found['variant'] = t('commerceNewSubscription.variantRequired')
    const qty = Number(quantity.trim())
    if (!Number.isInteger(qty) || qty < 1)
      found['quantity'] = t('commerceManualOrder.quantityInvalid')
    const count = Number(every.trim())
    if (!Number.isInteger(count) || count < 1)
      found['every'] = t('commerceNewSubscription.everyInvalid')
    let priceMinor: number | undefined
    if (price.trim() !== '') {
      const minor = majorTextToMinor(price, hit?.variant.currency ?? 'EUR')
      if (minor === null) found['price'] = t('commerceCoupons.amountInvalid')
      else priceMinor = minor
    }
    if (startAt === '') found['startAt'] = t('commerceNewSubscription.startRequired')
    setErrors(found)
    if (Object.keys(found).length > 0 || hit === null) {
      setFormError(t('commerceManualOrder.fixErrors'))
      return
    }
    setBusy(true)
    setFormError(null)
    try {
      const created = await createSubscription(props.token, {
        customer: { email: email.trim(), ...(name.trim() === '' ? {} : { name: name.trim() }) },
        variantId: hit.variant.id,
        intervalUnit: unit,
        intervalCount: count,
        quantity: qty,
        ...(priceMinor === undefined ? {} : { priceMinor }),
        startAt,
        ...(country === '' ? {} : { shippingCountry: country }),
      })
      reset()
      props.onCreated(created)
    } catch (caught) {
      setFormError(commerceErrorMessage(t, caught, 'commerceNewSubscription.createError'))
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
      title={t('commerceNewSubscription.heading')}
      description={t('commerceNewSubscription.description')}
      closeLabel={t('common.close')}
      className="w-[min(40rem,calc(100vw-2rem))]"
      footer={
        <>
          <Button variant="secondary" onClick={() => props.onClose()} disabled={busy}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form="new-subscription-form" disabled={busy}>
            {t('commerceNewSubscription.create')}
          </Button>
        </>
      }
    >
      <form
        id="new-subscription-form"
        noValidate
        onSubmit={(event) => void submit(event)}
        className="flex flex-col gap-4"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('commerceManualOrder.email')} error={errors['email'] ?? null}>
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
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            )}
          </Field>
        </div>
        <VariantPicker
          token={props.token}
          label={t('commerceManualOrder.product')}
          selected={hit}
          error={errors['variant'] ?? null}
          onSelect={(next) => {
            setHit(next)
            if (next !== null)
              setPrice(minorToMajorText(next.variant.priceMinor, next.variant.currency))
          }}
        />
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label={t('commerceManualOrder.quantity')} error={errors['quantity'] ?? null}>
            {(control) => (
              <Input
                {...control}
                inputMode="numeric"
                value={quantity}
                onChange={(event) => setQuantity(event.target.value)}
              />
            )}
          </Field>
          <Field label={t('commerceNewSubscription.every')} error={errors['every'] ?? null}>
            {(control) => (
              <Input
                {...control}
                inputMode="numeric"
                value={every}
                onChange={(event) => setEvery(event.target.value)}
              />
            )}
          </Field>
          <Field label={t('commerceNewSubscription.unit')}>
            {(control) => (
              <Select
                {...control}
                value={unit}
                onChange={(event) => setUnit(event.target.value as IntervalUnit)}
              >
                {UNITS.map((option) => (
                  <option key={option} value={option}>
                    {t(`commerceNewSubscription.units.${option}`)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label={t('commerceNewSubscription.price')}
            description={t('commerceNewSubscription.priceHint')}
            error={errors['price'] ?? null}
          >
            {(control) => (
              <Input
                {...control}
                inputMode="decimal"
                value={price}
                onChange={(event) => setPrice(event.target.value)}
              />
            )}
          </Field>
          <Field
            label={t('commerceNewSubscription.startAt')}
            description={t('commerceNewSubscription.startAtHint')}
            error={errors['startAt'] ?? null}
          >
            {(control) => (
              <Input
                {...control}
                type="date"
                value={startAt}
                onChange={(event) => setStartAt(event.target.value)}
              />
            )}
          </Field>
        </div>
        <Field
          label={t('commerceManualOrder.country')}
          description={t('commerceNewSubscription.countryHint')}
        >
          {(control) => (
            <Select
              {...control}
              value={country}
              onChange={(event) => setCountry(event.target.value)}
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
        <DialogError message={formError} />
      </form>
    </Modal>
  )
}
