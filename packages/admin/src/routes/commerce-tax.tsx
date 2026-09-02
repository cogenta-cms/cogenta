import { type FormEvent, type JSX, useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  createTaxRule,
  deleteTaxRule,
  listTaxRules,
  simulateTax,
  type TaxOutcome,
  type TaxRule,
} from '../api/commerce-client.js'
import { ApiError } from '../api/http.js'
import { useAuth } from '../auth/auth-context.js'
import { minorToMajorText } from '../commerce/money.js'
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
 * Taxes — fiche 34 task 1. `@cogenta/commerce`'s `TaxStore` already resolved
 * rules by specificity, tested; this screen adds the two things it lacked:
 * a way to declare rules from the admin, and a simulator that calls the
 * **exact same resolver** the checkout uses (never a second implementation —
 * fiche 34 § pièges), so the screen can never show an answer an order would
 * not also get.
 */
export function CommerceTaxRoute(): JSX.Element {
  const { t } = useTranslation()
  const auth = useAuth()
  const token = auth.state.status === 'authenticated' ? auth.state.token : null
  const isAdmin = auth.state.status === 'authenticated' && auth.state.user.roles.includes('admin')

  const [rules, setRules] = useState<readonly TaxRule[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [country, setCountry] = useState('')
  const [region, setRegion] = useState('')
  const [taxCategory, setTaxCategory] = useState('standard')
  const [ratePercent, setRatePercent] = useState('')
  const [includedInPrice, setIncludedInPrice] = useState(true)
  const [priority, setPriority] = useState('0')

  const [simCountry, setSimCountry] = useState('')
  const [simRegion, setSimRegion] = useState('')
  const [simCategory, setSimCategory] = useState('standard')
  const [simAmount, setSimAmount] = useState('')
  const [simResult, setSimResult] = useState<{
    readonly rule: TaxRule | null
    readonly outcome: TaxOutcome
  } | null>(null)
  const [simError, setSimError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (token === null || !isAdmin) return
    setLoading(true)
    setError(null)
    try {
      const { rules: list } = await listTaxRules(token)
      setRules(list)
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : t('commerceTax.loadError'))
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
    const percent = Number.parseFloat(ratePercent)
    if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
      setActionError(t('commerceTax.rateInvalid'))
      return
    }
    try {
      await createTaxRule(token, {
        name,
        rateBp: Math.round(percent * 100),
        taxCategory,
        includedInPrice,
        priority: Number.parseInt(priority, 10) || 0,
        ...(country.trim() === '' ? {} : { country: country.trim().toUpperCase() }),
        ...(region.trim() === '' ? {} : { region: region.trim() }),
      })
      setCreating(false)
      setName('')
      setCountry('')
      setRegion('')
      setRatePercent('')
      setPriority('0')
      await load()
    } catch (caught) {
      setActionError(caught instanceof ApiError ? caught.message : t('commerceTax.createError'))
    }
  }

  async function remove(rule: TaxRule): Promise<void> {
    if (token === null) return
    setActionError(null)
    try {
      await deleteTaxRule(token, rule.id)
      await load()
    } catch (caught) {
      setActionError(caught instanceof ApiError ? caught.message : t('commerceTax.deleteError'))
    }
  }

  async function runSimulation(event: FormEvent): Promise<void> {
    event.preventDefault()
    if (token === null) return
    setSimError(null)
    setSimResult(null)
    const amountMajor = Number.parseFloat(simAmount)
    if (!Number.isFinite(amountMajor) || amountMajor < 0) {
      setSimError(t('commerceTax.amountInvalid'))
      return
    }
    try {
      const result = await simulateTax(token, {
        amountMinor: Math.round(amountMajor * 100),
        taxCategory: simCategory,
        ...(simCountry.trim() === '' ? {} : { country: simCountry.trim().toUpperCase() }),
        ...(simRegion.trim() === '' ? {} : { region: simRegion.trim() }),
      })
      setSimResult(result)
    } catch (caught) {
      setSimError(caught instanceof ApiError ? caught.message : t('commerceTax.simulateError'))
    }
  }

  function describeRule(rule: TaxRule): string {
    const zone =
      rule.country === null
        ? t('commerceTax.everywhere')
        : rule.region === null
          ? rule.country
          : `${rule.country} / ${rule.region}`
    return `${zone} — ${rule.taxCategory}`
  }

  if (!isAdmin) {
    return (
      <section aria-labelledby="commerce-tax-heading">
        <h1 id="commerce-tax-heading">{t('commerceTax.heading')}</h1>
        <p role="alert">{t('commerceTax.adminOnly')}</p>
      </section>
    )
  }

  return (
    <section aria-labelledby="commerce-tax-heading" className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1
            id="commerce-tax-heading"
            className="m-0 text-2xl leading-tight font-bold tracking-tight"
          >
            {t('commerceTax.heading')}
          </h1>
          <p className="text-muted-foreground text-sm">{t('commerceTax.description')}</p>
        </div>
        <Button onClick={() => setCreating(true)}>{t('commerceTax.newButton')}</Button>
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
        <TableRoot label={t('commerceTax.tableLabel')}>
          <Table>
            <TableHead>
              <TableRow>
                <TableHeader>{t('commerceTax.nameColumn')}</TableHeader>
                <TableHeader>{t('commerceTax.zoneColumn')}</TableHeader>
                <TableHeader>{t('commerceTax.rateColumn')}</TableHeader>
                <TableHeader>{t('commerceTax.priorityColumn')}</TableHeader>
                <TableHeader>{t('commerceTax.actionsColumn')}</TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {rules.map((rule) => (
                <TableRow key={rule.id}>
                  <TableCell>{rule.name}</TableCell>
                  <TableCell>{describeRule(rule)}</TableCell>
                  <TableCell>
                    {(rule.rateBp / 100).toString()}%{' '}
                    {rule.includedInPrice ? t('commerceTax.ttc') : t('commerceTax.ht')}
                  </TableCell>
                  <TableCell>{rule.priority}</TableCell>
                  <TableCell>
                    <Button variant="destructive" size="sm" onClick={() => void remove(rule)}>
                      {t('commerceTax.delete')}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {rules.length === 0 && <TableEmpty colSpan={5}>{t('commerceTax.empty')}</TableEmpty>}
            </TableBody>
          </Table>
        </TableRoot>
      )}

      <Card aria-labelledby="commerce-tax-simulator-heading">
        <CardHeader>
          <CardTitle>
            <h2 id="commerce-tax-simulator-heading">{t('commerceTax.simulatorHeading')}</h2>
          </CardTitle>
        </CardHeader>
        <CardBody>
          <p className="mt-0 mb-4 text-sm text-muted-foreground">
            {t('commerceTax.simulatorHint')}
          </p>
          <form onSubmit={runSimulation} className="grid grid-cols-2 gap-4 sm:grid-cols-4">
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
            <Field label={t('commerceTax.simCategory')}>
              {(control) => (
                <Input
                  {...control}
                  value={simCategory}
                  onChange={(event) => setSimCategory(event.target.value)}
                />
              )}
            </Field>
            <Field label={t('commerceTax.simAmount')}>
              {(control) => (
                <Input
                  {...control}
                  type="text"
                  inputMode="decimal"
                  required
                  value={simAmount}
                  onChange={(event) => setSimAmount(event.target.value)}
                />
              )}
            </Field>
            <div className="col-span-full">
              <Button type="submit">{t('commerceTax.simulateButton')}</Button>
            </div>
          </form>

          {simError !== null && (
            <Notice tone="danger" live="assertive" className="mt-4">
              <p>{simError}</p>
            </Notice>
          )}

          {simResult !== null && (
            <dl className="m-0 mt-4 grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-sm">
              <dt className="font-medium">{t('commerceTax.appliedRule')}</dt>
              <dd className="m-0">
                {simResult.rule === null
                  ? t('commerceTax.noRuleApplied')
                  : `${simResult.rule.name} (${describeRule(simResult.rule)}) — ${t('commerceTax.wonBecause')}`}
              </dd>
              <dt className="font-medium">{t('commerceTax.rateApplied')}</dt>
              <dd className="m-0">{(simResult.outcome.rateBp / 100).toString()}%</dd>
              <dt className="font-medium">{t('commerceTax.taxAmount')}</dt>
              <dd className="m-0">{minorToMajorText(simResult.outcome.taxMinor, 'EUR')}</dd>
            </dl>
          )}
        </CardBody>
      </Card>

      <Modal
        open={creating}
        onOpenChange={setCreating}
        title={t('commerceTax.newHeading')}
        closeLabel={t('commerceTax.close')}
      >
        <form onSubmit={submitCreate} className="flex flex-col gap-4">
          <Field label={t('commerceTax.nameColumn')}>
            {(control) => (
              <Input
                {...control}
                required
                value={name}
                onChange={(event) => setName(event.target.value)}
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
          <div className="grid grid-cols-2 gap-4">
            <Field label={t('commerceTax.simCategory')}>
              {(control) => (
                <Input
                  {...control}
                  required
                  value={taxCategory}
                  onChange={(event) => setTaxCategory(event.target.value)}
                />
              )}
            </Field>
            <Field label={t('commerceTax.ratePercent')}>
              {(control) => (
                <Input
                  {...control}
                  type="text"
                  inputMode="decimal"
                  required
                  value={ratePercent}
                  onChange={(event) => setRatePercent(event.target.value)}
                />
              )}
            </Field>
          </div>
          <Field
            label={t('commerceTax.priorityColumn')}
            description={t('commerceTax.priorityHint')}
          >
            {(control) => (
              <Input
                {...control}
                type="number"
                value={priority}
                onChange={(event) => setPriority(event.target.value)}
              />
            )}
          </Field>
          <label className="flex items-center gap-2 font-sans text-sm font-medium text-foreground">
            <input
              type="checkbox"
              checked={includedInPrice}
              onChange={(event) => setIncludedInPrice(event.target.checked)}
            />
            {t('commerceTax.includedInPrice')}
          </label>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setCreating(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit">{t('commerceTax.createButton')}</Button>
          </div>
        </form>
      </Modal>
    </section>
  )
}
