import { type FormEvent, type JSX, useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  createShippingMethod,
  deleteShippingMethod,
  listShippingMethods,
  type ShippingKind,
  type ShippingMethod,
  type ShippingQuote,
  simulateShipping,
  updateShippingMethod,
} from '../api/commerce-client.js'
import { useAuth } from '../auth/auth-context.js'
import { commerceErrorMessage } from '../commerce/commerce-errors.js'
import { ConfirmDialog } from '../commerce/confirm-dialog.js'
import { countryName, countryOptions } from '../commerce/countries.js'
import { DialogError } from '../commerce/dialog-error.js'
import {
  currencyOptions,
  formatMinor,
  majorTextToMinor,
  minorToMajorText,
} from '../commerce/money.js'
import { useShopCurrency } from '../commerce/use-shop-currency.js'
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
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

const SHIPPING_KINDS: readonly ShippingKind[] = ['flat', 'by_weight', 'free', 'pickup']

interface MethodForm {
  readonly label: string
  readonly kind: ShippingKind
  readonly country: string
  readonly region: string
  readonly currency: string
  readonly amount: string
  readonly perKg: string
  readonly freeOver: string
  readonly carrier: string
  readonly active: boolean
}

function emptyForm(currency: string): MethodForm {
  return {
    label: '',
    kind: 'flat',
    country: '',
    region: '',
    currency,
    amount: '',
    perKg: '',
    freeOver: '',
    carrier: '',
    active: true,
  }
}

/**
 * Shipping — fiche 34 task 2. Methods on `@cogenta/commerce`'s already-tested
 * `ShippingStore`; the simulator calls `available()`, the exact function
 * checkout uses, so what it shows is what an order gets.
 *
 * Countries and currencies are picked from lists, amounts take a decimal comma,
 * and every field a kind does not use (a free method has no price) is hidden
 * rather than left to be filled in and ignored.
 */
