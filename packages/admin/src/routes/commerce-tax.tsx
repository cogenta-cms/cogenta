import { type FormEvent, type JSX, useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  createTaxRule,
  deleteTaxRule,
  listTaxCategories,
  listTaxRules,
  simulateTax,
  type TaxOutcome,
  type TaxRule,
  updateTaxRule,
} from '../api/commerce-client.js'
import { useAuth } from '../auth/auth-context.js'
import { commerceErrorMessage } from '../commerce/commerce-errors.js'
import { ConfirmDialog } from '../commerce/confirm-dialog.js'
import { countryName, countryOptions } from '../commerce/countries.js'
import { DialogError } from '../commerce/dialog-error.js'
import {
  basisPointsToPercentText,
  formatBasisPoints,
  formatMinor,
  majorTextToMinor,
  percentTextToBasisPoints,
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

const NEW_CATEGORY = '__new__'

interface RuleForm {
  readonly name: string
  readonly country: string
  readonly region: string
  readonly category: string
  readonly newCategory: string
  readonly rate: string
  readonly includedInPrice: boolean
  readonly priority: string
}

const EMPTY_RULE: RuleForm = {
  name: '',
  country: '',
  region: '',
  category: 'standard',
  newCategory: '',
  rate: '',
  includedInPrice: true,
  priority: '0',
}

/**
 * Taxes — fiche 34 task 1. `@cogenta/commerce`'s `TaxStore` resolves rules by
 * specificity; this screen declares them and simulates the **exact same
 * resolver** the checkout uses (never a second implementation), so it can
 * never show an answer an order would not also get.
 *
 * A country is always *picked* from a list (the explicit choice "tous les pays"
 * included), a category is picked from the ones in use, and a rate keeps its
 * decimals (`20,5` is 20.5 %, never 20 %).
 */
export function CommerceTaxRoute(): JSX.Element {
  const { t, i18n } = useTranslation()
  const auth = useAuth()
  const token = auth.state.status === 'authenticated' ? auth.state.token : null
  const roles = auth.state.status === 'authenticated' ? auth.state.user.roles : []
  // Any signed-in commerce role can view this screen; the server enforces
  // `commerce.catalog.write` on the mutations themselves.
  const canRead = roles.length > 0
  const canWrite =
    roles.includes('admin') || roles.includes('shopkeeper') || roles.includes('editor')
  const currency = useShopCurrency(token)

  const [rules, setRules] = useState<readonly TaxRule[]>([])
  const [categories, setCategories] = useState<readonly string[]>(['standard'])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const [editing, setEditing] = useState<{ readonly rule: TaxRule | null } | null>(null)
  const [form, setForm] = useState<RuleForm>(EMPTY_RULE)
  const [errors, setErrors] = useState<Readonly<Record<string, string>>>({})
  const [dialogError, setDialogError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [toDelete, setToDelete] = useState<TaxRule | null>(null)

  const [simCountry, setSimCountry] = useState('')
  const [simRegion, setSimRegion] = useState('')
  const [simCategory, setSimCategory] = useState('standard')
  const [simAmount, setSimAmount] = useState('')
  const [simResult, setSimResult] = useState<{
    readonly rule: TaxRule | null
    readonly outcome: TaxOutcome
  } | null>(null)
  const [simErrors, setSimErrors] = useState<Readonly<Record<string, string>>>({})
  const [simError, setSimError] = useState<string | null>(null)

  const countries = useMemo(() => countryOptions(i18n.language), [i18n.language])

  const load = useCallback(async () => {
    if (token === null || !canRead) return
    setError(null)
    try {
      const { rules: list } = await listTaxRules(token)
      setRules(list)
      await listTaxCategories(token)
        .then((response) => setCategories(response.categories))
        .catch(() => undefined)
    } catch (caught) {
      setError(commerceErrorMessage(t, caught, 'commerceTax.loadError'))
    } finally {
      setLoading(false)
    }
  }, [token, canRead, t])

  useEffect(() => {
    void load()
  }, [load])

  function set<K extends keyof RuleForm>(key: K, value: RuleForm[K]): void {
    setForm((current) => ({ ...current, [key]: value }))
  }

  function openDialog(rule: TaxRule | null): void {
    setEditing({ rule })
    setErrors({})
    setDialogError(null)
    setForm(
      rule === null
        ? EMPTY_RULE
        : {
            name: rule.name,
            country: rule.country ?? '',
            region: rule.region ?? '',
            category: rule.taxCategory,
            newCategory: '',
            rate: basisPointsToPercentText(rule.rateBp),
            includedInPrice: rule.includedInPrice,
            priority: String(rule.priority),
          },
    )
  }

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault()
    if (token === null || editing === null) return
    const found: Record<string, string> = {}
    if (form.name.trim() === '') found['name'] = t('commerceTax.nameRequired')
    const rateBp = percentTextToBasisPoints(form.rate)
    if (rateBp === null) found['rate'] = t('commerceTax.rateInvalid')
    const category = form.category === NEW_CATEGORY ? form.newCategory.trim() : form.category
    if (category === '') found['category'] = t('commerceTax.categoryRequired')
    const priority = Number(form.priority.trim() === '' ? '0' : form.priority.trim())
    if (!Number.isInteger(priority)) found['priority'] = t('commerceTax.priorityInvalid')
    setErrors(found)
    if (Object.keys(found).length > 0 || rateBp === null) {
      setDialogError(t('commerceTax.fixErrors'))
      return
    }
    setBusy(true)
    setDialogError(null)
    try {
      if (editing.rule === null) {
        await createTaxRule(token, {
          name: form.name.trim(),
          rateBp,
          taxCategory: category,
          includedInPrice: form.includedInPrice,
          priority,
          ...(form.country === '' ? {} : { country: form.country }),
          ...(form.region.trim() === '' ? {} : { region: form.region.trim() }),
        })
        setSuccess(t('commerceTax.createdDone', { name: form.name.trim() }))
      } else {
        await updateTaxRule(token, editing.rule.id, {
          name: form.name.trim(),
          rateBp,
          taxCategory: category,
          includedInPrice: form.includedInPrice,
          priority,
          country: form.country === '' ? null : form.country,
          region: form.region.trim() === '' ? null : form.region.trim(),
        })
        setSuccess(t('commerceTax.updatedDone', { name: form.name.trim() }))
      }
      setEditing(null)
      await load()
    } catch (caught) {
      setDialogError(commerceErrorMessage(t, caught, 'commerceTax.saveError'))
    } finally {
      setBusy(false)
    }
  }

  async function confirmDelete(): Promise<void> {
    if (token === null || toDelete === null) return
    setBusy(true)
    setDialogError(null)
    try {
      await deleteTaxRule(token, toDelete.id)
      setSuccess(t('commerceTax.deletedDone', { name: toDelete.name }))
      setToDelete(null)
      await load()
    } catch (caught) {
      setDialogError(commerceErrorMessage(t, caught, 'commerceTax.deleteError'))
    } finally {
      setBusy(false)
    }
  }

  async function runSimulation(event: FormEvent): Promise<void> {
    event.preventDefault()
    if (token === null) return
    setSimError(null)
    setSimResult(null)
    const amountMinor = majorTextToMinor(simAmount, currency)
    if (amountMinor === null) {
      setSimErrors({ amount: t('commerceTax.amountInvalid') })
      return
    }
    setSimErrors({})
    try {
      const result = await simulateTax(token, {
        amountMinor,
        taxCategory: simCategory,
        ...(simCountry === '' ? {} : { country: simCountry }),
        ...(simRegion.trim() === '' ? {} : { region: simRegion.trim() }),
      })
      setSimResult(result)
    } catch (caught) {
      setSimError(commerceErrorMessage(t, caught, 'commerceTax.simulateError'))
    }
  }

  function zoneOf(rule: TaxRule): string {
    const place =
      rule.country === null ? t('commerceTax.everywhere') : countryName(rule.country, i18n.language)
    return rule.region === null ? place : `${place} / ${rule.region}`
  }

  if (!canRead) {
    return (
      <section aria-labelledby="commerce-tax-heading">
        <h1 id="commerce-tax-heading">{t('commerceTax.heading')}</h1>
        <p role="alert">{t('commerceTax.signedInOnly')}</p>
      </section>
    )
  }

  const categoryChoices =
    categories.includes(form.category) || form.category === NEW_CATEGORY
      ? categories
      : [...categories, form.category]

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
        {canWrite && <Button onClick={() => openDialog(null)}>{t('commerceTax.newButton')}</Button>}
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
        <TableRoot label={t('commerceTax.tableLabel')} stacked>
          <Table>
            <TableHead>
              <TableRow>
                <TableHeader>{t('commerceTax.nameColumn')}</TableHeader>
                <TableHeader>{t('commerceTax.zoneColumn')}</TableHeader>
                <TableHeader>{t('commerceTax.categoryColumn')}</TableHeader>
                <TableHeader>{t('commerceTax.rateColumn')}</TableHeader>
                <TableHeader>{t('commerceTax.priorityColumn')}</TableHeader>
                <TableHeader>{t('commerceTax.actionsColumn')}</TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {rules.map((rule) => (
                <TableRow key={rule.id}>
                  <TableCell stack="heading">{rule.name}</TableCell>
                  <TableCell label={t('commerceTax.zoneColumn')}>{zoneOf(rule)}</TableCell>
                  <TableCell label={t('commerceTax.categoryColumn')}>
                    <Badge tone="neutral">{rule.taxCategory}</Badge>
                  </TableCell>
                  <TableCell label={t('commerceTax.rateColumn')}>
                    {formatBasisPoints(rule.rateBp, i18n.language)}{' '}
                    <span className="text-xs text-muted-foreground">
                      {rule.includedInPrice ? t('commerceTax.ttc') : t('commerceTax.ht')}
                    </span>
                  </TableCell>
                  <TableCell label={t('commerceTax.priorityColumn')}>{rule.priority}</TableCell>
                  <TableCell stack="actions">
                    {canWrite && (
                      <div className="flex flex-wrap gap-2">
                        <Button
                          variant="secondary"
                          size="sm"
                          aria-label={t('commerceTax.editLabel', { name: rule.name })}
                          onClick={() => openDialog(rule)}
                        >
                          {t('commerceTax.edit')}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive"
                          aria-label={t('commerceTax.deleteLabel', { name: rule.name })}
                          onClick={() => {
                            setDialogError(null)
                            setToDelete(rule)
                          }}
                        >
                          {t('commerceTax.delete')}
                        </Button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {rules.length === 0 && <TableEmpty colSpan={6}>{t('commerceTax.empty')}</TableEmpty>}
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
          <form
            noValidate
            onSubmit={(event) => void runSimulation(event)}
            className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
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
            <Field label={t('commerceTax.simCategory')}>
              {(control) => (
                <Select
                  {...control}
                  value={simCategory}
                  onChange={(event) => setSimCategory(event.target.value)}
                >
                  {categories.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label={t('commerceTax.simAmount')} error={simErrors['amount'] ?? null}>
              {(control) => (
                <Input
                  {...control}
                  inputMode="decimal"
                  value={simAmount}
                  placeholder={t('commerceTax.simAmountPlaceholder')}
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
                  : `${simResult.rule.name} (${zoneOf(simResult.rule)} — ${simResult.rule.taxCategory})`}
              </dd>
              <dt className="font-medium">{t('commerceTax.rateApplied')}</dt>
              <dd className="m-0">{formatBasisPoints(simResult.outcome.rateBp, i18n.language)}</dd>
              <dt className="font-medium">{t('commerceTax.taxAmount')}</dt>
              <dd className="m-0">
                {formatMinor(simResult.outcome.taxMinor, currency, i18n.language)}
              </dd>
            </dl>
          )}
        </CardBody>
      </Card>

      <Modal
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) setEditing(null)
        }}
        title={
          editing?.rule == null
            ? t('commerceTax.newHeading')
            : t('commerceTax.editHeading', { name: editing.rule.name })
        }
        closeLabel={t('common.close')}
        className="w-[min(36rem,calc(100vw-2rem))]"
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditing(null)} disabled={busy}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" form="tax-rule-form" disabled={busy}>
              {editing?.rule == null ? t('commerceTax.createButton') : t('common.save')}
            </Button>
          </>
        }
      >
        <form
          id="tax-rule-form"
          noValidate
          onSubmit={(event) => void submit(event)}
          className="flex flex-col gap-4"
        >
          <Field label={t('commerceTax.nameColumn')} error={errors['name'] ?? null}>
            {(control) => (
              <Input
                {...control}
                value={form.name}
                placeholder={t('commerceTax.namePlaceholder')}
                onChange={(event) => set('name', event.target.value)}
              />
            )}
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('commerceTax.simCountry')} description={t('commerceTax.countryHint')}>
              {(control) => (
                <Select
                  {...control}
                  value={form.country}
                  onChange={(event) => set('country', event.target.value)}
                >
                  <option value="">{t('commerceTax.everywhere')}</option>
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
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label={t('commerceTax.categoryColumn')}
              description={t('commerceTax.categoryHint')}
              error={errors['category'] ?? null}
            >
              {(control) => (
                <Select
                  {...control}
                  value={form.category}
                  onChange={(event) => set('category', event.target.value)}
                >
                  {categoryChoices.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                  <option value={NEW_CATEGORY}>{t('commerceTax.newCategory')}</option>
                </Select>
              )}
            </Field>
            <Field
              label={t('commerceTax.ratePercent')}
              description={t('commerceTax.rateHint')}
              error={errors['rate'] ?? null}
            >
              {(control) => (
                <Input
                  {...control}
                  inputMode="decimal"
                  value={form.rate}
                  onChange={(event) => set('rate', event.target.value)}
                />
              )}
            </Field>
          </div>
          {form.category === NEW_CATEGORY && (
            <Field
              label={t('commerceTax.newCategoryName')}
              description={t('commerceTax.newCategoryHint')}
            >
              {(control) => (
                <Input
                  {...control}
                  value={form.newCategory}
                  onChange={(event) => set('newCategory', event.target.value)}
                />
              )}
            </Field>
          )}
          <Field
            label={t('commerceTax.priorityColumn')}
            description={t('commerceTax.priorityHint')}
            error={errors['priority'] ?? null}
          >
            {(control) => (
              <Input
                {...control}
                inputMode="numeric"
                value={form.priority}
                onChange={(event) => set('priority', event.target.value)}
              />
            )}
          </Field>
          <label className="flex items-center gap-2 font-sans text-sm font-medium text-foreground">
            <input
              type="checkbox"
              checked={form.includedInPrice}
              onChange={(event) => set('includedInPrice', event.target.checked)}
            />
            {t('commerceTax.includedInPrice')}
          </label>
          <DialogError message={dialogError} />
        </form>
      </Modal>

      <ConfirmDialog
        open={toDelete !== null}
        title={t('commerceTax.deleteTitle')}
        confirmLabel={t('commerceTax.deleteConfirm')}
        busy={busy}
        error={dialogError}
        onCancel={() => setToDelete(null)}
        onConfirm={() => void confirmDelete()}
      >
        <p className="m-0">{t('commerceTax.deleteBody', { name: toDelete?.name ?? '' })}</p>
      </ConfirmDialog>
    </section>
  )
}
