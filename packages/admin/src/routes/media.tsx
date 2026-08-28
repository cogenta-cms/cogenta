import { type DragEvent, type FormEvent, type JSX, useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ApiError } from '../api/client.js'
import {
  bulkDeleteMedia,
  bulkMoveMedia,
  createMediaFolder,
  deleteMediaFolder,
  listMedia,
  listMediaFolders,
  MEDIA_KINDS,
  type MediaAsset,
  type MediaFolder,
  type MediaKind,
  type MediaSortField,
  moveMedia,
  updateMediaFolder,
} from '../api/media-client.js'
import { useAuth } from '../auth/auth-context.js'
import { MediaDetail } from '../media/media-detail.js'
import { MediaFolderTree, setMediaDragData } from '../media/media-folder-tree.js'
import { MediaThumbnail } from '../media/media-thumbnail.js'
import { UploadForm } from '../media/upload-form.js'
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
  Pagination,
  Select,
} from '../ui/index.js'

const PAGE_SIZE = 25

/**
 * Fiche 46: dossiers et gestion de fichiers enrichie.
 *
 * L2 task 11 built the store, fiche 11 built search/filter/sort/pagination,
 * bulk actions, tags and usage entirely server-side — this screen was
 * still a single-file thumbnail grid with no wiring to any of it. Fiche 46
 * adds the folder tree (a table `@cogenta/core` gained alongside it) and
 * finally calls everything fiche 11 already shipped.
 *
 * Filters live in plain component state, not the URL — unlike
 * `collection-list.tsx`'s status/locale filters (fiche 01 task 5's own
 * explicit "a pasted link reopens the same list" requirement), nothing in
 * this fiche asks for that, and the media library is a supporting screen an
 * editor drops into rather than a bookmarked destination. A deliberate scope
 * line, not an oversight.
 */
