import { type FormEvent, type JSX, useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  createShippingMethod,
  deleteShippingMethod,
  listShippingMethods,
  type ShippingKind,
  type ShippingMethod,
  type ShippingQuote,
  simulateShipping,
} from '../api/commerce-client.js'
import { ApiError } from '../api/http.js'
import { useAuth } from '../auth/auth-context.js'
import { majorTextToMinor, minorToMajorText } from '../commerce/money.js'
import {
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

/**
 * Shipping — fiche 34 task 2. Zones and methods on `@cogenta/commerce`'s
 * already-tested `ShippingStore`; the simulator calls `available()`, the
 * exact function checkout uses, so a carrier method's fallback to the
 * stored rate is shown as what it is — a real, live behaviour, not a
 * decoration (fiche 34 § pièges: "le repli du transporteur est une
 * fonctionnalité, pas un bug").
 */
export function CommerceShippingRoute(): JSX.Element {
  const { t } = useTranslation()
  const auth = useAuth()
  const token = auth.state.status === 'authenticated' ? auth.state.token : null
  const isAdmin = auth.state.status === 'authenticated' && auth.state.user.roles.includes('admin')

  const [methods, setMethods] = useState<readonly ShippingMethod[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const [creating, setCreating] = useState(false)
  const [label, setLabel] = useState('')
  const [country, setCountry] = useState('')
  const [region, setRegion] = useState('')
  const [kind, setKind] = useState<ShippingKind>('flat')
  const [currency, setCurrency] = useState('EUR')
  const [amount, setAmount] = useState('')
  const [perKg, setPerKg] = useState('')
  const [freeOver, setFreeOver] = useState('')
  const [carrier, setCarrier] = useState('')

  const [simCountry, setSimCountry] = useState('')
  const [simRegion, setSimRegion] = useState('')
  const [simCurrency, setSimCurrency] = useState('EUR')
  const [simWeight, setSimWeight] = useState('0')
  const [simSubtotal, setSimSubtotal] = useState('')
  const [quotes, setQuotes] = useState<readonly ShippingQuote[] | null>(null)
  const [simError, setSimError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (token === null || !isAdmin) return
    setLoading(true)
    setError(null)
    try {
      const { methods: list } = await listShippingMethods(token)
      setMethods(list)
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : t('commerceShipping.loadError'))
    } finally {
      setLoading(false)
    }
  }, [token, isAdmin, t])

  useEffect(() => {
    void load()
  }, [load])

  async function submitCreate(event: FormEvent): Promise<void> {
    event.preventDefault()
    if (token === null) return
    setActionError(null)
    // Pickup costs the shop nothing to fulfil, the same as `free` — see
    // `storedRate` in `@cogenta/commerce`'s `shipping/store.ts`.
    const amountMinor =
      kind === 'free' || kind === 'pickup' ? 0 : majorTextToMinor(amount, currency)
    if (amountMinor === null) {
      setActionError(t('commerceShipping.amountInvalid'))
      return
    }
    const perKgMinor = perKg.trim() === '' ? undefined : majorTextToMinor(perKg, currency)
    const freeOverMinor = freeOver.trim() === '' ? undefined : majorTextToMinor(freeOver, currency)
    try {
      await createShippingMethod(token, {
        label,
        currency,
        kind,
        amountMinor,
        ...(perKgMinor === null || perKgMinor === undefined ? {} : { perKgMinor }),
        ...(freeOverMinor === null || freeOverMinor === undefined ? {} : { freeOverMinor }),
        ...(country.trim() === '' ? {} : { country: country.trim().toUpperCase() }),
        ...(region.trim() === '' ? {} : { region: region.trim() }),
        ...(carrier.trim() === '' ? {} : { carrier: carrier.trim() }),
      })
      setCreating(false)
      setLabel('')
      setCountry('')
      setRegion('')
      setAmount('')
      setPerKg('')
      setFreeOver('')
      setCarrier('')
      await load()
    } catch (caught) {
      setActionError(
        caught instanceof ApiError ? caught.message : t('commerceShipping.createError'),
      )
    }
  }

  async function remove(method: ShippingMethod): Promise<void> {
    if (token === null) return
    setActionError(null)
    try {
      await deleteShippingMethod(token, method.id)
      await load()
    } catch (caught) {
      setActionError(
        caught instanceof ApiError ? caught.message : t('commerceShipping.deleteError'),
      )
    }
  }

  async function runSimulation(event: FormEvent): Promise<void> {
    event.preventDefault()
    if (token === null) return
    setSimError(null)
    setQuotes(null)
    const subtotalMinor = simSubtotal.trim() === '' ? 0 : majorTextToMinor(simSubtotal, simCurrency)
    if (subtotalMinor === null) {
      setSimError(t('commerceShipping.amountInvalid'))
      return
    }
    try {
      const { quotes: result } = await simulateShipping(token, {
        currency: simCurrency,
        weightGrams: Number.parseInt(simWeight, 10) || 0,
        subtotalMinor,
        ...(simCountry.trim() === '' ? {} : { country: simCountry.trim().toUpperCase() }),
        ...(simRegion.trim() === '' ? {} : { region: simRegion.trim() }),
      })
      setQuotes(result)
    } catch (caught) {
      setSimError(caught instanceof ApiError ? caught.message : t('commerceShipping.simulateError'))
    }
  }

  function describeZone(method: ShippingMethod): string {
    if (method.country === null) return t('commerceShipping.everywhere')
    return method.region === null ? method.country : `${method.country} / ${method.region}`
  }

  if (!isAdmin) {
    return (
      <section aria-labelledby="commerce-shipping-heading">
        <h1 id="commerce-shipping-heading">{t('commerceShipping.heading')}</h1>
        <p role="alert">{t('commerceShipping.adminOnly')}</p>
      </section>
    )
  }

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
        <Button onClick={() => setCreating(true)}>{t('commerceShipping.newButton')}</Button>
      </div>

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
        <TableRoot label={t('commerceShipping.tableLabel')}>
          <Table>
            <TableHead>
              <TableRow>
                <TableHeader>{t('commerceShipping.labelColumn')}</TableHeader>
                <TableHeader>{t('commerceShipping.zoneColumn')}</TableHeader>
                <TableHeader>{t('commerceShipping.kindColumn')}</TableHeader>
                <TableHeader>{t('commerceShipping.rateColumn')}</TableHeader>
                <TableHeader>{t('commerceShipping.carrierColumn')}</TableHeader>
                <TableHeader>{t('commerceShipping.actionsColumn')}</TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {methods.map((method) => (
                <TableRow key={method.id}>
                  <TableCell>{method.label}</TableCell>
                  <TableCell>{describeZone(method)}</TableCell>
                  <TableCell>{t(`commerceShipping.kind.${method.kind}`)}</TableCell>
                  <TableCell>
                    {method.kind === 'free' || method.kind === 'pickup'
                      ? t('commerceShipping.free')
                      : minorToMajorText(method.amountMinor, method.currency)}
                    {method.freeOverMinor !== null &&
                      ` (${t('commerceShipping.freeOver', {
                        amount: minorToMajorText(method.freeOverMinor, method.currency),
                      })})`}
                  </TableCell>
                  <TableCell>
                    {method.carrier === null
                      ? t('commerceShipping.storedRate')
                      : t('commerceShipping.carrierWithFallback', { carrier: method.carrier })}
                  </TableCell>
                  <TableCell>
                    <Button variant="destructive" size="sm" onClick={() => void remove(method)}>
                      {t('commerceShipping.delete')}
                    </Button>
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
          <form onSubmit={runSimulation} className="grid grid-cols-2 gap-4 sm:grid-cols-5">
            <Field label={t('commerceTax.simCountry')}>
              {(control) => (
                <Input
                  {...control}
                  maxLength={2}
                  placeholder="FR"
                  value={simCountry}
                  onChange={(event) => setSimCountry(event.target.value)}
                />
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
                <Input
                  {...control}
                  maxLength={3}
                  value={simCurrency}
                  onChange={(event) => setSimCurrency(event.target.value.toUpperCase())}
                />
              )}
            </Field>
            <Field label={t('commerceShipping.simWeight')}>
              {(control) => (
                <Input
                  {...control}
                  type="number"
                  min={0}
                  value={simWeight}
                  onChange={(event) => setSimWeight(event.target.value)}
                />
              )}
            </Field>
            <Field label={t('commerceShipping.simSubtotal')}>
              {(control) => (
                <Input
                  {...control}
                  type="text"
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
                  {quote.label} — {minorToMajorText(quote.amountMinor, quote.currency)}
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
        open={creating}
        onOpenChange={setCreating}
        title={t('commerceShipping.newHeading')}
        closeLabel={t('commerceShipping.close')}
      >
        <form onSubmit={submitCreate} className="flex flex-col gap-4">
          <Field label={t('commerceShipping.labelColumn')}>
            {(control) => (
              <Input
                {...control}
                required
                value={label}
                onChange={(event) => setLabel(event.target.value)}
              />
            )}
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label={t('commerceTax.simCountry')} description={t('commerceTax.countryHint')}>
              {(control) => (
                <Input
                  {...control}
                  maxLength={2}
                  placeholder="FR"
                  value={country}
                  onChange={(event) => setCountry(event.target.value)}
                />
              )}
            </Field>
            <Field label={t('commerceTax.simRegion')}>
              {(control) => (
                <Input
                  {...control}
                  value={region}
                  onChange={(event) => setRegion(event.target.value)}
                />
              )}
            </Field>
          </div>
          <Field label={t('commerceShipping.kindColumn')}>
            {(control) => (
              <Select
                {...control}
                value={kind}
                onChange={(event) => setKind(event.target.value as ShippingKind)}
              >
                {SHIPPING_KINDS.map((option) => (
                  <option key={option} value={option}>
                    {t(`commerceShipping.kind.${option}`)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <div className="grid grid-cols-2 gap-4">
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
            {kind !== 'free' && kind !== 'pickup' && (
              <Field label={t('commerceShipping.amountColumn')}>
                {(control) => (
                  <Input
                    {...control}
                    type="text"
                    inputMode="decimal"
                    required
                    value={amount}
                    onChange={(event) => setAmount(event.target.value)}
                  />
                )}
              </Field>
            )}
          </div>
          {kind === 'by_weight' && (
            <Field label={t('commerceShipping.perKgColumn')}>
              {(control) => (
                <Input
                  {...control}
                  type="text"
                  inputMode="decimal"
                  value={perKg}
                  onChange={(event) => setPerKg(event.target.value)}
                />
              )}
            </Field>
          )}
          <Field
            label={t('commerceShipping.freeOverColumn')}
            description={t('commerceShipping.freeOverHint')}
          >
            {(control) => (
              <Input
                {...control}
                type="text"
                inputMode="decimal"
                value={freeOver}
                onChange={(event) => setFreeOver(event.target.value)}
              />
            )}
          </Field>
          <Field
            label={t('commerceShipping.carrierColumn')}
            description={t('commerceShipping.carrierHint')}
          >
            {(control) => (
              <Input
                {...control}
                value={carrier}
                onChange={(event) => setCarrier(event.target.value)}
              />
            )}
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setCreating(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit">{t('commerceShipping.createButton')}</Button>
          </div>
        </form>
      </Modal>
    </section>
  )
}
