import { type DragEvent, type JSX, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import type { MediaFolder } from '../api/media-client.js'
import { Button } from '../ui/index.js'

/**
 * The media library's folder sidebar (fiche 46 task 5).
 *
 * Renders the whole tree the caller already fetched once (`GET
 * /api/media/folders` with no `parentId`, small enough to hold in memory —
 * see `media-client.ts`'s own comment on that route). Grouping and ordering
 * happen here, not on the server: the same flat list drives both this tree
 * and `media.tsx`'s own folder `<select>`.
 *
 * Drag-and-drop is real (native HTML5 DnD, no new dependency — the same
 * choice L16's page builder made), but it is never the *only* way to move an
 * asset: every row here also carries a "move" affordance a keyboard can
 * reach, in `media.tsx`'s detail panel and bulk-action bar. That mirrors
 * L16's own rule ("rien ne s'obtient uniquement en glissant").
 */

const DND_MEDIA_ID = 'application/x-cogenta-media-id'

export interface MediaFolderTreeProps {
  readonly folders: readonly MediaFolder[]
  /** `undefined` selects "all media"; `null` selects "unclassified"; a string selects that folder. */
  readonly selectedFolderId: string | null | undefined
  onSelect(folderId: string | null | undefined): void
  onCreateChild(parentId: string | null): void
  onRename(folder: MediaFolder): void
  onDelete(folder: MediaFolder): void
  /** An asset was dropped on this folder — `folderId` is `null` for the "unclassified" drop target. */
  onDropAsset(folderId: string | null, assetId: string): void
  readonly busy?: boolean
}

function groupByParent(
  folders: readonly MediaFolder[],
): ReadonlyMap<string | null, readonly MediaFolder[]> {
  const byParent = new Map<string | null, MediaFolder[]>()
  for (const folder of folders) {
    const list = byParent.get(folder.parentId) ?? []
    list.push(folder)
    byParent.set(folder.parentId, list)
  }
  for (const list of byParent.values()) list.sort((a, b) => a.position - b.position)
  return byParent
}

/** How a `<button draggable>` announces which media asset it carries — read back by `MediaFolderTree`'s own drop handler. */
export function setMediaDragData(event: DragEvent, assetId: string): void {
  event.dataTransfer.setData(DND_MEDIA_ID, assetId)
  event.dataTransfer.effectAllowed = 'move'
}

export function MediaFolderTree({
  folders,
  selectedFolderId,
  onSelect,
  onCreateChild,
  onRename,
  onDelete,
  onDropAsset,
  busy = false,
}: MediaFolderTreeProps): JSX.Element {
  const { t } = useTranslation()
  const byParent = useMemo(() => groupByParent(folders), [folders])
  const roots = byParent.get(null) ?? []

  function dropProps(folderId: string | null): {
    onDragOver(event: DragEvent): void
    onDrop(event: DragEvent): void
  } {
    return {
      onDragOver: (event) => {
        if (event.dataTransfer.types.includes(DND_MEDIA_ID)) event.preventDefault()
      },
      onDrop: (event) => {
        const assetId = event.dataTransfer.getData(DND_MEDIA_ID)
        if (assetId.length > 0) onDropAsset(folderId, assetId)
      },
    }
  }

  return (
    <nav aria-label={t('media.foldersHeading')} className="flex flex-col gap-2">
      <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
        <li>
          <button
            type="button"
            aria-current={selectedFolderId === undefined ? 'true' : undefined}
            onClick={() => onSelect(undefined)}
            className={`w-full cursor-pointer rounded-md border-none bg-transparent px-2 py-1 text-left text-sm ${
              selectedFolderId === undefined
                ? 'bg-accent font-medium text-accent-foreground'
                : 'hover:bg-accent/50'
            }`}
          >
            {t('media.allFolders')}
          </button>
        </li>
        <li {...dropProps(null)}>
          <button
            type="button"
            aria-current={selectedFolderId === null ? 'true' : undefined}
            onClick={() => onSelect(null)}
            className={`w-full cursor-pointer rounded-md border-none bg-transparent px-2 py-1 text-left text-sm ${
              selectedFolderId === null
                ? 'bg-accent font-medium text-accent-foreground'
                : 'hover:bg-accent/50'
            }`}
          >
            {t('media.unclassified')}
          </button>
        </li>
      </ul>

      <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
        {roots.map((folder) => (
          <FolderNode
            key={folder.id}
            folder={folder}
            depth={0}
            byParent={byParent}
            selectedFolderId={selectedFolderId}
            onSelect={onSelect}
            onCreateChild={onCreateChild}
            onRename={onRename}
            onDelete={onDelete}
            dropProps={dropProps}
            busy={busy}
          />
        ))}
      </ul>

      <Button
        type="button"
        variant="secondary"
        size="sm"
        disabled={busy}
        onClick={() => onCreateChild(null)}
      >
        {t('media.newRootFolder')}
      </Button>
    </nav>
  )
}

function FolderNode({
  folder,
  depth,
  byParent,
  selectedFolderId,
  onSelect,
  onCreateChild,
  onRename,
  onDelete,
  dropProps,
  busy,
}: {
  readonly folder: MediaFolder
  readonly depth: number
  readonly byParent: ReadonlyMap<string | null, readonly MediaFolder[]>
  readonly selectedFolderId: string | null | undefined
  onSelect(folderId: string | null | undefined): void
  onCreateChild(parentId: string | null): void
  onRename(folder: MediaFolder): void
  onDelete(folder: MediaFolder): void
  dropProps(folderId: string | null): {
    onDragOver(event: DragEvent): void
    onDrop(event: DragEvent): void
  }
  readonly busy: boolean
}): JSX.Element {
  const { t } = useTranslation()
  const children = byParent.get(folder.id) ?? []
  const selected = selectedFolderId === folder.id

  return (
    <li>
      <div
        className={`flex items-center gap-1 rounded-md ${selected ? 'bg-accent' : 'hover:bg-accent/50'}`}
        style={{ paddingLeft: `${depth * 1}rem` }}
        {...dropProps(folder.id)}
      >
        <button
          type="button"
          aria-current={selected ? 'true' : undefined}
          onClick={() => onSelect(folder.id)}
          className={`min-w-0 flex-1 cursor-pointer truncate border-none bg-transparent px-2 py-1 text-left text-sm ${
            selected ? 'font-medium text-accent-foreground' : ''
          }`}
        >
          {folder.name}
        </button>
        <div className="flex shrink-0 gap-0.5 pr-1">
          <button
            type="button"
            disabled={busy}
            title={t('media.newSubfolder')}
            aria-label={t('media.newSubfolderFor', { name: folder.name })}
            onClick={() => onCreateChild(folder.id)}
            className="cursor-pointer rounded border-none bg-transparent px-1 text-xs text-muted-foreground hover:text-foreground"
          >
            +
          </button>
          <button
            type="button"
            disabled={busy}
            title={t('media.renameFolder')}
            aria-label={t('media.renameFolderFor', { name: folder.name })}
            onClick={() => onRename(folder)}
            className="cursor-pointer rounded border-none bg-transparent px-1 text-xs text-muted-foreground hover:text-foreground"
          >
            ✎
          </button>
          <button
            type="button"
            disabled={busy}
            title={t('media.deleteFolder')}
            aria-label={t('media.deleteFolderFor', { name: folder.name })}
            onClick={() => onDelete(folder)}
            className="cursor-pointer rounded border-none bg-transparent px-1 text-xs text-muted-foreground hover:text-destructive"
          >
            ×
          </button>
        </div>
      </div>
      {children.length > 0 && (
        <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
          {children.map((child) => (
            <FolderNode
              key={child.id}
              folder={child}
              depth={depth + 1}
              byParent={byParent}
              selectedFolderId={selectedFolderId}
              onSelect={onSelect}
              onCreateChild={onCreateChild}
              onRename={onRename}
              onDelete={onDelete}
              dropProps={dropProps}
              busy={busy}
            />
          ))}
        </ul>
      )}
    </li>
  )
}
