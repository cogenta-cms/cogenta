import { type FormEvent, type JSX, useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  archiveProduct,
  createProduct,
  listProducts,
  type Product,
  type ProductTerm,
  readProduct,
  updateProduct,
  type Variant,
} from '../api/commerce-client.js'
import { useAuth } from '../auth/auth-context.js'
import { BulkPriceModal } from '../commerce/bulk-price-modal.js'
import { commerceErrorMessage } from '../commerce/commerce-errors.js'
import { ConfirmDialog } from '../commerce/confirm-dialog.js'
import { DialogError } from '../commerce/dialog-error.js'
import { LowStockPanel } from '../commerce/low-stock-panel.js'
import { ProductCategoryPicker } from '../commerce/product-category-picker.js'
import { ProductContentLink } from '../commerce/product-content-link.js'
import { ProductImagesField } from '../commerce/product-images-field.js'
import { ProductImportExportPanel } from '../commerce/product-import-export-panel.js'
import { VariantsManager } from '../commerce/variants-manager.js'
import { slugify } from '../lib/slugify.js'
import { MediaThumbnail } from '../media/media-thumbnail.js'
import {
  Badge,
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
const HANDLE_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u

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
  const [editHandle, setEditHandle] = useState('')
  const [editStatus, setEditStatus] = useState<'active' | 'archived'>('active')

  // Every refusal is shown in the dialog that raised it (a banner on the page
  // would sit behind the dialog's backdrop and never be seen).
  const [fieldErrors, setFieldErrors] = useState<Readonly<Record<string, string>>>({})
  const [dialogError, setDialogError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [toArchive, setToArchive] = useState<Product | null>(null)

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
        setError(commerceErrorMessage(t, caught, 'commerceProducts.loadError'))
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

  function validateHandle(handle: string): string | null {
    if (handle.trim() === '') return t('commerceProducts.handleRequired')
    return HANDLE_PATTERN.test(handle.trim()) ? null : t('commerceProducts.handleInvalid')
  }

  function openCreate(): void {
    setCreating(true)
    setNewHandle('')
    setNewTitle('')
    setHandleTouched(false)
    setFieldErrors({})
    setDialogError(null)
  }

  async function submitCreate(event: FormEvent): Promise<void> {
    event.preventDefault()
    if (token === null) return
    const found: Record<string, string> = {}
    if (newTitle.trim() === '') found['title'] = t('commerceProducts.titleRequired')
    const handleProblem = validateHandle(newHandle)
    if (handleProblem !== null) found['handle'] = handleProblem
    setFieldErrors(found)
    if (Object.keys(found).length > 0) {
      setDialogError(t('commerceProducts.fixErrors'))
      return
    }
    setBusy(true)
    setDialogError(null)
    setActionNotice(null)
    try {
      const product = await createProduct(token, {
        handle: newHandle.trim(),
        title: newTitle.trim(),
      })
      setCreating(false)
      setActionNotice(t('commerceProducts.createSuccess', { title: product.title }))
      await load(false)
      // The next step is always the variants: a product with none cannot be sold.
      setManaging(product)
    } catch (caught) {
      const message = commerceErrorMessage(t, caught, 'commerceProducts.createError')
      setDialogError(message)
      if (
        caught instanceof Error &&
        'code' in caught &&
        caught.code === 'COMMERCE_PRODUCT_HANDLE_TAKEN'
      ) {
        setFieldErrors({ handle: message })
      }
    } finally {
      setBusy(false)
    }
  }

  function openEdit(product: Product): void {
    setEditing(product)
    setEditTitle(product.title)
    setEditHandle(product.handle)
    setEditStatus(product.status)
    setFieldErrors({})
    setDialogError(null)
  }

  async function submitEdit(event: FormEvent): Promise<void> {
    event.preventDefault()
    if (token === null || editing === null) return
    const found: Record<string, string> = {}
    if (editTitle.trim() === '') found['title'] = t('commerceProducts.titleRequired')
    const handleProblem = validateHandle(editHandle)
    if (handleProblem !== null) found['handle'] = handleProblem
    setFieldErrors(found)
    if (Object.keys(found).length > 0) {
      setDialogError(t('commerceProducts.fixErrors'))
      return
    }
    setBusy(true)
    setDialogError(null)
    setActionNotice(null)
    try {
      const product = await updateProduct(token, editing.id, {
        title: editTitle.trim(),
        handle: editHandle.trim(),
        status: editStatus,
      })
      setEditing(null)
      setActionNotice(t('commerceProducts.updateSuccess', { title: product.title }))
      await load(false)
    } catch (caught) {
      const message = commerceErrorMessage(t, caught, 'commerceProducts.updateError')
      setDialogError(message)
      if (
        caught instanceof Error &&
        'code' in caught &&
        caught.code === 'COMMERCE_PRODUCT_HANDLE_TAKEN'
      ) {
        setFieldErrors({ handle: message })
      }
    } finally {
      setBusy(false)
    }
  }

  async function confirmArchive(): Promise<void> {
    if (token === null || toArchive === null) return
    setBusy(true)
    setDialogError(null)
    setActionNotice(null)
    try {
      await archiveProduct(token, toArchive.id)
      setActionNotice(t('commerceProducts.archiveSuccess', { title: toArchive.title }))
      setToArchive(null)
      await load(false)
    } catch (caught) {
      setDialogError(commerceErrorMessage(t, caught, 'commerceProducts.updateError'))
    } finally {
      setBusy(false)
    }
  }

  async function reactivate(product: Product): Promise<void> {
    if (token === null) return
    setActionError(null)
    setActionNotice(null)
    try {
      await updateProduct(token, product.id, { status: 'active' })
      setActionNotice(t('commerceProducts.reactivateSuccess', { title: product.title }))
      await load(false)
    } catch (caught) {
      setActionError(commerceErrorMessage(t, caught, 'commerceProducts.updateError'))
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
      setActionError(commerceErrorMessage(t, caught, 'commerceProducts.updateError'))
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
        <h1
          id="commerce-products-heading"
          className="m-0 text-2xl leading-tight font-bold tracking-tight"
        >
          {t('commerceProducts.heading')}
        </h1>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => setShowImportExport((current) => !current)}>
            {t('commerceProducts.importExportToggle')}
          </Button>
          <Button onClick={openCreate}>{t('commerceProducts.newButton')}</Button>
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
            <TableRoot label={t('commerceProducts.tableLabel')} stacked>
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
                    <TableHeader>{t('commerceProducts.imageColumn')}</TableHeader>
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
                        <TableCell stack="select">
                          <input
                            type="checkbox"
                            aria-label={t('commerceProducts.bulkSelectOne', {
                              title: product.title,
                            })}
                            checked={selected.has(product.id)}
                            onChange={() => toggleSelected(product.id)}
                          />
                        </TableCell>
                        <TableCell label={t('commerceProducts.imageColumn')}>
                          {product.imageMediaIds[0] === undefined || token === null ? (
                            <span
                              className="media-thumbnail media-thumbnail--placeholder"
                              aria-hidden="true"
                            />
                          ) : (
                            <MediaThumbnail
                              token={token}
                              id={product.imageMediaIds[0]}
                              alt=""
                              previewable
                            />
                          )}
                        </TableCell>
                        <TableCell stack="heading">{product.title}</TableCell>
                        <TableCell label={t('commerceProducts.handleColumn')}>
                          <span className="text-muted-foreground">{product.handle}</span>
                        </TableCell>
                        <TableCell label={t('commerceProducts.variantsColumn')}>
                          {variants.length === 0 ? (
                            <Badge tone="warning">{t('commerceProducts.noVariantBadge')}</Badge>
                          ) : (
                            t('commerceProducts.variantCount', { count: variants.length })
                          )}
                        </TableCell>
                        <TableCell label={t('commerceProducts.stockColumn')}>
                          {totalStock}
                        </TableCell>
                        <TableCell label={t('commerceProducts.statusColumn')}>
                          <Badge tone={product.status === 'active' ? 'success' : 'neutral'}>
                            {product.status === 'active'
                              ? t('commerceProducts.active')
                              : t('commerceProducts.archived')}
                          </Badge>
                        </TableCell>
                        <TableCell stack="actions">
                          <div className="flex flex-wrap gap-2">
                            <Button
                              variant="secondary"
                              size="sm"
                              aria-label={t('commerceProducts.manageVariantsOf', {
                                title: product.title,
                              })}
                              onClick={() => setManaging(product)}
                            >
                              {t('commerceProducts.manageVariants')}
                            </Button>
                            <Button
                              variant="secondary"
                              size="sm"
                              aria-label={t('commerceProducts.edit', { title: product.title })}
                              onClick={() => openEdit(product)}
                            >
                              {t('commerceProducts.editShort')}
                            </Button>
                            {product.status === 'active' ? (
                              <Button
                                variant="ghost"
                                size="sm"
                                aria-label={t('commerceProducts.archive', { title: product.title })}
                                onClick={() => {
                                  setDialogError(null)
                                  setToArchive(product)
                                }}
                              >
                                {t('commerceProducts.archiveShort')}
                              </Button>
                            ) : (
                              <Button
                                variant="ghost"
                                size="sm"
                                aria-label={t('commerceProducts.reactivate', {
                                  title: product.title,
                                })}
                                onClick={() => void reactivate(product)}
                              >
                                {t('commerceProducts.reactivateShort')}
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
        description={t('commerceProducts.newIntro')}
        closeLabel={t('common.close')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setCreating(false)} disabled={busy}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" form="product-create-form" disabled={busy}>
              {t('commerceProducts.createButton')}
            </Button>
          </>
        }
      >
        <form
          id="product-create-form"
          noValidate
          onSubmit={(event) => void submitCreate(event)}
          className="flex flex-col gap-4"
        >
          <Field label={t('commerceProducts.titleColumn')} error={fieldErrors['title'] ?? null}>
            {(control) => (
              <Input
                {...control}
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
            error={fieldErrors['handle'] ?? null}
          >
            {(control) => (
              <Input
                {...control}
                value={newHandle}
                onChange={(event) => {
                  setHandleTouched(true)
                  setNewHandle(event.target.value)
                }}
              />
            )}
          </Field>
          <p className="m-0 text-sm text-muted-foreground">
            {t('commerceProducts.variantsAfterCreate')}
          </p>
          <DialogError message={dialogError} />
        </form>
      </Modal>

      <Modal
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) setEditing(null)
        }}
        title={t('commerceProducts.editHeading', { title: editing?.title ?? '' })}
        description={t('commerceProducts.editIntro')}
        closeLabel={t('common.close')}
        className="w-[min(36rem,calc(100vw-2rem))]"
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditing(null)} disabled={busy}>
              {t('commerceProducts.closeEdit')}
            </Button>
            <Button type="submit" form="product-edit-form" disabled={busy}>
              {t('commerceProducts.saveButton')}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-6">
          <form
            id="product-edit-form"
            noValidate
            onSubmit={(event) => void submitEdit(event)}
            className="flex flex-col gap-4"
          >
            <Field label={t('commerceProducts.titleColumn')} error={fieldErrors['title'] ?? null}>
              {(control) => (
                <Input
                  {...control}
                  value={editTitle}
                  onChange={(event) => setEditTitle(event.target.value)}
                />
              )}
            </Field>
            <Field
              label={t('commerceProducts.handleColumn')}
              description={t('commerceProducts.handleEditHint')}
              error={fieldErrors['handle'] ?? null}
            >
              {(control) => (
                <Input
                  {...control}
                  value={editHandle}
                  onChange={(event) => setEditHandle(event.target.value)}
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
            <DialogError message={dialogError} />
          </form>

          {editing !== null && token !== null && (
            <div className="flex flex-col gap-2 border-t border-border pt-4">
              <h3 className="m-0 text-sm font-semibold">{t('commerceProducts.imagesHeading')}</h3>
              <ProductImagesField
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
            <div className="flex flex-col gap-2 border-t border-border pt-4">
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
            <div className="flex flex-col gap-2 border-t border-border pt-4">
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

      <ConfirmDialog
        open={toArchive !== null}
        title={t('commerceProducts.archiveTitle')}
        confirmLabel={t('commerceProducts.archiveConfirm')}
        destructive={false}
        busy={busy}
        error={dialogError}
        onCancel={() => setToArchive(null)}
        onConfirm={() => void confirmArchive()}
      >
        <p className="m-0">
          {t('commerceProducts.archiveBody', { title: toArchive?.title ?? '' })}
        </p>
      </ConfirmDialog>

      {managing !== null && token !== null && (
        <VariantsManager
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
        closeLabel={t('common.close')}
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
