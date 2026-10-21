import { type FormEvent, type JSX, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  createVariant,
  deleteVariant,
  listStockMovements,
  listTaxCategories,
  type Product,
  type RecurrenceUnit,
  type StockMovement,
  setStock,
  updateVariant,
  type Variant,
} from '../api/commerce-client.js'
import { MediaThumbnail } from '../media/media-thumbnail.js'
import {
  Badge,
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
import { commerceErrorMessage } from './commerce-errors.js'
import { ConfirmDialog } from './confirm-dialog.js'
import { DialogError } from './dialog-error.js'
import { currencyOptions, formatMinor, majorTextToMinor, minorToMajorText } from './money.js'
import { useShopCurrency } from './use-shop-currency.js'
import { VariantImageField } from './variant-image-field.js'

const NEW_CATEGORY = '__new__'
const UNITS: readonly RecurrenceUnit[] = ['day', 'week', 'month', 'year']

interface VariantForm {
  readonly sku: string
  readonly title: string
  readonly price: string
  readonly currency: string
  readonly stock: string
  readonly allowBackorder: boolean
  readonly weightGrams: string
  readonly taxCategory: string
  readonly newTaxCategory: string
  readonly recurring: boolean
  readonly recurringCount: string
  readonly recurringUnit: RecurrenceUnit
  readonly lowStockThreshold: string
  readonly comparePrice: string
  readonly saleStartsAt: string
  readonly saleEndsAt: string
  readonly widthMm: string
  readonly heightMm: string
  readonly depthMm: string
}

function emptyForm(currency: string): VariantForm {
  return {
    sku: '',
    title: '',
    price: '',
    currency,
    stock: '0',
    allowBackorder: false,
    weightGrams: '',
    taxCategory: 'standard',
    newTaxCategory: '',
    recurring: false,
    recurringCount: '1',
    recurringUnit: 'month',
    lowStockThreshold: '',
    comparePrice: '',
    saleStartsAt: '',
    saleEndsAt: '',
    widthMm: '',
    heightMm: '',
    depthMm: '',
  }
}

/** `2026-12-31T22:59:59.000Z` → the local calendar day a date field shows. */
function toDateInput(iso: string | null): string {
  if (iso === null) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const pad = (value: number): string => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function formFrom(variant: Variant): VariantForm {
  return {
    sku: variant.sku,
    title: variant.title,
    price: minorToMajorText(variant.priceMinor, variant.currency),
    currency: variant.currency,
    stock: String(variant.onHand),
    allowBackorder: variant.allowBackorder,
    weightGrams: variant.weightGrams === 0 ? '' : String(variant.weightGrams),
    taxCategory: variant.taxCategory,
    newTaxCategory: '',
    recurring: variant.recurring !== null,
    recurringCount: String(variant.recurring?.count ?? 1),
    recurringUnit: variant.recurring?.unit ?? 'month',
    lowStockThreshold: variant.lowStockThreshold === null ? '' : String(variant.lowStockThreshold),
    comparePrice:
      variant.compareAtPriceMinor === null
        ? ''
        : minorToMajorText(variant.compareAtPriceMinor, variant.currency),
    saleStartsAt: toDateInput(variant.saleStartsAt),
    saleEndsAt: toDateInput(variant.saleEndsAt),
    widthMm: variant.widthMm === null ? '' : String(variant.widthMm),
    heightMm: variant.heightMm === null ? '' : String(variant.heightMm),
    depthMm: variant.depthMm === null ? '' : String(variant.depthMm),
  }
}

/** `''` → `null` (not set), a whole number ≥ 0 → that number, anything else → `undefined` (refused). */
function nullableCount(text: string): number | null | undefined {
  if (text.trim() === '') return null
  const value = Number(text.trim())
  return Number.isInteger(value) && value >= 0 ? value : undefined
}

export interface VariantsManagerProps {
  readonly product: Product
  readonly token: string
  readonly variants: readonly Variant[]
  onClose(): void
  onChanged(): Promise<void>
}

/**
 * A product's variants — the sellable things, each with its own SKU, price,
 * stock, weight and tax category. The list and the form share one dialog: a
 * form opens *in place of* the list (with a way back), so a narrow screen never
 * has a form squeezed into a table row. Every validation message sits next to
 * its field and in the dialog; nothing can happen behind its backdrop.
 */
export function VariantsManager(props: VariantsManagerProps): JSX.Element {
  const { t, i18n } = useTranslation()
  const shopCurrency = useShopCurrency(props.token)
  const [mode, setMode] = useState<{ readonly variant: Variant | null } | null>(null)
  const [form, setForm] = useState<VariantForm>(emptyForm('EUR'))
  const [errors, setErrors] = useState<Readonly<Record<string, string>>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [success, setSuccess] = useState<string | null>(null)
  const [categories, setCategories] = useState<readonly string[]>(['standard'])
  const [toDelete, setToDelete] = useState<Variant | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [historyFor, setHistoryFor] = useState<Variant | null>(null)
  const [history, setHistory] = useState<readonly StockMovement[]>([])

  useEffect(() => {
    listTaxCategories(props.token)
      .then((response) => setCategories(response.categories))
      .catch(() => undefined)
  }, [props.token])

  const currencies = useMemo(
    () => currencyOptions(i18n.language, [form.currency, shopCurrency]),
    [i18n.language, form.currency, shopCurrency],
  )
  const categoryChoices =
    categories.includes(form.taxCategory) || form.taxCategory === NEW_CATEGORY
      ? categories
      : [...categories, form.taxCategory]

  function set<K extends keyof VariantForm>(key: K, value: VariantForm[K]): void {
    setForm((current) => ({ ...current, [key]: value }))
  }

  function openForm(variant: Variant | null): void {
    setMode({ variant })
    setForm(variant === null ? emptyForm(shopCurrency) : formFrom(variant))
    setErrors({})
    setFormError(null)
    setSuccess(null)
    setHistoryFor(null)
  }

  async function openHistory(variant: Variant): Promise<void> {
    setHistoryFor(variant)
    try {
      const { movements } = await listStockMovements(props.token, variant.id)
      setHistory(movements)
    } catch {
      setHistory([])
    }
  }

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault()
    if (mode === null) return
    const original = mode.variant
    const found: Record<string, string> = {}

    if (form.sku.trim() === '') found['sku'] = t('commerceProducts.skuRequired')
    if (form.title.trim() === '') found['title'] = t('commerceProducts.variantTitleRequired')

    const currency = original?.currency ?? form.currency
    const priceMinor = majorTextToMinor(form.price, currency)
    if (priceMinor === null) found['price'] = t('commerceProducts.priceInvalid')

    const onHand = Number(form.stock.trim() === '' ? '0' : form.stock.trim())
    if (!Number.isInteger(onHand) || onHand < 0) found['stock'] = t('commerceProducts.stockInvalid')

    const weight = nullableCount(form.weightGrams)
    if (weight === undefined) found['weightGrams'] = t('commerceProducts.weightInvalid')

    const category =
      form.taxCategory === NEW_CATEGORY ? form.newTaxCategory.trim() : form.taxCategory
    if (category === '') found['taxCategory'] = t('commerceTax.categoryRequired')

    const lowStock = nullableCount(form.lowStockThreshold)
    if (lowStock === undefined) found['lowStockThreshold'] = t('commerceProducts.dimensionInvalid')
    const width = nullableCount(form.widthMm)
    const height = nullableCount(form.heightMm)
    const depth = nullableCount(form.depthMm)
    if (width === undefined) found['widthMm'] = t('commerceProducts.dimensionInvalid')
    if (height === undefined) found['heightMm'] = t('commerceProducts.dimensionInvalid')
    if (depth === undefined) found['depthMm'] = t('commerceProducts.dimensionInvalid')

    let compareAtPriceMinor: number | null = null
    if (form.comparePrice.trim() !== '') {
      const parsed = majorTextToMinor(form.comparePrice, currency)
      if (parsed === null) found['comparePrice'] = t('commerceProducts.comparePriceInvalid')
      else if (priceMinor !== null && parsed <= priceMinor) {
        found['comparePrice'] = t('commerceProducts.comparePriceTooLow')
      } else compareAtPriceMinor = parsed
    }
    if (form.saleStartsAt !== '' && form.saleEndsAt !== '' && form.saleEndsAt < form.saleStartsAt) {
      found['saleEndsAt'] = t('commerceProducts.saleDatesOrder')
    }

    let recurring: { unit: RecurrenceUnit; count: number } | null = null
    if (form.recurring) {
      const count = Number(form.recurringCount.trim())
      if (!Number.isInteger(count) || count < 1) {
        found['recurringCount'] = t('commerceNewSubscription.everyInvalid')
      } else recurring = { unit: form.recurringUnit, count }
    }

    setErrors(found)
    if (Object.keys(found).length > 0 || priceMinor === null) {
      setFormError(t('commerceProducts.fixErrors'))
      return
    }

    const common = {
      sku: form.sku.trim(),
      title: form.title.trim(),
      priceMinor,
      allowBackorder: form.allowBackorder,
      weightGrams: weight ?? 0,
      taxCategory: category,
      lowStockThreshold: lowStock ?? null,
      compareAtPriceMinor,
      saleStartsAt:
        form.saleStartsAt === '' ? null : new Date(`${form.saleStartsAt}T00:00:00`).toISOString(),
      saleEndsAt:
        form.saleEndsAt === '' ? null : new Date(`${form.saleEndsAt}T23:59:59`).toISOString(),
      widthMm: width ?? null,
      heightMm: height ?? null,
      depthMm: depth ?? null,
      recurring,
    }
    setBusy(true)
    setFormError(null)
    try {
      if (original === null) {
        await createVariant(props.token, props.product.id, {
          ...common,
          currency: form.currency,
          onHand,
        })
      } else {
        await updateVariant(props.token, original.id, common)
        if (onHand !== original.onHand) await setStock(props.token, original.id, onHand)
      }
      setSuccess(
        t(original === null ? 'commerceProducts.variantCreated' : 'commerceProducts.variantSaved', {
          title: form.title.trim(),
        }),
      )
      setMode(null)
      await props.onChanged()
    } catch (caught) {
      const message = commerceErrorMessage(t, caught, 'commerceProducts.variantSaveError')
      setFormError(message)
      if (caught instanceof Error && 'code' in caught && caught.code === 'COMMERCE_SKU_TAKEN') {
        setErrors((current) => ({ ...current, sku: message }))
      }
    } finally {
      setBusy(false)
    }
  }

  async function confirmDelete(): Promise<void> {
    if (toDelete === null) return
    setBusy(true)
    setDeleteError(null)
    try {
      await deleteVariant(props.token, toDelete.id)
      setSuccess(t('commerceProducts.variantDeleted', { title: toDelete.title }))
      setToDelete(null)
      await props.onChanged()
    } catch (caught) {
      setDeleteError(commerceErrorMessage(t, caught, 'commerceProducts.variantDeleteError'))
    } finally {
      setBusy(false)
    }
  }

  const editingVariant = mode?.variant ?? null
  const live =
    editingVariant === null
      ? null
      : (props.variants.find((v) => v.id === editingVariant.id) ?? editingVariant)

  return (
    <Modal
      open
      onOpenChange={(open) => {
        if (!open) props.onClose()
      }}
      title={
        mode === null
          ? t('commerceProducts.variantsHeading', { title: props.product.title })
          : editingVariant === null
            ? t('commerceProducts.newVariantHeading')
            : t('commerceProducts.editVariantHeading', { title: editingVariant.title })
      }
      description={mode === null ? t('commerceProducts.variantsIntro') : undefined}
      closeLabel={t('common.close')}
      className="w-[min(46rem,calc(100vw-2rem))]"
      footer={
        mode === null ? (
          <>
            <Button variant="secondary" onClick={props.onClose}>
              {t('commerceProducts.close')}
            </Button>
            <Button onClick={() => openForm(null)}>{t('commerceProducts.addVariant')}</Button>
          </>
        ) : (
          <>
            <Button variant="secondary" onClick={() => setMode(null)} disabled={busy}>
              {t('commerceProducts.backToVariants')}
            </Button>
            <Button type="submit" form="variant-form" disabled={busy}>
              {editingVariant === null
                ? t('commerceProducts.createVariantButton')
                : t('commerceProducts.saveButton')}
            </Button>
          </>
        )
      }
    >
      {mode === null ? (
        <div className="flex flex-col gap-4">
          {success !== null && (
            <Notice tone="success" live="polite">
              <p>{success}</p>
            </Notice>
          )}
          <TableRoot
            label={t('commerceProducts.variantsHeading', { title: props.product.title })}
            stacked
          >
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeader>{t('commerceProducts.skuColumn')}</TableHeader>
                  <TableHeader>{t('commerceProducts.variantTitleColumn')}</TableHeader>
                  <TableHeader>{t('commerceProducts.priceColumn')}</TableHeader>
                  <TableHeader>{t('commerceProducts.stockColumn')}</TableHeader>
                  <TableHeader>{t('commerceProducts.actionsColumn')}</TableHeader>
                </TableRow>
              </TableHead>
              <TableBody>
                {props.variants.map((variant) => (
                  <TableRow key={variant.id}>
                    <TableCell stack="heading">
                      <span className="flex items-center gap-2">
                        {variant.imageMediaId === null ? null : (
                          <MediaThumbnail
                            token={props.token}
                            id={variant.imageMediaId}
                            alt=""
                            previewable
                          />
                        )}
                        <span className="whitespace-nowrap">{variant.sku}</span>
                      </span>
                    </TableCell>
                    <TableCell label={t('commerceProducts.variantTitleColumn')}>
                      {variant.title}
                      {variant.recurring !== null && (
                        <Badge tone="info" className="ml-2">
                          {t('commerceProducts.recurringBadge')}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell label={t('commerceProducts.priceColumn')}>
                      {formatMinor(variant.priceMinor, variant.currency, i18n.language)}
                      {variant.compareAtPriceMinor !== null && (
                        <span className="ml-1 text-muted-foreground line-through">
                          {formatMinor(
                            variant.compareAtPriceMinor,
                            variant.currency,
                            i18n.language,
                          )}
                        </span>
                      )}
                    </TableCell>
                    <TableCell label={t('commerceProducts.stockColumn')}>
                      {variant.onHand}
                      {variant.onHand === 0 && !variant.allowBackorder ? (
                        <Badge tone="danger" className="ml-2">
                          {t('commerceProducts.outOfStockBadge')}
                        </Badge>
                      ) : (
                        variant.lowStockThreshold !== null &&
                        variant.onHand <= variant.lowStockThreshold && (
                          <Badge tone="warning" className="ml-2">
                            {t('commerceProducts.lowStockBadge')}
                          </Badge>
                        )
                      )}
                    </TableCell>
                    <TableCell stack="actions">
                      <div className="flex flex-wrap gap-2">
                        <Button
                          variant="secondary"
                          size="sm"
                          aria-label={t('commerceProducts.edit', { title: variant.title })}
                          onClick={() => openForm(variant)}
                        >
                          {t('commerceProducts.editShort')}
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          aria-label={t('commerceProducts.stockHistory')}
                          onClick={() => void openHistory(variant)}
                        >
                          {t('commerceProducts.stockHistoryShort')}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive"
                          aria-label={t('commerceProducts.removeVariant', { title: variant.title })}
                          onClick={() => {
                            setDeleteError(null)
                            setToDelete(variant)
                          }}
                        >
                          {t('commerceProducts.removeShort')}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {props.variants.length === 0 && (
                  <TableEmpty colSpan={5}>{t('commerceProducts.noVariant')}</TableEmpty>
                )}
              </TableBody>
            </Table>
          </TableRoot>

          {historyFor !== null && (
            <div className="flex flex-col gap-2 border-t border-border pt-4">
              <h3 className="m-0 text-sm font-semibold">
                {t('commerceProducts.stockHistoryHeading', { title: historyFor.title })}
              </h3>
              <ul className="m-0 flex flex-col gap-1 p-0 text-sm">
                {history.map((movement) => (
                  <li key={movement.id} className="list-none">
                    {new Date(movement.createdAt).toLocaleString(i18n.language)} —{' '}
                    {t(`commerceProducts.movementReason.${movement.reason}`)} (
                    {movement.delta > 0 ? '+' : ''}
                    {movement.delta}) → {movement.balanceAfter}
                  </li>
                ))}
                {history.length === 0 && <li>{t('commerceProducts.stockHistoryEmpty')}</li>}
              </ul>
            </div>
          )}
        </div>
      ) : (
        <form
          id="variant-form"
          noValidate
          onSubmit={(event) => void submit(event)}
          className="flex flex-col gap-4"
        >
          {live !== null && (
            <div className="max-w-xs">
              <VariantImageField token={props.token} variant={live} onChanged={props.onChanged} />
            </div>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label={t('commerceProducts.skuColumn')}
              description={t('commerceProducts.skuHint')}
              error={errors['sku'] ?? null}
            >
              {(control) => (
                <Input {...control} value={form.sku} onChange={(e) => set('sku', e.target.value)} />
              )}
            </Field>
            <Field
              label={t('commerceProducts.variantTitleColumn')}
              description={t('commerceProducts.variantTitleHint')}
              error={errors['title'] ?? null}
            >
              {(control) => (
                <Input
                  {...control}
                  value={form.title}
                  onChange={(e) => set('title', e.target.value)}
                />
              )}
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field
              label={t('commerceProducts.priceColumn')}
              description={t('commerceProducts.priceHint')}
              error={errors['price'] ?? null}
            >
              {(control) => (
                <Input
                  {...control}
                  inputMode="decimal"
                  value={form.price}
                  onChange={(e) => set('price', e.target.value)}
                />
              )}
            </Field>
            <Field label={t('commerceProducts.currencyColumn')}>
              {(control) => (
                <Select
                  {...control}
                  value={form.currency}
                  disabled={editingVariant !== null}
                  onChange={(e) => set('currency', e.target.value)}
                >
                  {currencies.map((option) => (
                    <option key={option.code} value={option.code}>
                      {option.name}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label={t('commerceProducts.stockColumn')} error={errors['stock'] ?? null}>
              {(control) => (
                <Input
                  {...control}
                  inputMode="numeric"
                  value={form.stock}
                  onChange={(e) => set('stock', e.target.value)}
                />
              )}
            </Field>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.allowBackorder}
              onChange={(event) => set('allowBackorder', event.target.checked)}
            />
            {t('commerceProducts.allowBackorder')}
          </label>

          <fieldset className="m-0 flex min-w-0 flex-col gap-3 rounded-md border border-border p-3">
            <legend className="px-1 text-sm font-medium">
              {t('commerceProducts.shippingTaxHeading')}
            </legend>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label={t('commerceProducts.weightLabel')}
                description={t('commerceProducts.weightHint')}
                error={errors['weightGrams'] ?? null}
              >
                {(control) => (
                  <Input
                    {...control}
                    inputMode="numeric"
                    value={form.weightGrams}
                    onChange={(e) => set('weightGrams', e.target.value)}
                  />
                )}
              </Field>
              <Field
                label={t('commerceTax.categoryColumn')}
                description={t('commerceProducts.taxCategoryHint')}
                error={errors['taxCategory'] ?? null}
              >
                {(control) => (
                  <Select
                    {...control}
                    value={form.taxCategory}
                    onChange={(e) => set('taxCategory', e.target.value)}
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
            </div>
            {form.taxCategory === NEW_CATEGORY && (
              <Field label={t('commerceTax.newCategoryName')}>
                {(control) => (
                  <Input
                    {...control}
                    value={form.newTaxCategory}
                    onChange={(e) => set('newTaxCategory', e.target.value)}
                  />
                )}
              </Field>
            )}
          </fieldset>

          <fieldset className="m-0 flex min-w-0 flex-col gap-3 rounded-md border border-border p-3">
            <legend className="px-1 text-sm font-medium">
              {t('commerceProducts.recurringHeading')}
            </legend>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.recurring}
                onChange={(event) => set('recurring', event.target.checked)}
              />
              {t('commerceProducts.recurringToggle')}
            </label>
            {form.recurring && (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label={t('commerceNewSubscription.every')}
                  error={errors['recurringCount'] ?? null}
                >
                  {(control) => (
                    <Input
                      {...control}
                      inputMode="numeric"
                      value={form.recurringCount}
                      onChange={(e) => set('recurringCount', e.target.value)}
                    />
                  )}
                </Field>
                <Field label={t('commerceNewSubscription.unit')}>
                  {(control) => (
                    <Select
                      {...control}
                      value={form.recurringUnit}
                      onChange={(e) => set('recurringUnit', e.target.value as RecurrenceUnit)}
                    >
                      {UNITS.map((unit) => (
                        <option key={unit} value={unit}>
                          {t(`commerceNewSubscription.units.${unit}`)}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>
              </div>
            )}
            <p className="m-0 text-xs text-muted-foreground">
              {t('commerceProducts.recurringHint')}
            </p>
          </fieldset>

          <fieldset className="m-0 flex min-w-0 flex-col gap-3 rounded-md border border-border p-3">
            <legend className="px-1 text-sm font-medium">
              {t('commerceProducts.moreFieldsHeading')}
            </legend>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label={t('commerceProducts.lowStockThresholdColumn')}
                description={t('commerceProducts.lowStockHint')}
                error={errors['lowStockThreshold'] ?? null}
              >
                {(control) => (
                  <Input
                    {...control}
                    inputMode="numeric"
                    value={form.lowStockThreshold}
                    onChange={(e) => set('lowStockThreshold', e.target.value)}
                  />
                )}
              </Field>
              <Field
                label={t('commerceProducts.comparePriceColumn')}
                description={t('commerceProducts.comparePriceHint')}
                error={errors['comparePrice'] ?? null}
              >
                {(control) => (
                  <Input
                    {...control}
                    inputMode="decimal"
                    value={form.comparePrice}
                    onChange={(e) => set('comparePrice', e.target.value)}
                  />
                )}
              </Field>
              <Field
                label={t('commerceProducts.saleStartsColumn')}
                error={errors['saleStartsAt'] ?? null}
              >
                {(control) => (
                  <Input
                    {...control}
                    type="date"
                    value={form.saleStartsAt}
                    onChange={(e) => set('saleStartsAt', e.target.value)}
                  />
                )}
              </Field>
              <Field
                label={t('commerceProducts.saleEndsColumn')}
                error={errors['saleEndsAt'] ?? null}
              >
                {(control) => (
                  <Input
                    {...control}
                    type="date"
                    value={form.saleEndsAt}
                    onChange={(e) => set('saleEndsAt', e.target.value)}
                  />
                )}
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label={t('commerceProducts.widthColumn')} error={errors['widthMm'] ?? null}>
                {(control) => (
                  <Input
                    {...control}
                    inputMode="numeric"
                    value={form.widthMm}
                    onChange={(e) => set('widthMm', e.target.value)}
                  />
                )}
              </Field>
              <Field label={t('commerceProducts.heightColumn')} error={errors['heightMm'] ?? null}>
                {(control) => (
                  <Input
                    {...control}
                    inputMode="numeric"
                    value={form.heightMm}
                    onChange={(e) => set('heightMm', e.target.value)}
                  />
                )}
              </Field>
              <Field label={t('commerceProducts.depthColumn')} error={errors['depthMm'] ?? null}>
                {(control) => (
                  <Input
                    {...control}
                    inputMode="numeric"
                    value={form.depthMm}
                    onChange={(e) => set('depthMm', e.target.value)}
                  />
                )}
              </Field>
            </div>
          </fieldset>
          <DialogError message={formError} />
        </form>
      )}

      <ConfirmDialog
        open={toDelete !== null}
        title={t('commerceProducts.removeVariantTitle')}
        confirmLabel={t('commerceProducts.removeVariantConfirm')}
        busy={busy}
        error={deleteError}
        onCancel={() => setToDelete(null)}
        onConfirm={() => void confirmDelete()}
      >
        <p className="m-0">
          {t('commerceProducts.removeVariantBody', { title: toDelete?.title ?? '' })}
        </p>
      </ConfirmDialog>
    </Modal>
  )
}