export function MediaRoute(): JSX.Element {
  const { t } = useTranslation()
  const auth = useAuth()
  const token = auth.state.status === 'authenticated' ? auth.state.token : null

  const [folders, setFolders] = useState<readonly MediaFolder[]>([])
  const [foldersError, setFoldersError] = useState(false)
  const [folderBusy, setFolderBusy] = useState(false)

  /** `undefined` = "all media", `null` = "unclassified", a string = that folder's own contents. */
  const [selectedFolderId, setSelectedFolderId] = useState<string | null | undefined>(undefined)

  const [items, setItems] = useState<readonly MediaAsset[]>([])
  const [hasMore, setHasMore] = useState(false)
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const [query, setQuery] = useState('')
  const [submittedQuery, setSubmittedQuery] = useState('')
  const [kindFilter, setKindFilter] = useState<MediaKind | ''>('')
  const [tagFilter, setTagFilter] = useState('')
  const [sort, setSort] = useState<{ field: MediaSortField; direction: 'asc' | 'desc' }>({
    field: 'createdAt',
    direction: 'desc',
  })

  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())
  const [bulkBusy, setBulkBusy] = useState(false)
  const [bulkReport, setBulkReport] = useState<{
    readonly succeeded: number
    readonly failed: readonly { readonly id: string; readonly message: string }[]
  } | null>(null)
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false)
  const [bulkMoveTarget, setBulkMoveTarget] = useState('')

  const [folderModal, setFolderModal] = useState<
    | { readonly mode: 'create'; readonly parentId: string | null }
    | { readonly mode: 'rename'; readonly folder: MediaFolder }
    | null
  >(null)
  const [folderModalName, setFolderModalName] = useState('')
  const [folderModalError, setFolderModalError] = useState<string | null>(null)
  const [deleteFolderTarget, setDeleteFolderTarget] = useState<MediaFolder | null>(null)
  const [deleteFolderError, setDeleteFolderError] = useState<string | null>(null)

  const loadFolders = useCallback(async () => {
    if (token === null) return
    try {
      const tree = await listMediaFolders(token)
      setFolders(tree)
      setFoldersError(false)
    } catch {
      setFoldersError(true)
    }
  }, [token])

  useEffect(() => {
    void loadFolders()
  }, [loadFolders])

  const load = useCallback(async () => {
    if (token === null) return
    setLoading(true)
    setError(null)
    try {
      const page = await listMedia(token, {
        limit: PAGE_SIZE,
        ...(kindFilter === '' ? {} : { kind: kindFilter }),
        ...(tagFilter.trim() === '' ? {} : { tag: tagFilter.trim() }),
        ...(submittedQuery.trim() === '' ? {} : { q: submittedQuery.trim() }),
        sort: sort.field,
        direction: sort.direction,
        ...(selectedFolderId === undefined ? {} : { folderId: selectedFolderId }),
      })
      setItems(page.items)
      setHasMore(page.hasMore)
      setNextCursor(page.nextCursor)
      setSelected(new Set())
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : t('media.loadError'))
    } finally {
      setLoading(false)
    }
  }, [token, kindFilter, tagFilter, submittedQuery, sort, selectedFolderId, t])

  useEffect(() => {
    void load()
  }, [load])

  async function loadMore(): Promise<void> {
    if (token === null || nextCursor === null) return
    setLoadingMore(true)
    try {
      const page = await listMedia(token, {
        limit: PAGE_SIZE,
        cursor: nextCursor,
        ...(kindFilter === '' ? {} : { kind: kindFilter }),
        ...(tagFilter.trim() === '' ? {} : { tag: tagFilter.trim() }),
        ...(submittedQuery.trim() === '' ? {} : { q: submittedQuery.trim() }),
        sort: sort.field,
        direction: sort.direction,
        ...(selectedFolderId === undefined ? {} : { folderId: selectedFolderId }),
      })
      setItems((current) => [...current, ...page.items])
      setHasMore(page.hasMore)
      setNextCursor(page.nextCursor)
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : t('media.loadError'))
    } finally {
      setLoadingMore(false)
    }
  }

  function toggleSelected(id: string): void {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // ---------------------------------------------------------------- bulk actions

  async function runBulkDelete(): Promise<void> {
    if (token === null) return
    setBulkBusy(true)
    setBulkReport(null)
    try {
      const result = await bulkDeleteMedia(token, [...selected])
      setBulkReport({
        succeeded: result.deleted.length,
        failed: result.failed.map((f) => ({ id: f.id, message: f.message })),
      })
      await load()
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : t('media.deleteError'))
    } finally {
      setBulkBusy(false)
      setConfirmBulkDelete(false)
    }
  }

  async function runBulkMove(): Promise<void> {
    if (token === null) return
    const folderId = bulkMoveTarget === '' ? null : bulkMoveTarget
    setBulkBusy(true)
    setBulkReport(null)
    try {
      const result = await bulkMoveMedia(token, [...selected], folderId)
      setBulkReport({
        succeeded: result.moved.length,
        failed: result.failed.map((f) => ({ id: f.id, message: f.message })),
      })
      await load()
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : t('media.moveError'))
    } finally {
      setBulkBusy(false)
    }
  }

  // ---------------------------------------------------------------- folders

  function openCreateFolder(parentId: string | null): void {
    setFolderModal({ mode: 'create', parentId })
    setFolderModalName('')
    setFolderModalError(null)
  }

  function openRenameFolder(folder: MediaFolder): void {
    setFolderModal({ mode: 'rename', folder })
    setFolderModalName(folder.name)
    setFolderModalError(null)
  }

  async function submitFolderModal(event: FormEvent): Promise<void> {
    event.preventDefault()
    if (token === null || folderModal === null) return
    const name = folderModalName.trim()
    if (name.length === 0) return
    setFolderBusy(true)
    setFolderModalError(null)
    try {
      if (folderModal.mode === 'create') {
        await createMediaFolder(token, { name, parentId: folderModal.parentId })
      } else {
        await updateMediaFolder(token, folderModal.folder.id, { name })
      }
      await loadFolders()
      setFolderModal(null)
    } catch (caught) {
      setFolderModalError(caught instanceof ApiError ? caught.message : t('media.folderError'))
    } finally {
      setFolderBusy(false)
    }
  }

  async function confirmDeleteFolder(): Promise<void> {
    if (token === null || deleteFolderTarget === null) return
    setFolderBusy(true)
    setDeleteFolderError(null)
    try {
      await deleteMediaFolder(token, deleteFolderTarget.id)
      if (selectedFolderId === deleteFolderTarget.id) setSelectedFolderId(undefined)
      await loadFolders()
      setDeleteFolderTarget(null)
    } catch (caught) {
      setDeleteFolderError(caught instanceof ApiError ? caught.message : t('media.folderError'))
    } finally {
      setFolderBusy(false)
    }
  }

  async function dropAssetOnFolder(folderId: string | null, assetId: string): Promise<void> {
    if (token === null) return
    try {
      const updated = await moveMedia(token, assetId, folderId)
      setItems((current) =>
        selectedFolderId === undefined
          ? current.map((item) => (item.id === updated.id ? updated : item))
          : current.filter((item) => item.id !== updated.id),
      )
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : t('media.moveError'))
    }
  }

  if (token === null) return <p>{t('common.loading')}</p>

  const selectedAsset = items.find((item) => item.id === selectedId) ?? null
  const breadcrumb: readonly MediaFolder[] = (() => {
    if (typeof selectedFolderId !== 'string') return []
    const chain: MediaFolder[] = []
    let cursor: string | null = selectedFolderId
    while (cursor !== null) {
      const folder = folders.find((candidate) => candidate.id === cursor)
      if (folder === undefined) break
      chain.unshift(folder)
      cursor = folder.parentId
    }
    return chain
  })()

  return (
    <section aria-labelledby="media-heading" className="flex flex-col gap-6">
      <h1 id="media-heading" className="m-0 text-xl leading-7 font-semibold">
        {t('media.heading')}
      </h1>

      <div className="grid grid-cols-[16rem_1fr] gap-6">
        <aside>
          {foldersError && <Notice tone="danger">{t('media.foldersLoadError')}</Notice>}
          <MediaFolderTree
            folders={folders}
            selectedFolderId={selectedFolderId}
            onSelect={setSelectedFolderId}
            onCreateChild={openCreateFolder}
            onRename={openRenameFolder}
            onDelete={(folder) => {
              setDeleteFolderTarget(folder)
              setDeleteFolderError(null)
            }}
            onDropAsset={(folderId, assetId) => void dropAssetOnFolder(folderId, assetId)}
            busy={folderBusy}
          />
        </aside>

        <div className="flex flex-col gap-6">
          {breadcrumb.length > 0 && (
            <nav aria-label={t('media.breadcrumbLabel')} className="text-sm text-muted-foreground">
              <button type="button" onClick={() => setSelectedFolderId(undefined)}>
                {t('media.allFolders')}
              </button>
              {breadcrumb.map((folder) => (
                <span key={folder.id}>
                  {' / '}
                  <button type="button" onClick={() => setSelectedFolderId(folder.id)}>
                    {folder.name}
                  </button>
                </span>
              ))}
            </nav>
          )}

          <Card>
            <CardHeader>
              <CardTitle>
                <h2>{t('media.uploadHeading')}</h2>
              </CardTitle>
            </CardHeader>
            <CardBody>
              <UploadForm
                token={token}
                defaultFolderId={selectedFolderId === undefined ? null : selectedFolderId}
                onUploaded={(asset) => setItems((current) => [asset, ...current])}
              />
            </CardBody>
          </Card>

          <search>
            <form
              className="flex flex-wrap items-end gap-2"
              onSubmit={(event) => {
                event.preventDefault()
                setSubmittedQuery(query)
              }}
            >
              <Field label={t('media.searchLabel')}>
                {(control) => (
                  <Input
                    {...control}
                    type="search"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                  />
                )}
              </Field>
              <Button type="submit" variant="secondary">
                {t('media.searchButton')}
              </Button>

              <Field label={t('media.kindFilterLabel')}>
                {(control) => (
                  <Select
                    {...control}
                    value={kindFilter}
                    onChange={(event) => setKindFilter(event.target.value as MediaKind | '')}
                  >
                    <option value="">{t('media.allKinds')}</option>
                    {MEDIA_KINDS.map((kind) => (
                      <option key={kind} value={kind}>
                        {t(`media.kind.${kind}`)}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>

              <Field label={t('media.tagFilterLabel')}>
                {(control) => (
                  <Input
                    {...control}
                    type="text"
                    value={tagFilter}
                    onChange={(event) => setTagFilter(event.target.value)}
                  />
                )}
              </Field>

              <Field label={t('media.sortLabel')}>
                {(control) => (
                  <Select
                    {...control}
                    value={sort.field}
                    onChange={(event) =>
                      setSort((current) => ({
                        ...current,
                        field: event.target.value as MediaSortField,
                      }))
                    }
                  >
                    <option value="createdAt">{t('media.sortCreatedAt')}</option>
                    <option value="filename">{t('media.sortFilename')}</option>
                    <option value="size">{t('media.sortSize')}</option>
                  </Select>
                )}
              </Field>

              <Field label={t('media.directionLabel')}>
                {(control) => (
                  <Select
                    {...control}
                    value={sort.direction}
                    onChange={(event) =>
                      setSort((current) => ({
                        ...current,
                        direction: event.target.value as 'asc' | 'desc',
                      }))
                    }
                  >
                    <option value="desc">{t('media.directionDesc')}</option>
                    <option value="asc">{t('media.directionAsc')}</option>
                  </Select>
                )}
              </Field>
            </form>
          </search>

          {selected.size > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm">{t('media.selectedCount', { count: selected.size })}</span>
              <Button
                variant="destructive"
                size="sm"
                disabled={bulkBusy}
                onClick={() => setConfirmBulkDelete(true)}
              >
                {t('media.bulkDelete', { count: selected.size })}
              </Button>
              <Select
                value={bulkMoveTarget}
                disabled={bulkBusy}
                onChange={(event) => setBulkMoveTarget(event.target.value)}
              >
                <option value="">{t('media.unclassified')}</option>
                {folders.map((folder) => (
                  <option key={folder.id} value={folder.id}>
                    {folder.name}
                  </option>
                ))}
              </Select>
              <Button
                variant="secondary"
                size="sm"
                disabled={bulkBusy}
                onClick={() => void runBulkMove()}
              >
                {t('media.bulkMove', { count: selected.size })}
              </Button>
            </div>
          )}

          {bulkReport !== null && (
            <Notice
              tone={bulkReport.failed.length === 0 ? 'success' : 'warning'}
              live="polite"
              onDismiss={() => setBulkReport(null)}
              dismissLabel={t('media.closeButton')}
            >
              <p>{t('media.bulkReportSummary', { count: bulkReport.succeeded })}</p>
              {bulkReport.failed.length > 0 && (
                <ul className="m-0 list-disc pl-5">
                  {bulkReport.failed.map((failure) => (
                    <li key={failure.id}>{failure.message}</li>
                  ))}
                </ul>
              )}
            </Notice>
          )}

          {error !== null && (
            <Notice tone="danger" live="assertive">
              <p>{error}</p>
            </Notice>
          )}
          {loading && <p>{t('common.loading')}</p>}

          {!loading && (
            <ul className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-3 p-0">
              {items.map((asset) => (
                <li
                  key={asset.id}
                  draggable
                  onDragStart={(event: DragEvent) => setMediaDragData(event, asset.id)}
                >
                  <div className="flex w-full flex-col items-center gap-1 rounded-lg border border-border bg-card p-2 text-card-foreground shadow-card">
                    <input
                      type="checkbox"
                      aria-label={t('media.selectAsset', { filename: asset.filename })}
                      checked={selected.has(asset.id)}
                      onChange={() => toggleSelected(asset.id)}
                    />
                    <button
                      type="button"
                      onClick={() => setSelectedId(asset.id)}
                      className="flex w-full cursor-pointer flex-col items-center gap-1 border-none bg-transparent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                    >
                      <MediaThumbnail
                        token={token}
                        id={asset.id}
                        alt={asset.alt}
                        previewable={asset.kind === 'image'}
                      />
                      <span className="w-full truncate text-xs">{asset.filename}</span>
                    </button>
                  </div>
                </li>
              ))}
              {items.length === 0 && (
                <li className="text-sm text-muted-foreground">{t('media.empty')}</li>
              )}
            </ul>
          )}

          {!loading && (
            <Pagination
              variant="cursor"
              hasMore={hasMore}
              loading={loadingMore}
              onLoadMore={() => void loadMore()}
              loadMoreLabel={t('media.loadMore')}
              loadingLabel={t('common.loading')}
            />
          )}
        </div>
      </div>

      <Modal
        open={selectedAsset !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedId(null)
        }}
        title={selectedAsset?.filename ?? ''}
        closeLabel={t('media.detailCloseLabel')}
      >
        {selectedAsset !== null && (
          <MediaDetail
            token={token}
            asset={selectedAsset}
            folders={folders}
            onChange={(updated) =>
              setItems((current) =>
                current.map((item) => (item.id === updated.id ? updated : item)),
              )
            }
            onDeleted={(id) => {
              setItems((current) => current.filter((item) => item.id !== id))
              setSelectedId(null)
            }}
          />
        )}
      </Modal>

      <Modal
        open={folderModal !== null}
        onOpenChange={(open) => {
          if (!open) setFolderModal(null)
        }}
        title={
          folderModal?.mode === 'rename' ? t('media.renameFolderTitle') : t('media.newFolderTitle')
        }
        closeLabel={t('media.closeButton')}
      >
        <form onSubmit={(event) => void submitFolderModal(event)} className="flex flex-col gap-3">
          <Field label={t('media.folderNameLabel')}>
            {(control) => (
              <Input
                {...control}
                type="text"
                required
                value={folderModalName}
                onChange={(event) => setFolderModalName(event.target.value)}
              />
            )}
          </Field>
          {folderModalError !== null && (
            <Notice tone="danger" live="assertive">
              <p>{folderModalError}</p>
            </Notice>
          )}
          <Button type="submit" disabled={folderBusy}>
            {t('media.saveButton')}
          </Button>
        </form>
      </Modal>

      <Modal
        open={deleteFolderTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteFolderTarget(null)
        }}
        title={t('media.deleteFolderConfirmTitle', { name: deleteFolderTarget?.name ?? '' })}
        closeLabel={t('media.closeButton')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleteFolderTarget(null)}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="destructive"
              disabled={folderBusy}
              onClick={() => void confirmDeleteFolder()}
            >
              {t('media.deleteFolder')}
            </Button>
          </>
        }
      >
        {deleteFolderError !== null && (
          <Notice tone="danger" live="assertive">
            <p>{deleteFolderError}</p>
          </Notice>
        )}
        <p>{t('media.deleteFolderConfirmBody')}</p>
      </Modal>

      <Modal
        open={confirmBulkDelete}
        onOpenChange={setConfirmBulkDelete}
        title={t('media.bulkDeleteConfirmTitle', { count: selected.size })}
        closeLabel={t('media.closeButton')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmBulkDelete(false)}>
              {t('common.cancel')}
            </Button>
            <Button variant="destructive" disabled={bulkBusy} onClick={() => void runBulkDelete()}>
              {t('media.bulkDeleteConfirmAction')}
            </Button>
          </>
        }
      >
        <p>{t('media.bulkDeleteConfirmBody')}</p>
      </Modal>
    </section>
  )
}