export function CommerceShippingRoute(): JSX.Element {
  const { t, i18n } = useTranslation()
  const auth = useAuth()
  const token = auth.state.status === 'authenticated' ? auth.state.token : null
  const roles = auth.state.status === 'authenticated' ? auth.state.user.roles : []
  // The server only asserts `commerce.catalog.write` (also held by `editor`
  // and `shopkeeper`), so any signed-in commerce role may open this screen.
  const canRead = roles.length > 0
  const canWrite =
    roles.includes('admin') || roles.includes('shopkeeper') || roles.includes('editor')
  const shopCurrency = useShopCurrency(token)

  const [methods, setMethods] = useState<readonly ShippingMethod[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const [editing, setEditing] = useState<{ readonly method: ShippingMethod | null } | null>(null)
  const [form, setForm] = useState<MethodForm>(emptyForm('EUR'))
  const [errors, setErrors] = useState<Readonly<Record<string, string>>>({})
  const [dialogError, setDialogError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [toDelete, setToDelete] = useState<ShippingMethod | null>(null)

  const [simCountry, setSimCountry] = useState('')
  const [simRegion, setSimRegion] = useState('')
  const [simCurrency, setSimCurrency] = useState('')
  const [simWeight, setSimWeight] = useState('0')
  const [simSubtotal, setSimSubtotal] = useState('')
  const [quotes, setQuotes] = useState<readonly ShippingQuote[] | null>(null)
  const [simErrors, setSimErrors] = useState<Readonly<Record<string, string>>>({})
  const [simError, setSimError] = useState<string | null>(null)

  const countries = useMemo(() => countryOptions(i18n.language), [i18n.language])
  const currencies = useMemo(
    () => currencyOptions(i18n.language, [form.currency, shopCurrency]),
    [i18n.language, form.currency, shopCurrency],
  )
  const effectiveSimCurrency = simCurrency === '' ? shopCurrency : simCurrency

  const load = useCallback(async () => {
    if (token === null || !canRead) return
    setError(null)
    try {
      const { methods: list } = await listShippingMethods(token)
      setMethods(list)
    } catch (caught) {
      setError(commerceErrorMessage(t, caught, 'commerceShipping.loadError'))
    } finally {
      setLoading(false)
    }
  }, [token, canRead, t])

  useEffect(() => {
    void load()
  }, [load])

  function set<K extends keyof MethodForm>(key: K, value: MethodForm[K]): void {
    setForm((current) => ({ ...current, [key]: value }))
  }

  function openDialog(method: ShippingMethod | null): void {
    setEditing({ method })
    setErrors({})
    setDialogError(null)
    setForm(
      method === null
        ? emptyForm(shopCurrency)
        : {
            label: method.label,
            kind: method.kind,
            country: method.country ?? '',
            region: method.region ?? '',
            currency: method.currency,
            amount:
              method.kind === 'free' || method.kind === 'pickup'
                ? ''
                : minorToMajorText(method.amountMinor, method.currency),
            perKg:
              method.perKgMinor === 0 ? '' : minorToMajorText(method.perKgMinor, method.currency),
            freeOver:
              method.freeOverMinor === null
                ? ''
                : minorToMajorText(method.freeOverMinor, method.currency),
            carrier: method.carrier ?? '',
            active: method.active,
          },
    )
  }

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault()
    if (token === null || editing === null) return
    const found: Record<string, string> = {}
    if (form.label.trim() === '') found['label'] = t('commerceShipping.labelRequired')

    const priced = form.kind === 'flat' || form.kind === 'by_weight'
    let amountMinor = 0
    if (priced) {
      const parsed = majorTextToMinor(form.amount, form.currency)
      if (parsed === null) found['amount'] = t('commerceShipping.amountInvalid')
      else amountMinor = parsed
    }
    let perKgMinor = 0
    if (form.kind === 'by_weight' && form.perKg.trim() !== '') {
      const parsed = majorTextToMinor(form.perKg, form.currency)
      if (parsed === null) found['perKg'] = t('commerceShipping.amountInvalid')
      else perKgMinor = parsed
    }
    let freeOverMinor: number | null = null
    if (priced && form.freeOver.trim() !== '') {
      const parsed = majorTextToMinor(form.freeOver, form.currency)
      if (parsed === null) found['freeOver'] = t('commerceShipping.amountInvalid')
      else freeOverMinor = parsed
    }
    setErrors(found)
    if (Object.keys(found).length > 0) {
      setDialogError(t('commerceShipping.fixErrors'))
      return
    }
    setBusy(true)
    setDialogError(null)
    try {
      if (editing.method === null) {
        await createShippingMethod(token, {
          label: form.label.trim(),
          currency: form.currency,
          kind: form.kind,
          amountMinor,
          ...(perKgMinor > 0 ? { perKgMinor } : {}),
          ...(freeOverMinor === null ? {} : { freeOverMinor }),
          ...(form.country === '' ? {} : { country: form.country }),
          ...(form.region.trim() === '' ? {} : { region: form.region.trim() }),
          ...(form.carrier.trim() === '' ? {} : { carrier: form.carrier.trim() }),
        })
        setSuccess(t('commerceShipping.createdDone', { label: form.label.trim() }))
      } else {
        await updateShippingMethod(token, editing.method.id, {
          label: form.label.trim(),
          currency: form.currency,
          kind: form.kind,
          amountMinor,
          perKgMinor,
          freeOverMinor,
          country: form.country === '' ? null : form.country,
          region: form.region.trim() === '' ? null : form.region.trim(),
          carrier: form.carrier.trim() === '' ? null : form.carrier.trim(),
          active: form.active,
        })
        setSuccess(t('commerceShipping.updatedDone', { label: form.label.trim() }))
      }
      setEditing(null)
      await load()
    } catch (caught) {
      setDialogError(commerceErrorMessage(t, caught, 'commerceShipping.saveError'))
    } finally {
      setBusy(false)
    }
  }

  async function confirmDelete(): Promise<void> {
    if (token === null || toDelete === null) return
    setBusy(true)
    setDialogError(null)
    try {
      await deleteShippingMethod(token, toDelete.id)
      setSuccess(t('commerceShipping.deletedDone', { label: toDelete.label }))
      setToDelete(null)
      await load()
    } catch (caught) {
      setDialogError(commerceErrorMessage(t, caught, 'commerceShipping.deleteError'))
    } finally {
      setBusy(false)
    }
  }

  async function runSimulation(event: FormEvent): Promise<void> {
    event.preventDefault()
    if (token === null) return
    setSimError(null)
    setQuotes(null)
    const found: Record<string, string> = {}
    const subtotalMinor =
      simSubtotal.trim() === '' ? 0 : majorTextToMinor(simSubtotal, effectiveSimCurrency)
    if (subtotalMinor === null) found['subtotal'] = t('commerceShipping.amountInvalid')
    const weight = Number(simWeight.trim() === '' ? '0' : simWeight.trim())
    if (!Number.isInteger(weight) || weight < 0)
      found['weight'] = t('commerceShipping.weightInvalid')
    setSimErrors(found)
    if (Object.keys(found).length > 0 || subtotalMinor === null) return
    try {
      const { quotes: result } = await simulateShipping(token, {
        currency: effectiveSimCurrency,
        weightGrams: weight,
        subtotalMinor,
        ...(simCountry === '' ? {} : { country: simCountry }),
        ...(simRegion.trim() === '' ? {} : { region: simRegion.trim() }),
      })
      setQuotes(result)
    } catch (caught) {
      setSimError(commerceErrorMessage(t, caught, 'commerceShipping.simulateError'))
    }
  }

  function zoneOf(method: ShippingMethod): string {
    const place =
      method.country === null
        ? t('commerceShipping.everywhere')
        : countryName(method.country, i18n.language)
    return method.region === null ? place : `${place} / ${method.region}`
  }

  function rateOf(method: ShippingMethod): string {
    if (method.kind === 'free' || method.kind === 'pickup') return t('commerceShipping.free')
    const base = formatMinor(method.amountMinor, method.currency, i18n.language)
    const parts = [base]
    if (method.kind === 'by_weight' && method.perKgMinor > 0) {
      parts.push(
        t('commerceShipping.perKgRate', {
          amount: formatMinor(method.perKgMinor, method.currency, i18n.language),
        }),
      )
    }
    if (method.freeOverMinor !== null) {
      parts.push(
        `(${t('commerceShipping.freeOver', {
          amount: formatMinor(method.freeOverMinor, method.currency, i18n.language),
        })})`,
      )
    }
    return parts.join(' ')
  }

  if (!canRead) {
    return (
      <section aria-labelledby="commerce-shipping-heading">
        <h1 id="commerce-shipping-heading">{t('commerceShipping.heading')}</h1>
        <p role="alert">{t('commerceShipping.signedInOnly')}</p>
      </section>
    )
  }

  const priced = form.kind === 'flat' || form.kind === 'by_weight'

  return (
    <section aria-labelledby="commerce-shipping-heading" className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1
            id="commerce-shipping-heading"
            className="m-0 text-2xl leading-tight font-bold tracking-tight"
          >
            {t('commerceShipping.heading')}
          </h1>
          <p className="text-muted-foreground text-sm">{t('commerceShipping.description')}</p>
        </div>
        {canWrite && (
          <Button onClick={() => openDialog(null)}>{t('commerceShipping.newButton')}</Button>
        )}
      </div>

      {success !== null && (
        <Notice tone="success" live="polite">
          <p>{success}</p>
        </Notice>
      )}
      {error !== null && (
        <Notice tone="danger" live="assertive">
          <p>{error}</p>
        </Notice>
      )}
      {loading && <p>{t('common.loading')}</p>}

      {!loading && error === null && (
        <TableRoot label={t('commerceShipping.tableLabel')} stacked>
          <Table>
            <TableHead>
              <TableRow>
                <TableHeader>{t('commerceShipping.labelColumn')}</TableHeader>
                <TableHeader>{t('commerceShipping.zoneColumn')}</TableHeader>
                <TableHeader>{t('commerceShipping.kindColumn')}</TableHeader>
                <TableHeader>{t('commerceShipping.rateColumn')}</TableHeader>
                <TableHeader>{t('commerceShipping.statusColumn')}</TableHeader>
                <TableHeader>{t('commerceShipping.actionsColumn')}</TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {methods.map((method) => (
                <TableRow key={method.id}>
                  <TableCell stack="heading">{method.label}</TableCell>
                  <TableCell label={t('commerceShipping.zoneColumn')}>{zoneOf(method)}</TableCell>
                  <TableCell label={t('commerceShipping.kindColumn')}>
                    {t(`commerceShipping.kind.${method.kind}`)}
                  </TableCell>
                  <TableCell label={t('commerceShipping.rateColumn')}>
                    {rateOf(method)}
                    {method.carrier !== null && (
                      // The fallback to the stored rate is a documented guarantee:
                      // it stays visible wherever a carrier method appears.
                      <span className="block text-xs text-muted-foreground">
                        {t('commerceShipping.carrierWithFallback', { carrier: method.carrier })}
                      </span>
                    )}
                  </TableCell>
                  <TableCell label={t('commerceShipping.statusColumn')}>
                    <Badge tone={method.active ? 'success' : 'neutral'}>
                      {method.active
                        ? t('commerceShipping.active')
                        : t('commerceShipping.inactive')}
                    </Badge>
                  </TableCell>
                  <TableCell stack="actions">
                    {canWrite && (
                      <div className="flex flex-wrap gap-2">
                        <Button
                          variant="secondary"
                          size="sm"
                          aria-label={t('commerceShipping.editLabel', { label: method.label })}
                          onClick={() => openDialog(method)}
                        >
                          {t('commerceShipping.edit')}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive"
                          aria-label={t('commerceShipping.deleteLabel', { label: method.label })}
                          onClick={() => {
                            setDialogError(null)
                            setToDelete(method)
                          }}
                        >
                          {t('commerceShipping.delete')}
                        </Button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {methods.length === 0 && (
                <TableEmpty colSpan={6}>{t('commerceShipping.empty')}</TableEmpty>
              )}
            </TableBody>
          </Table>
        </TableRoot>
      )}

      <Card aria-labelledby="commerce-shipping-simulator-heading">
        <CardHeader>
          <CardTitle>
            <h2 id="commerce-shipping-simulator-heading">
              {t('commerceShipping.simulatorHeading')}
            </h2>
          </CardTitle>
        </CardHeader>
        <CardBody>
          <p className="mt-0 mb-4 text-sm text-muted-foreground">
            {t('commerceShipping.simulatorHint')}
          </p>
          <form
            noValidate
            onSubmit={(event) => void runSimulation(event)}
            className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5"
          >
            <Field label={t('commerceTax.simCountry')}>
              {(control) => (
                <Select
                  {...control}
                  value={simCountry}
                  onChange={(event) => setSimCountry(event.target.value)}
                >
                  <option value="">{t('commerceTax.simNoCountry')}</option>
                  {countries.map((option) => (
                    <option key={option.code} value={option.code}>
                      {option.name}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label={t('commerceTax.simRegion')}>
              {(control) => (
                <Input
                  {...control}
                  value={simRegion}
                  onChange={(event) => setSimRegion(event.target.value)}
                />
              )}
            </Field>
            <Field label={t('commerceProducts.currencyColumn')}>
              {(control) => (
                <Select
                  {...control}
                  value={effectiveSimCurrency}
                  onChange={(event) => setSimCurrency(event.target.value)}
                >
                  {currencyOptions(i18n.language, [effectiveSimCurrency]).map((option) => (
                    <option key={option.code} value={option.code}>
                      {option.name}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label={t('commerceShipping.simWeight')} error={simErrors['weight'] ?? null}>
              {(control) => (
                <Input
                  {...control}
                  inputMode="numeric"
                  value={simWeight}
                  onChange={(event) => setSimWeight(event.target.value)}
                />
              )}
            </Field>
            <Field label={t('commerceShipping.simSubtotal')} error={simErrors['subtotal'] ?? null}>
              {(control) => (
                <Input
                  {...control}
                  inputMode="decimal"
                  value={simSubtotal}
                  onChange={(event) => setSimSubtotal(event.target.value)}
                />
              )}
            </Field>
            <div className="col-span-full">
              <Button type="submit">{t('commerceShipping.simulateButton')}</Button>
            </div>
          </form>

          {simError !== null && (
            <Notice tone="danger" live="assertive" className="mt-4">
              <p>{simError}</p>
            </Notice>
          )}

          {quotes !== null && (
            <ul className="m-0 mt-4 flex list-none flex-col gap-1 p-0 text-sm">
              {quotes.map((quote) => (
                <li key={quote.methodId}>
                  {quote.label} — {formatMinor(quote.amountMinor, quote.currency, i18n.language)}
                  {quote.carrier !== null &&
                    ` (${t('commerceShipping.carrierWithFallback', { carrier: quote.carrier })})`}
                </li>
              ))}
              {quotes.length === 0 && <li>{t('commerceShipping.noQuotes')}</li>}
            </ul>
          )}
        </CardBody>
      </Card>

      <Modal
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) setEditing(null)
        }}
        title={
          editing?.method == null
            ? t('commerceShipping.newHeading')
            : t('commerceShipping.editHeading', { label: editing.method.label })
        }
        closeLabel={t('common.close')}
        className="w-[min(36rem,calc(100vw-2rem))]"
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditing(null)} disabled={busy}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" form="shipping-form" disabled={busy}>
              {editing?.method == null ? t('commerceShipping.createButton') : t('common.save')}
            </Button>
          </>
        }
      >
        <form
          id="shipping-form"
          noValidate
          onSubmit={(event) => void submit(event)}
          className="flex flex-col gap-4"
        >
          <Field label={t('commerceShipping.labelColumn')} error={errors['label'] ?? null}>
            {(control) => (
              <Input
                {...control}
                value={form.label}
                placeholder={t('commerceShipping.labelPlaceholder')}
                onChange={(event) => set('label', event.target.value)}
              />
            )}
          </Field>
          <Field
            label={t('commerceShipping.kindColumn')}
            description={t(`commerceShipping.kindHint.${form.kind}`)}
          >
            {(control) => (
              <Select
                {...control}
                value={form.kind}
                onChange={(event) => set('kind', event.target.value as ShippingKind)}
              >
                {SHIPPING_KINDS.map((option) => (
                  <option key={option} value={option}>
                    {t(`commerceShipping.kind.${option}`)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label={t('commerceTax.simCountry')}
              description={t('commerceShipping.countryHint')}
            >
              {(control) => (
                <Select
                  {...control}
                  value={form.country}
                  onChange={(event) => set('country', event.target.value)}
                >
                  <option value="">{t('commerceShipping.everywhere')}</option>
                  {countries.map((option) => (
                    <option key={option.code} value={option.code}>
                      {option.name}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label={t('commerceTax.simRegion')} description={t('commerceTax.regionHint')}>
              {(control) => (
                <Input
                  {...control}
                  value={form.region}
                  onChange={(event) => set('region', event.target.value)}
                />
              )}
            </Field>
          </div>
          {priced && (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
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
                <Field
                  label={t('commerceShipping.amountColumn')}
                  description={t('commerceShipping.amountHint')}
                  error={errors['amount'] ?? null}
                >
                  {(control) => (
                    <Input
                      {...control}
                      inputMode="decimal"
                      value={form.amount}
                      onChange={(event) => set('amount', event.target.value)}
                    />
                  )}
                </Field>
              </div>
              {form.kind === 'by_weight' && (
                <Field
                  label={t('commerceShipping.perKgColumn')}
                  description={t('commerceShipping.perKgHint')}
                  error={errors['perKg'] ?? null}
                >
                  {(control) => (
                    <Input
                      {...control}
                      inputMode="decimal"
                      value={form.perKg}
                      onChange={(event) => set('perKg', event.target.value)}
                    />
                  )}
                </Field>
              )}
              <Field
                label={t('commerceShipping.freeOverColumn')}
                description={t('commerceShipping.freeOverHint')}
                error={errors['freeOver'] ?? null}
              >
                {(control) => (
                  <Input
                    {...control}
                    inputMode="decimal"
                    value={form.freeOver}
                    onChange={(event) => set('freeOver', event.target.value)}
                  />
                )}
              </Field>
            </>
          )}
          <Field
            label={t('commerceShipping.carrierColumn')}
            description={t('commerceShipping.carrierHint')}
          >
            {(control) => (
              <Input
                {...control}
                value={form.carrier}
                onChange={(event) => set('carrier', event.target.value)}
              />
            )}
          </Field>
          {editing?.method != null && (
            <label className="flex items-center gap-2 font-sans text-sm font-medium text-foreground">
              <input
                type="checkbox"
                checked={form.active}
                onChange={(event) => set('active', event.target.checked)}
              />
              {t('commerceShipping.offered')}
            </label>
          )}
          <DialogError message={dialogError} />
        </form>
      </Modal>

      <ConfirmDialog
        open={toDelete !== null}
        title={t('commerceShipping.deleteTitle')}
        confirmLabel={t('commerceShipping.deleteConfirm')}
        busy={busy}
        error={dialogError}
        onCancel={() => setToDelete(null)}
        onConfirm={() => void confirmDelete()}
      >
        <p className="m-0">{t('commerceShipping.deleteBody', { label: toDelete?.label ?? '' })}</p>
      </ConfirmDialog>
    </section>
  )
}
