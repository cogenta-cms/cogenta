import { type FormEvent, type JSX, useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  archiveProduct,
  createProduct,
  createVariant,
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
 * (ADR-0024), from the admin, for the first time.
 *
 * A product's commercial record (`@cogenta/commerce`) is deliberately kept
 * separate from its editorial face (a contract A entry, via `contentRef`):
 * this screen only ever touches the former. A product is shown here with
 * exactly one variant, which is the MVP this screen fixes on purpose — a
 * variant picker/matrix is real future work, not something to fake with a
 * hidden default that would surprise the next person to open this file.
 */
export function CommerceProductsRoute(): JSX.Element {
  const { t, i18n } = useTranslation()
  const auth = useAuth()
  const token = auth.state.status === 'authenticated' ? auth.state.token : null
  const roles = auth.state.status === 'authenticated' ? auth.state.user.roles : []
  // Courtesy only (R4 — the server is the real gate): `commerce.read` is held
  // by every role but `public`, so this hides the screen from nobody who
  // could actually see anything on it.
  const canRead = roles.length > 0

  const [products, setProducts] = useState<readonly Product[]>([])
  const [variants, setVariants] = useState<Readonly<Record<string, Variant | undefined>>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const [creating, setCreating] = useState(false)
  const [newHandle, setNewHandle] = useState('')
  const [newTitle, setNewTitle] = useState('')
  const [newPrice, setNewPrice] = useState('')
  const [newCurrency, setNewCurrency] = useState('EUR')
  const [newStock, setNewStock] = useState('0')

  const [editing, setEditing] = useState<Product | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [editStatus, setEditStatus] = useState<'active' | 'archived'>('active')
  const [editPrice, setEditPrice] = useState('')
  const [editStock, setEditStock] = useState('0')

  const load = useCallback(async () => {
    if (token === null || !canRead) return
    setLoading(true)
    setError(null)
    try {
      const { products: list } = await listProducts(token)
      setProducts(list)
      // One extra request per product, to show what a table row actually
      // needs (price, stock) — the list route only ever returns the
      // commercial record itself, on purpose (see `router.ts`'s comment on
      // why stock is its own route).
      const entries = await Promise.all(
        list.map(async (product) => {
          const { variants: productVariants } = await readProduct(token, product.id)
          return [product.id, productVariants[0]] as const
        }),
      )
      setVariants(Object.fromEntries(entries))
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
    const priceMinor = majorTextToMinor(newPrice, newCurrency)
    if (priceMinor === null) {
      setActionError(t('commerceProducts.priceInvalid'))
      return
    }
    const onHand = Number.parseInt(newStock, 10)
    if (!Number.isFinite(onHand) || onHand < 0) {
      setActionError(t('commerceProducts.stockInvalid'))
      return
    }
    try {
      const product = await createProduct(token, { handle: newHandle, title: newTitle })
      await createVariant(token, product.id, {
        sku: newHandle,
        title: newTitle,
        priceMinor,
        currency: newCurrency,
        onHand,
      })
      setCreating(false)
      setNewHandle('')
      setNewTitle('')
      setNewPrice('')
      setNewStock('0')
      await load()
    } catch (caught) {
      setActionError(
        caught instanceof ApiError ? caught.message : t('commerceProducts.createError'),
      )
    }
  }

  function openEdit(product: Product): void {
    const variant = variants[product.id]
    setEditing(product)
    setEditTitle(product.title)
    setEditStatus(product.status)
    setEditPrice(
      variant === undefined ? '' : minorToMajorText(variant.priceMinor, variant.currency),
    )
    setEditStock(variant === undefined ? '0' : String(variant.onHand))
  }

  async function submitEdit(event: FormEvent): Promise<void> {
    event.preventDefault()
    if (token === null || editing === null) return
    setActionError(null)
    const variant = variants[editing.id]
    try {
      await updateProduct(token, editing.id, { title: editTitle, status: editStatus })
      if (variant !== undefined) {
        const priceMinor = majorTextToMinor(editPrice, variant.currency)
        if (priceMinor === null) {
          setActionError(t('commerceProducts.priceInvalid'))
          return
        }
        const onHand = Number.parseInt(editStock, 10)
        if (!Number.isFinite(onHand) || onHand < 0) {
          setActionError(t('commerceProducts.stockInvalid'))
          return
        }
        if (priceMinor !== variant.priceMinor) {
          await updateVariant(token, variant.id, { priceMinor })
        }
        if (onHand !== variant.onHand) {
          await setStock(token, variant.id, onHand)
        }
      }
      setEditing(null)
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
    try {
      await archiveProduct(token, product.id)
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
                <TableHeader>{t('commerceProducts.priceColumn')}</TableHeader>
                <TableHeader>{t('commerceProducts.stockColumn')}</TableHeader>
                <TableHeader>{t('commerceProducts.statusColumn')}</TableHeader>
                <TableHeader>{t('commerceProducts.actionsColumn')}</TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {products.map((product) => {
                const variant = variants[product.id]
                return (
                  <TableRow key={product.id}>
                    <TableCell>{product.title}</TableCell>
                    <TableCell>{product.handle}</TableCell>
                    <TableCell>
                      {variant === undefined
                        ? t('commerceProducts.noVariant')
                        : formatMinor(variant.priceMinor, variant.currency, i18n.language)}
                    </TableCell>
                    <TableCell>{variant === undefined ? '—' : variant.onHand}</TableCell>
                    <TableCell>
                      {product.status === 'active'
                        ? t('commerceProducts.active')
                        : t('commerceProducts.archived')}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-2">
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
                onChange={(event) => setNewTitle(event.target.value)}
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
                onChange={(event) => setNewHandle(event.target.value)}
              />
            )}
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field
              label={t('commerceProducts.priceColumn')}
              description={t('commerceProducts.priceHint')}
            >
              {(control) => (
                <Input
                  {...control}
                  type="text"
                  inputMode="decimal"
                  required
                  value={newPrice}
                  onChange={(event) => setNewPrice(event.target.value)}
                />
              )}
            </Field>
            <Field label={t('commerceProducts.currencyColumn')}>
              {(control) => (
                <Input
                  {...control}
                  required
                  maxLength={3}
                  value={newCurrency}
                  onChange={(event) => setNewCurrency(event.target.value.toUpperCase())}
                />
              )}
            </Field>
          </div>
          <Field label={t('commerceProducts.stockColumn')}>
            {(control) => (
              <Input
                {...control}
                type="number"
                min={0}
                required
                value={newStock}
                onChange={(event) => setNewStock(event.target.value)}
              />
            )}
          </Field>
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
          <div className="grid grid-cols-2 gap-4">
            <Field label={t('commerceProducts.priceColumn')}>
              {(control) => (
                <Input
                  {...control}
                  type="text"
                  inputMode="decimal"
                  disabled={variants[editing?.id ?? ''] === undefined}
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
                  disabled={variants[editing?.id ?? ''] === undefined}
                  value={editStock}
                  onChange={(event) => setEditStock(event.target.value)}
                />
              )}
            </Field>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setEditing(null)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit">{t('commerceProducts.saveButton')}</Button>
          </div>
        </form>
      </Modal>
    </section>
  )
}
