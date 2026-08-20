import { type FormEvent, type JSX, useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  archiveProduct,
  createProduct,
  createVariant,
  deleteVariant,
  listProducts,
  type Product,
  readProduct,
  setStock,
  updateProduct,
  updateVariant,
  type Variant,
} from '../api/commerce-client.js'
import { ApiError } from '../api/http.js'
import { useAuth } from '../auth/auth-context.js'
import { formatMinor, majorTextToMinor, minorToMajorText } from '../commerce/money.js'
import { slugify } from '../lib/slugify.js'
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

/**
 * The product list and its create/edit flow — contract E's catalogue
 * (ADR-0024), from the admin.
 *
 * A product's commercial record (`@cogenta/commerce`) is deliberately kept
 * separate from its editorial face (a contract A entry, via `contentRef`):
 * this screen only ever touches the former. Unlike the earlier MVP, a
 * product here carries its real model — a list of variants, each with its
 * own SKU, price, stock and backorder flag — because the backend has never
 * supported anything less; only this screen used to pretend otherwise.
 */
export function CommerceProductsRoute(): JSX.Element {
  const { t } = useTranslation()
  const auth = useAuth()
  const token = auth.state.status === 'authenticated' ? auth.state.token : null
  const roles = auth.state.status === 'authenticated' ? auth.state.user.roles : []
  // Courtesy only (R4 — the server is the real gate): `commerce.read` is held
  // by every role but `public`, so this hides the screen from nobody who
  // could actually see anything on it.
  const canRead = roles.length > 0

  const [products, setProducts] = useState<readonly Product[]>([])
  const [variantsByProduct, setVariantsByProduct] = useState<
    Readonly<Record<string, readonly Variant[]>>
  >({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionNotice, setActionNotice] = useState<string | null>(null)

  const [creating, setCreating] = useState(false)
  const [newHandle, setNewHandle] = useState('')
  const [newTitle, setNewTitle] = useState('')
  // Once the admin edits the handle directly, typing in the title must stop
  // overwriting it — same rule the taxonomy quick-create control already
  // follows for its own slug.
  const [handleTouched, setHandleTouched] = useState(false)

  const [editing, setEditing] = useState<Product | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [editStatus, setEditStatus] = useState<'active' | 'archived'>('active')

  const [managing, setManaging] = useState<Product | null>(null)

  const load = useCallback(async () => {
    if (token === null || !canRead) return
    setLoading(true)
    setError(null)
    try {
      const { products: list } = await listProducts(token)
      setProducts(list)
      const entries = await Promise.all(
        list.map(async (product) => {
          const { variants } = await readProduct(token, product.id)
          return [product.id, variants] as const
        }),
      )
      setVariantsByProduct(Object.fromEntries(entries))
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : t('commerceProducts.loadError'))
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
    setActionNotice(null)
    try {
      const product = await createProduct(token, { handle: newHandle, title: newTitle })
      setCreating(false)
      setNewHandle('')
      setNewTitle('')
      setHandleTouched(false)
      setActionNotice(t('commerceProducts.createSuccess', { title: product.title }))
      await load()
    } catch (caught) {
      setActionError(
        caught instanceof ApiError ? caught.message : t('commerceProducts.createError'),
      )
    }
  }

  function openEdit(product: Product): void {
    setEditing(product)
    setEditTitle(product.title)
    setEditStatus(product.status)
  }

  async function submitEdit(event: FormEvent): Promise<void> {
    event.preventDefault()
    if (token === null || editing === null) return
    setActionError(null)
    setActionNotice(null)
    try {
      const product = await updateProduct(token, editing.id, {
        title: editTitle,
        status: editStatus,
      })
      setEditing(null)
      setActionNotice(t('commerceProducts.updateSuccess', { title: product.title }))
      await load()
    } catch (caught) {
      setActionError(
        caught instanceof ApiError ? caught.message : t('commerceProducts.updateError'),
      )
    }
  }

  async function archive(product: Product): Promise<void> {
    if (token === null) return
    setActionError(null)
    setActionNotice(null)
    try {
      await archiveProduct(token, product.id)
      setActionNotice(t('commerceProducts.archiveSuccess', { title: product.title }))
      await load()
    } catch (caught) {
      setActionError(
        caught instanceof ApiError ? caught.message : t('commerceProducts.updateError'),
      )
    }
  }

  if (!canRead) {
    return (
      <section aria-labelledby="commerce-products-heading">
        <h1 id="commerce-products-heading">{t('commerceProducts.heading')}</h1>
        <p role="alert">{t('commerceProducts.signedInOnly')}</p>
      </section>
    )
  }

  return (
    <section aria-labelledby="commerce-products-heading" className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 id="commerce-products-heading" className="m-0 text-xl leading-7 font-semibold">
          {t('commerceProducts.heading')}
        </h1>
        <Button onClick={() => setCreating(true)}>{t('commerceProducts.newButton')}</Button>
      </div>

      {actionNotice !== null && (
        <Notice tone="success" live="polite">
          <p>{actionNotice}</p>
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
        <TableRoot label={t('commerceProducts.tableLabel')}>
          <Table>
            <TableHead>
              <TableRow>
                <TableHeader>{t('commerceProducts.titleColumn')}</TableHeader>
                <TableHeader>{t('commerceProducts.handleColumn')}</TableHeader>
                <TableHeader>{t('commerceProducts.variantsColumn')}</TableHeader>
                <TableHeader>{t('commerceProducts.stockColumn')}</TableHeader>
                <TableHeader>{t('commerceProducts.statusColumn')}</TableHeader>
                <TableHeader>{t('commerceProducts.actionsColumn')}</TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {products.map((product) => {
                const variants = variantsByProduct[product.id] ?? []
                const totalStock = variants.reduce((sum, variant) => sum + variant.onHand, 0)
                return (
                  <TableRow key={product.id}>
                    <TableCell>{product.title}</TableCell>
                    <TableCell>{product.handle}</TableCell>
                    <TableCell>
                      {t('commerceProducts.variantCount', { count: variants.length })}
                    </TableCell>
                    <TableCell>{totalStock}</TableCell>
                    <TableCell>
                      {product.status === 'active'
                        ? t('commerceProducts.active')
                        : t('commerceProducts.archived')}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-2">
                        <Button variant="secondary" size="sm" onClick={() => setManaging(product)}>
                          {t('commerceProducts.manageVariants')}
                        </Button>
                        <Button variant="secondary" size="sm" onClick={() => openEdit(product)}>
                          {t('commerceProducts.edit', { title: product.title })}
                        </Button>
                        {product.status === 'active' && (
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => void archive(product)}
                          >
                            {t('commerceProducts.archive', { title: product.title })}
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
              {products.length === 0 && (
                <TableEmpty colSpan={6}>{t('commerceProducts.empty')}</TableEmpty>
              )}
            </TableBody>
          </Table>
        </TableRoot>
      )}

      <Modal
        open={creating}
        onOpenChange={setCreating}
        title={t('commerceProducts.newHeading')}
        closeLabel={t('commerceProducts.close')}
      >
        <form onSubmit={submitCreate} className="flex flex-col gap-4">
          <Field label={t('commerceProducts.titleColumn')}>
            {(control) => (
              <Input
                {...control}
                required
                value={newTitle}
                onChange={(event) => {
                  const value = event.target.value
                  setNewTitle(value)
                  if (!handleTouched) setNewHandle(slugify(value))
                }}
              />
            )}
          </Field>
          <Field
            label={t('commerceProducts.handleColumn')}
            description={t('commerceProducts.handleHint')}
          >
            {(control) => (
              <Input
                {...control}
                required
                value={newHandle}
                onChange={(event) => {
                  setHandleTouched(true)
                  setNewHandle(event.target.value)
                }}
              />
            )}
          </Field>
          <p className="text-sm">{t('commerceProducts.variantsAfterCreate')}</p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setCreating(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit">{t('commerceProducts.createButton')}</Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) setEditing(null)
        }}
        title={t('commerceProducts.editHeading', { title: editing?.title ?? '' })}
        closeLabel={t('commerceProducts.close')}
      >
        <form onSubmit={submitEdit} className="flex flex-col gap-4">
          <Field label={t('commerceProducts.titleColumn')}>
            {(control) => (
              <Input
                {...control}
                required
                value={editTitle}
                onChange={(event) => setEditTitle(event.target.value)}
              />
            )}
          </Field>
          <Field label={t('commerceProducts.statusColumn')}>
            {(control) => (
              <Select
                {...control}
                value={editStatus}
                onChange={(event) => setEditStatus(event.target.value as 'active' | 'archived')}
              >
                <option value="active">{t('commerceProducts.active')}</option>
                <option value="archived">{t('commerceProducts.archived')}</option>
              </Select>
            )}
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setEditing(null)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit">{t('commerceProducts.saveButton')}</Button>
          </div>
        </form>
      </Modal>

      {managing !== null && token !== null && (
        <VariantsModal
          product={managing}
          token={token}
          variants={variantsByProduct[managing.id] ?? []}
          onClose={() => setManaging(null)}
          onChanged={async () => {
            await load()
          }}
        />
      )}
    </section>
  )
}

interface VariantsModalProps {
  readonly product: Product
  readonly token: string
  readonly variants: readonly Variant[]
  readonly onClose: () => void
  readonly onChanged: () => Promise<void>
}

/**
 * A product's real model: a whole list of variants, each its own SKU, price,
 * stock and backorder flag. Stock always goes through its own route (never a
 * field on the edit form) — the same rule the single-variant screen already
 * followed, now applied per row instead of once.
 */
function VariantsModal(props: VariantsModalProps): JSX.Element {
  const { t, i18n } = useTranslation()
  const [error, setError] = useState<string | null>(null)

  const [addingSku, setAddingSku] = useState('')
  const [addingTitle, setAddingTitle] = useState('')
  const [addingPrice, setAddingPrice] = useState('')
  const [addingCurrency, setAddingCurrency] = useState('EUR')
  const [addingStock, setAddingStock] = useState('0')

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editSku, setEditSku] = useState('')
  const [editTitle, setEditTitle] = useState('')
  const [editPrice, setEditPrice] = useState('')
  const [editStock, setEditStock] = useState('0')
  const [editBackorder, setEditBackorder] = useState(false)

  async function submitAdd(event: FormEvent): Promise<void> {
    event.preventDefault()
    setError(null)
    const priceMinor = majorTextToMinor(addingPrice, addingCurrency)
    if (priceMinor === null) {
      setError(t('commerceProducts.priceInvalid'))
      return
    }
    const onHand = Number.parseInt(addingStock, 10)
    if (!Number.isFinite(onHand) || onHand < 0) {
      setError(t('commerceProducts.stockInvalid'))
      return
    }
    try {
      await createVariant(props.token, props.product.id, {
        sku: addingSku,
        title: addingTitle,
        priceMinor,
        currency: addingCurrency,
        onHand,
      })
      setAddingSku('')
      setAddingTitle('')
      setAddingPrice('')
      setAddingStock('0')
      await props.onChanged()
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : t('commerceProducts.createError'))
    }
  }

  function openVariantEdit(variant: Variant): void {
    setEditingId(variant.id)
    setEditSku(variant.sku)
    setEditTitle(variant.title)
    setEditPrice(minorToMajorText(variant.priceMinor, variant.currency))
    setEditStock(String(variant.onHand))
    setEditBackorder(variant.allowBackorder)
  }

  async function submitVariantEdit(event: FormEvent, variant: Variant): Promise<void> {
    event.preventDefault()
    setError(null)
    const priceMinor = majorTextToMinor(editPrice, variant.currency)
    if (priceMinor === null) {
      setError(t('commerceProducts.priceInvalid'))
      return
    }
    const onHand = Number.parseInt(editStock, 10)
    if (!Number.isFinite(onHand) || onHand < 0) {
      setError(t('commerceProducts.stockInvalid'))
      return
    }
    try {
      await updateVariant(props.token, variant.id, {
        sku: editSku,
        title: editTitle,
        priceMinor,
        allowBackorder: editBackorder,
      })
      if (onHand !== variant.onHand) {
        await setStock(props.token, variant.id, onHand)
      }
      setEditingId(null)
      await props.onChanged()
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : t('commerceProducts.updateError'))
    }
  }

  async function removeVariant(variant: Variant): Promise<void> {
    setError(null)
    try {
      await deleteVariant(props.token, variant.id)
      await props.onChanged()
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : t('commerceProducts.updateError'))
    }
  }

  return (
    <Modal
      open
      onOpenChange={(open) => {
        if (!open) props.onClose()
      }}
      title={t('commerceProducts.variantsHeading', { title: props.product.title })}
      closeLabel={t('commerceProducts.close')}
    >
      <div className="flex flex-col gap-4">
        {error !== null && (
          <Notice tone="danger" live="assertive">
            <p>{error}</p>
          </Notice>
        )}

        <TableRoot label={t('commerceProducts.variantsHeading', { title: props.product.title })}>
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
              {props.variants.map((variant) =>
                editingId === variant.id ? (
                  <TableRow key={variant.id}>
                    <TableCell colSpan={5}>
                      <form
                        onSubmit={(event) => void submitVariantEdit(event, variant)}
                        className="flex flex-wrap items-end gap-3"
                      >
                        <Field label={t('commerceProducts.skuColumn')}>
                          {(control) => (
                            <Input
                              {...control}
                              required
                              value={editSku}
                              onChange={(event) => setEditSku(event.target.value)}
                            />
                          )}
                        </Field>
                        <Field label={t('commerceProducts.variantTitleColumn')}>
                          {(control) => (
                            <Input
                              {...control}
                              required
                              value={editTitle}
                              onChange={(event) => setEditTitle(event.target.value)}
                            />
                          )}
                        </Field>
                        <Field label={t('commerceProducts.priceColumn')}>
                          {(control) => (
                            <Input
                              {...control}
                              type="text"
                              inputMode="decimal"
                              value={editPrice}
                              onChange={(event) => setEditPrice(event.target.value)}
                            />
                          )}
                        </Field>
                        <Field label={t('commerceProducts.stockColumn')}>
                          {(control) => (
                            <Input
                              {...control}
                              type="number"
                              min={0}
                              value={editStock}
                              onChange={(event) => setEditStock(event.target.value)}
                            />
                          )}
                        </Field>
                        <label className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={editBackorder}
                            onChange={(event) => setEditBackorder(event.target.checked)}
                          />
                          {t('commerceProducts.allowBackorder')}
                        </label>
                        <div className="flex gap-2">
                          <Button variant="secondary" size="sm" onClick={() => setEditingId(null)}>
                            {t('common.cancel')}
                          </Button>
                          <Button type="submit" size="sm">
                            {t('commerceProducts.saveButton')}
                          </Button>
                        </div>
                      </form>
                    </TableCell>
                  </TableRow>
                ) : (
                  <TableRow key={variant.id}>
                    <TableCell>{variant.sku}</TableCell>
                    <TableCell>{variant.title}</TableCell>
                    <TableCell>
                      {formatMinor(variant.priceMinor, variant.currency, i18n.language)}
                    </TableCell>
                    <TableCell>{variant.onHand}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => openVariantEdit(variant)}
                        >
                          {t('commerceProducts.edit', { title: variant.title })}
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => void removeVariant(variant)}
                        >
                          {t('commerceProducts.removeVariant', { title: variant.title })}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ),
              )}
              {props.variants.length === 0 && (
                <TableEmpty colSpan={5}>{t('commerceProducts.noVariant')}</TableEmpty>
              )}
            </TableBody>
          </Table>
        </TableRoot>

        <form onSubmit={submitAdd} className="flex flex-wrap items-end gap-3 border-t pt-4">
          <Field label={t('commerceProducts.skuColumn')}>
            {(control) => (
              <Input
                {...control}
                required
                value={addingSku}
                onChange={(event) => setAddingSku(event.target.value)}
              />
            )}
          </Field>
          <Field label={t('commerceProducts.variantTitleColumn')}>
            {(control) => (
              <Input
                {...control}
                required
                value={addingTitle}
                onChange={(event) => setAddingTitle(event.target.value)}
              />
            )}
          </Field>
          <Field label={t('commerceProducts.priceColumn')}>
            {(control) => (
              <Input
                {...control}
                type="text"
                inputMode="decimal"
                required
                value={addingPrice}
                onChange={(event) => setAddingPrice(event.target.value)}
              />
            )}
          </Field>
          <Field label={t('commerceProducts.currencyColumn')}>
            {(control) => (
              <Input
                {...control}
                required
                maxLength={3}
                value={addingCurrency}
                onChange={(event) => setAddingCurrency(event.target.value.toUpperCase())}
              />
            )}
          </Field>
          <Field label={t('commerceProducts.stockColumn')}>
            {(control) => (
              <Input
                {...control}
                type="number"
                min={0}
                required
                value={addingStock}
                onChange={(event) => setAddingStock(event.target.value)}
              />
            )}
          </Field>
          <Button type="submit" size="sm">
            {t('commerceProducts.addVariant')}
          </Button>
        </form>
      </div>
    </Modal>
  )
}
