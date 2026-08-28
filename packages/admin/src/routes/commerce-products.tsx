import { type FormEvent, type JSX, useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  archiveProduct,
  createProduct,
  createVariant,
  deleteVariant,
  listProducts,
  listStockMovements,
  type Product,
  type ProductTerm,
  readProduct,
  type StockMovement,
  setStock,
  updateProduct,
  updateVariant,
  type Variant,
} from '../api/commerce-client.js'
import { ApiError } from '../api/http.js'
import { useAuth } from '../auth/auth-context.js'
import { BulkPriceModal } from '../commerce/bulk-price-modal.js'
import { LowStockPanel } from '../commerce/low-stock-panel.js'
import { formatMinor, majorTextToMinor, minorToMajorText } from '../commerce/money.js'
import { ProductCategoryPicker } from '../commerce/product-category-picker.js'
import { ProductContentLink } from '../commerce/product-content-link.js'
import { ProductImportExportPanel } from '../commerce/product-import-export-panel.js'
import { slugify } from '../lib/slugify.js'
import {
  Button,
  Field,
  Input,
  Modal,
  Notice,
  Pagination,
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

const PAGE_SIZE = 25

type SortOption =
  | 'createdAt_desc'
  | 'createdAt_asc'
  | 'title_asc'
  | 'title_desc'
  | 'handle_asc'
  | 'handle_desc'

const SORT_OPTIONS: readonly {
  readonly value: SortOption
  readonly sort: 'createdAt' | 'title' | 'handle'
  readonly direction: 'asc' | 'desc'
}[] = [
  { value: 'createdAt_desc', sort: 'createdAt', direction: 'desc' },
  { value: 'createdAt_asc', sort: 'createdAt', direction: 'asc' },
  { value: 'title_asc', sort: 'title', direction: 'asc' },
  { value: 'title_desc', sort: 'title', direction: 'desc' },
  { value: 'handle_asc', sort: 'handle', direction: 'asc' },
  { value: 'handle_desc', sort: 'handle', direction: 'desc' },
]

/**
 * The product list and its create/edit flow — contract E's catalogue
 * (ADR-0024), from the admin.
 *
 * Fiche 51 extends the earlier screen with what the store already supported
 * but the screen never exposed: search/sort/pagination (task 2), a link to
 * the product's editorial face (task 1), classification against a taxonomy
 * (task 3), the low-stock alert and CSV import/export (tasks 4 and 6).
 *
 * A product's commercial record (`@cogenta/commerce`) is deliberately kept
 * separate from its editorial face (a contract A entry, via `contentRef`):
 * this screen only ever touches the former, and shows the latter through
 * `ProductContentLink` rather than reimplementing a content editor here.
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
  const [termsByProduct, setTermsByProduct] = useState<
    Readonly<Record<string, readonly ProductTerm[]>>
  >({})
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionNotice, setActionNotice] = useState<string | null>(null)

  // Task 2: search, status filter and sort — all server-side, the store
  // having already supported them before the screen ever asked for them.
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'' | 'active' | 'archived'>('')
  const [sortOption, setSortOption] = useState<SortOption>('createdAt_desc')
  const sortConfig: {
    readonly sort: 'createdAt' | 'title' | 'handle'
    readonly direction: 'asc' | 'desc'
  } = SORT_OPTIONS.find((option) => option.value === sortOption) ?? {
    sort: 'createdAt',
    direction: 'desc',
  }

  const [lowStockOnly, setLowStockOnly] = useState(false)
  const [showImportExport, setShowImportExport] = useState(false)

  // Task 2: bulk actions — always with a selection the admin made on purpose.
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())
  const [bulkPriceOpen, setBulkPriceOpen] = useState(false)
  const [bulkArchiveOpen, setBulkArchiveOpen] = useState(false)
  const [bulkBusy, setBulkBusy] = useState(false)

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

  const load = useCallback(
    async (append: boolean) => {
      if (token === null || !canRead) return
      if (append) setLoadingMore(true)
      else setLoading(true)
      setError(null)
      try {
        const page = await listProducts(token, {
          ...(statusFilter === '' ? {} : { status: statusFilter }),
          ...(search.trim() === '' ? {} : { q: search.trim() }),
          sort: sortConfig.sort,
          direction: sortConfig.direction,
          limit: PAGE_SIZE,
          offset: append ? products.length : 0,
        })
        const list = append ? [...products, ...page.products] : page.products
        setProducts(list)
        setHasMore(page.hasMore)

        const entries = await Promise.all(
          page.products.map(async (product) => {
            const { variants, terms } = await readProduct(token, product.id)
            return [product.id, variants, terms] as const
          }),
        )
        setVariantsByProduct((current) => ({
          ...current,
          ...Object.fromEntries(entries.map(([id, variants]) => [id, variants])),
        }))
        setTermsByProduct((current) => ({
          ...current,
          ...Object.fromEntries(entries.map(([id, , terms]) => [id, terms])),
        }))
      } catch (caught) {
        setError(caught instanceof ApiError ? caught.message : t('commerceProducts.loadError'))
      } finally {
        setLoading(false)
        setLoadingMore(false)
      }
    },
    // `products.length` (for the offset of a "load more" call) is
    // deliberately not a dependency: including it would refetch page one on
    // every append. `loadMore` below reads the current length through the
    // closure at call time instead.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [token, canRead, statusFilter, search, sortOption, t],
  )

  useEffect(() => {
    void load(false)
    setSelected(new Set())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, canRead, statusFilter, search, sortOption])

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
      await load(false)
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
      await load(false)
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
      await load(false)
    } catch (caught) {
      setActionError(
        caught instanceof ApiError ? caught.message : t('commerceProducts.updateError'),
      )
    }
  }

  function toggleSelected(productId: string): void {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(productId)) next.delete(productId)
      else next.add(productId)
      return next
    })
  }

  function toggleSelectAllVisible(): void {
    setSelected((current) =>
      products.every((product) => current.has(product.id))
        ? new Set()
        : new Set(products.map((p) => p.id)),
    )
  }

  const selectedLines = products
    .filter((product) => selected.has(product.id))
    .flatMap((product) =>
      (variantsByProduct[product.id] ?? []).map((variant) => ({ product, variant })),
    )

  async function applyBulkArchive(): Promise<void> {
    if (token === null) return
    setBulkBusy(true)
    setActionError(null)
    try {
      for (const product of products.filter((p) => selected.has(p.id))) {
        await archiveProduct(token, product.id)
      }
      setBulkArchiveOpen(false)
      setSelected(new Set())
      setActionNotice(t('commerceProducts.bulkArchiveSuccess', { count: selectedLines.length }))
      await load(false)
    } catch (caught) {
      setActionError(
        caught instanceof ApiError ? caught.message : t('commerceProducts.updateError'),
      )
    } finally {
      setBulkBusy(false)
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

  const allVisibleSelected =
    products.length > 0 && products.every((product) => selected.has(product.id))

  return (
    <section aria-labelledby="commerce-products-heading" className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 id="commerce-products-heading" className="m-0 text-xl leading-7 font-semibold">
          {t('commerceProducts.heading')}
        </h1>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => setShowImportExport((current) => !current)}>
            {t('commerceProducts.importExportToggle')}
          </Button>
          <Button onClick={() => setCreating(true)}>{t('commerceProducts.newButton')}</Button>
        </div>
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

      {showImportExport && token !== null && (
        <ProductImportExportPanel token={token} onImported={async () => load(false)} />
      )}

      <div className="flex flex-wrap items-end gap-3">
        <Field label={t('commerceProducts.searchLabel')}>
          {(control) => (
            <Input
              {...control}
              type="search"
              placeholder={t('commerceProducts.searchPlaceholder')}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          )}
        </Field>
        <Field label={t('commerceProducts.statusColumn')}>
          {(control) => (
            <Select
              {...control}
              value={statusFilter}
              onChange={(event) =>
                setStatusFilter(event.target.value as '' | 'active' | 'archived')
              }
            >
              <option value="">{t('commerceOrders.allStatuses')}</option>
              <option value="active">{t('commerceProducts.active')}</option>
              <option value="archived">{t('commerceProducts.archived')}</option>
            </Select>
          )}
        </Field>
        <Field label={t('commerceProducts.sortLabel')}>
          {(control) => (
            <Select
              {...control}
              value={sortOption}
              onChange={(event) => setSortOption(event.target.value as SortOption)}
            >
              <option value="createdAt_desc">{t('commerceProducts.sortCreatedDesc')}</option>
              <option value="createdAt_asc">{t('commerceProducts.sortCreatedAsc')}</option>
              <option value="title_asc">{t('commerceProducts.sortTitleAsc')}</option>
              <option value="title_desc">{t('commerceProducts.sortTitleDesc')}</option>
              <option value="handle_asc">{t('commerceProducts.sortHandleAsc')}</option>
              <option value="handle_desc">{t('commerceProducts.sortHandleDesc')}</option>
            </Select>
          )}
        </Field>
        <label className="flex items-center gap-2 pb-2 text-sm">
          <input
            type="checkbox"
            checked={lowStockOnly}
            onChange={(event) => setLowStockOnly(event.target.checked)}
          />
          {t('commerceProducts.lowStockToggle')}
        </label>
      </div>

      {lowStockOnly && token !== null ? (
        <LowStockPanel token={token} onManage={(product) => setManaging(product)} />
      ) : (
        <>
          {selected.size > 0 && (
            <div className="flex flex-wrap items-center gap-3 rounded-md border border-input bg-card p-3">
              <span className="text-sm font-medium">
                {t('commerceProducts.bulkSelectedCount', { count: selected.size })}
              </span>
              <Button variant="secondary" size="sm" onClick={() => setBulkPriceOpen(true)}>
                {t('commerceProducts.bulkPriceButton')}
              </Button>
              <Button variant="destructive" size="sm" onClick={() => setBulkArchiveOpen(true)}>
                {t('commerceProducts.bulkArchiveButton')}
              </Button>
              <Button variant="secondary" size="sm" onClick={() => setSelected(new Set())}>
                {t('commerceProducts.bulkClearSelection')}
              </Button>
            </div>
          )}

          {loading && <p>{t('common.loading')}</p>}

          {!loading && error === null && (
            <TableRoot label={t('commerceProducts.tableLabel')}>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableHeader>
                      <input
                        type="checkbox"
                        aria-label={t('commerceProducts.bulkSelectAll')}
                        checked={allVisibleSelected}
                        onChange={toggleSelectAllVisible}
                      />
                    </TableHeader>
                    <TableHeader>{t('commerceProducts.titleColumn')}</TableHeader>
                    <TableHeader>{t('commerceProducts.handleColumn')}</TableHeader>
                    <TableHeader>{t('commerceProducts.contentColumn')}</TableHeader>
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
                        <TableCell>
                          <input
                            type="checkbox"
                            aria-label={t('commerceProducts.bulkSelectOne', {
                              title: product.title,
                            })}
                            checked={selected.has(product.id)}
                            onChange={() => toggleSelected(product.id)}
                          />
                        </TableCell>
                        <TableCell>{product.title}</TableCell>
                        <TableCell>{product.handle}</TableCell>
                        <TableCell>
                          {product.contentRef === null
                            ? t('commerceProducts.contentUnlinkedShort')
                            : t('commerceProducts.contentLinkedShort')}
                        </TableCell>
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
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => setManaging(product)}
                            >
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
                    <TableEmpty colSpan={8}>{t('commerceProducts.empty')}</TableEmpty>
                  )}
                </TableBody>
              </Table>
            </TableRoot>
          )}

          {!loading && (
            <Pagination
              variant="cursor"
              hasMore={hasMore}
              loading={loadingMore}
              onLoadMore={() => void load(true)}
              loadMoreLabel={t('commerceProducts.loadMore')}
              loadingLabel={t('common.loading')}
            />
          )}
        </>
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
        <div className="flex flex-col gap-6">
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

          {editing !== null && token !== null && (
            <div className="flex flex-col gap-2 border-t pt-4">
              <h3 className="m-0 text-sm font-semibold">{t('commerceProducts.contentHeading')}</h3>
              <ProductContentLink
                token={token}
                product={editing}
                onChange={(updated) => {
                  setEditing(updated)
                  setProducts((current) => current.map((p) => (p.id === updated.id ? updated : p)))
                }}
              />
            </div>
          )}

          {editing !== null && token !== null && (
            <div className="flex flex-col gap-2 border-t pt-4">
              <h3 className="m-0 text-sm font-semibold">{t('commerceProducts.categoryHeading')}</h3>
              <ProductCategoryPicker
                token={token}
                product={editing}
                existingTerms={termsByProduct[editing.id] ?? []}
                onSaved={(terms) =>
                  setTermsByProduct((current) => ({ ...current, [editing.id]: terms }))
                }
              />
            </div>
          )}
        </div>
      </Modal>

      {managing !== null && token !== null && (
        <VariantsModal
          product={managing}
          token={token}
          variants={variantsByProduct[managing.id] ?? []}
          onClose={() => setManaging(null)}
          onChanged={async () => {
            await load(false)
          }}
        />
      )}

      {bulkPriceOpen && token !== null && (
        <BulkPriceModal
          token={token}
          lines={selectedLines}
          onClose={() => setBulkPriceOpen(false)}
          onApplied={async () => {
            await load(false)
          }}
        />
      )}

      <Modal
        open={bulkArchiveOpen}
        onOpenChange={setBulkArchiveOpen}
        title={t('commerceProducts.bulkArchiveHeading')}
        closeLabel={t('commerceProducts.close')}
      >
        <div className="flex flex-col gap-4">
          <p>{t('commerceProducts.bulkArchiveConfirm', { count: selected.size })}</p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setBulkArchiveOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="destructive"
              disabled={bulkBusy}
              onClick={() => void applyBulkArchive()}
            >
              {t('commerceProducts.bulkArchiveConfirmButton')}
            </Button>
          </div>
        </div>
      </Modal>
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

/** Blank means "leave as is" on edit, "not set" on add — the input never carries a literal `0` or `null` the admin did not type. */
interface VariantFormState {
  sku: string
  title: string
  price: string
  currency: string
  stock: string
  allowBackorder: boolean
  weightGrams: string
  taxCategory: string
  lowStockThreshold: string
  comparePrice: string
  saleStartsAt: string
  saleEndsAt: string
  widthMm: string
  heightMm: string
  depthMm: string
}

const EMPTY_VARIANT_FORM: VariantFormState = {
  sku: '',
  title: '',
  price: '',
  currency: 'EUR',
  stock: '0',
  allowBackorder: false,
  weightGrams: '',
  taxCategory: '',
  lowStockThreshold: '',
  comparePrice: '',
  saleStartsAt: '',
  saleEndsAt: '',
  widthMm: '',
  heightMm: '',
  depthMm: '',
}

function variantFormFrom(variant: Variant): VariantFormState {
  return {
    sku: variant.sku,
    title: variant.title,
    price: minorToMajorText(variant.priceMinor, variant.currency),
    currency: variant.currency,
    stock: String(variant.onHand),
    allowBackorder: variant.allowBackorder,
    weightGrams: String(variant.weightGrams),
    taxCategory: variant.taxCategory,
    lowStockThreshold: variant.lowStockThreshold === null ? '' : String(variant.lowStockThreshold),
    comparePrice:
      variant.compareAtPriceMinor === null
        ? ''
        : minorToMajorText(variant.compareAtPriceMinor, variant.currency),
    saleStartsAt: variant.saleStartsAt ?? '',
    saleEndsAt: variant.saleEndsAt ?? '',
    widthMm: variant.widthMm === null ? '' : String(variant.widthMm),
    heightMm: variant.heightMm === null ? '' : String(variant.heightMm),
    depthMm: variant.depthMm === null ? '' : String(variant.depthMm),
  }
}

/** `''` → `null` (cleared), a number string → that integer, anything unparsable → `undefined` (refused, caller shows an error). */
function parseNullableInt(text: string): number | null | undefined {
  if (text.trim() === '') return null
  const value = Number(text)
  return Number.isInteger(value) && value >= 0 ? value : undefined
}

/**
 * A product's real model: a whole list of variants, each its own SKU, price,
 * stock and backorder flag, plus the fiche 51 extras (low-stock threshold,
 * a promo price and window, and dimensions). Stock always goes through its
 * own route (never a field on the edit form) — the same rule the
 * single-variant screen already followed, now applied per row instead of once.
 */
function VariantsModal(props: VariantsModalProps): JSX.Element {
  const { t, i18n } = useTranslation()
  const [error, setError] = useState<string | null>(null)

  const [adding, setAdding] = useState<VariantFormState>(EMPTY_VARIANT_FORM)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<VariantFormState>(EMPTY_VARIANT_FORM)
  const [historyFor, setHistoryFor] = useState<Variant | null>(null)
  const [history, setHistory] = useState<readonly StockMovement[]>([])

  async function openHistory(variant: Variant): Promise<void> {
    setHistoryFor(variant)
    try {
      const { movements } = await listStockMovements(props.token, variant.id)
      setHistory(movements)
    } catch {
      setHistory([])
    }
  }

  async function submitAdd(event: FormEvent): Promise<void> {
    event.preventDefault()
    setError(null)
    const priceMinor = majorTextToMinor(adding.price, adding.currency)
    if (priceMinor === null) {
      setError(t('commerceProducts.priceInvalid'))
      return
    }
    const onHand = Number.parseInt(adding.stock, 10)
    if (!Number.isFinite(onHand) || onHand < 0) {
      setError(t('commerceProducts.stockInvalid'))
      return
    }
    const lowStockThreshold = parseNullableInt(adding.lowStockThreshold)
    const widthMm = parseNullableInt(adding.widthMm)
    const heightMm = parseNullableInt(adding.heightMm)
    const depthMm = parseNullableInt(adding.depthMm)
    if (
      lowStockThreshold === undefined ||
      widthMm === undefined ||
      heightMm === undefined ||
      depthMm === undefined
    ) {
      setError(t('commerceProducts.dimensionInvalid'))
      return
    }
    const compareAtPriceMinor =
      adding.comparePrice.trim() === ''
        ? null
        : majorTextToMinor(adding.comparePrice, adding.currency)
    if (adding.comparePrice.trim() !== '' && compareAtPriceMinor === null) {
      setError(t('commerceProducts.priceInvalid'))
      return
    }
    try {
      await createVariant(props.token, props.product.id, {
        sku: adding.sku,
        title: adding.title,
        priceMinor,
        currency: adding.currency,
        onHand,
        allowBackorder: adding.allowBackorder,
        ...(adding.weightGrams.trim() === '' ? {} : { weightGrams: Number(adding.weightGrams) }),
        ...(adding.taxCategory.trim() === '' ? {} : { taxCategory: adding.taxCategory }),
        lowStockThreshold,
        compareAtPriceMinor,
        saleStartsAt:
          adding.saleStartsAt === '' ? null : new Date(adding.saleStartsAt).toISOString(),
        saleEndsAt: adding.saleEndsAt === '' ? null : new Date(adding.saleEndsAt).toISOString(),
        widthMm,
        heightMm,
        depthMm,
      })
      setAdding(EMPTY_VARIANT_FORM)
      await props.onChanged()
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : t('commerceProducts.createError'))
    }
  }

  function openVariantEdit(variant: Variant): void {
    setEditingId(variant.id)
    setEditForm(variantFormFrom(variant))
  }

  async function submitVariantEdit(event: FormEvent, variant: Variant): Promise<void> {
    event.preventDefault()
    setError(null)
    const priceMinor = majorTextToMinor(editForm.price, variant.currency)
    if (priceMinor === null) {
      setError(t('commerceProducts.priceInvalid'))
      return
    }
    const onHand = Number.parseInt(editForm.stock, 10)
    if (!Number.isFinite(onHand) || onHand < 0) {
      setError(t('commerceProducts.stockInvalid'))
      return
    }
    const lowStockThreshold = parseNullableInt(editForm.lowStockThreshold)
    const widthMm = parseNullableInt(editForm.widthMm)
    const heightMm = parseNullableInt(editForm.heightMm)
    const depthMm = parseNullableInt(editForm.depthMm)
    if (
      lowStockThreshold === undefined ||
      widthMm === undefined ||
      heightMm === undefined ||
      depthMm === undefined
    ) {
      setError(t('commerceProducts.dimensionInvalid'))
      return
    }
    const compareAtPriceMinor =
      editForm.comparePrice.trim() === ''
        ? null
        : majorTextToMinor(editForm.comparePrice, variant.currency)
    if (editForm.comparePrice.trim() !== '' && compareAtPriceMinor === null) {
      setError(t('commerceProducts.priceInvalid'))
      return
    }
    try {
      await updateVariant(props.token, variant.id, {
        sku: editForm.sku,
        title: editForm.title,
        priceMinor,
        allowBackorder: editForm.allowBackorder,
        ...(editForm.weightGrams.trim() === ''
          ? {}
          : { weightGrams: Number(editForm.weightGrams) }),
        ...(editForm.taxCategory.trim() === '' ? {} : { taxCategory: editForm.taxCategory }),
        lowStockThreshold,
        compareAtPriceMinor,
        saleStartsAt:
          editForm.saleStartsAt === '' ? null : new Date(editForm.saleStartsAt).toISOString(),
        saleEndsAt: editForm.saleEndsAt === '' ? null : new Date(editForm.saleEndsAt).toISOString(),
        widthMm,
        heightMm,
        depthMm,
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

  function extraFields(
    form: VariantFormState,
    setForm: (updater: (current: VariantFormState) => VariantFormState) => void,
  ): JSX.Element {
    return (
      <details className="flex w-full flex-col gap-3">
        <summary className="cursor-pointer text-sm font-medium">
          {t('commerceProducts.moreFields')}
        </summary>
        <div className="flex flex-wrap items-end gap-3 pt-2">
          <Field label={t('commerceProducts.lowStockThresholdColumn')}>
            {(control) => (
              <Input
                {...control}
                type="number"
                min={0}
                value={form.lowStockThreshold}
                onChange={(event) =>
                  setForm((current) => ({ ...current, lowStockThreshold: event.target.value }))
                }
              />
            )}
          </Field>
          <Field label={t('commerceProducts.comparePriceColumn')}>
            {(control) => (
              <Input
                {...control}
                type="text"
                inputMode="decimal"
                value={form.comparePrice}
                onChange={(event) =>
                  setForm((current) => ({ ...current, comparePrice: event.target.value }))
                }
              />
            )}
          </Field>
          <Field label={t('commerceProducts.saleStartsColumn')}>
            {(control) => (
              <Input
                {...control}
                type="date"
                value={form.saleStartsAt.slice(0, 10)}
                onChange={(event) =>
                  setForm((current) => ({ ...current, saleStartsAt: event.target.value }))
                }
              />
            )}
          </Field>
          <Field label={t('commerceProducts.saleEndsColumn')}>
            {(control) => (
              <Input
                {...control}
                type="date"
                value={form.saleEndsAt.slice(0, 10)}
                onChange={(event) =>
                  setForm((current) => ({ ...current, saleEndsAt: event.target.value }))
                }
              />
            )}
          </Field>
          <Field label={t('commerceProducts.widthColumn')}>
            {(control) => (
              <Input
                {...control}
                type="number"
                min={0}
                value={form.widthMm}
                onChange={(event) =>
                  setForm((current) => ({ ...current, widthMm: event.target.value }))
                }
              />
            )}
          </Field>
          <Field label={t('commerceProducts.heightColumn')}>
            {(control) => (
              <Input
                {...control}
                type="number"
                min={0}
                value={form.heightMm}
                onChange={(event) =>
                  setForm((current) => ({ ...current, heightMm: event.target.value }))
                }
              />
            )}
          </Field>
          <Field label={t('commerceProducts.depthColumn')}>
            {(control) => (
              <Input
                {...control}
                type="number"
                min={0}
                value={form.depthMm}
                onChange={(event) =>
                  setForm((current) => ({ ...current, depthMm: event.target.value }))
                }
              />
            )}
          </Field>
        </div>
      </details>
    )
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
                              value={editForm.sku}
                              onChange={(event) =>
                                setEditForm((current) => ({ ...current, sku: event.target.value }))
                              }
                            />
                          )}
                        </Field>
                        <Field label={t('commerceProducts.variantTitleColumn')}>
                          {(control) => (
                            <Input
                              {...control}
                              required
                              value={editForm.title}
                              onChange={(event) =>
                                setEditForm((current) => ({
                                  ...current,
                                  title: event.target.value,
                                }))
                              }
                            />
                          )}
                        </Field>
                        <Field label={t('commerceProducts.priceColumn')}>
                          {(control) => (
                            <Input
                              {...control}
                              type="text"
                              inputMode="decimal"
                              value={editForm.price}
                              onChange={(event) =>
                                setEditForm((current) => ({
                                  ...current,
                                  price: event.target.value,
                                }))
                              }
                            />
                          )}
                        </Field>
                        <Field label={t('commerceProducts.stockColumn')}>
                          {(control) => (
                            <Input
                              {...control}
                              type="number"
                              min={0}
                              value={editForm.stock}
                              onChange={(event) =>
                                setEditForm((current) => ({
                                  ...current,
                                  stock: event.target.value,
                                }))
                              }
                            />
                          )}
                        </Field>
                        <label className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={editForm.allowBackorder}
                            onChange={(event) =>
                              setEditForm((current) => ({
                                ...current,
                                allowBackorder: event.target.checked,
                              }))
                            }
                          />
                          {t('commerceProducts.allowBackorder')}
                        </label>
                        {extraFields(editForm, setEditForm)}
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
                    <TableCell>
                      {variant.onHand}
                      {variant.lowStockThreshold !== null &&
                        variant.onHand <= variant.lowStockThreshold && (
                          <span className="ml-1 text-destructive">
                            {t('commerceProducts.lowStockBadge')}
                          </span>
                        )}
                    </TableCell>
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
                          variant="secondary"
                          size="sm"
                          onClick={() => void openHistory(variant)}
                        >
                          {t('commerceProducts.stockHistory')}
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

        {historyFor !== null && (
          <div className="flex flex-col gap-2 border-t pt-4">
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

        <form onSubmit={submitAdd} className="flex flex-col gap-3 border-t pt-4">
          <div className="flex flex-wrap items-end gap-3">
            <Field label={t('commerceProducts.skuColumn')}>
              {(control) => (
                <Input
                  {...control}
                  required
                  value={adding.sku}
                  onChange={(event) =>
                    setAdding((current) => ({ ...current, sku: event.target.value }))
                  }
                />
              )}
            </Field>
            <Field label={t('commerceProducts.variantTitleColumn')}>
              {(control) => (
                <Input
                  {...control}
                  required
                  value={adding.title}
                  onChange={(event) =>
                    setAdding((current) => ({ ...current, title: event.target.value }))
                  }
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
                  value={adding.price}
                  onChange={(event) =>
                    setAdding((current) => ({ ...current, price: event.target.value }))
                  }
                />
              )}
            </Field>
            <Field label={t('commerceProducts.currencyColumn')}>
              {(control) => (
                <Input
                  {...control}
                  required
                  maxLength={3}
                  value={adding.currency}
                  onChange={(event) =>
                    setAdding((current) => ({
                      ...current,
                      currency: event.target.value.toUpperCase(),
                    }))
                  }
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
                  value={adding.stock}
                  onChange={(event) =>
                    setAdding((current) => ({ ...current, stock: event.target.value }))
                  }
                />
              )}
            </Field>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={adding.allowBackorder}
                onChange={(event) =>
                  setAdding((current) => ({ ...current, allowBackorder: event.target.checked }))
                }
              />
              {t('commerceProducts.allowBackorder')}
            </label>
            <Button type="submit" size="sm">
              {t('commerceProducts.addVariant')}
            </Button>
          </div>
          {extraFields(adding, setAdding)}
        </form>
      </div>
    </Modal>
  )
}
