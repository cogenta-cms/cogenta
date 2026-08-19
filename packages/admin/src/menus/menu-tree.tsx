import { type DragEvent, type JSX, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { MenuItem } from '../api/menu-client.js'
import { Button, cn } from '../ui/index.js'
import {
  dropBeforeOrAfter,
  indent,
  moveDown,
  moveUp,
  outdent,
  siblingsOf,
} from './menu-tree-ops.js'

/** The `dataTransfer` MIME this tree's own drag-and-drop uses — distinct from the page builder's, so a stray drop between the two screens is inert rather than misread. */
const MENU_ITEM_MIME = 'application/x-cogenta-menu-item'

function targetOf(item: MenuItem, t: (key: string) => string): string {
  if (item.kind === 'url') return item.url ?? ''
  if (item.kind === 'home') return t('menus.kindHome')
  if (item.kind === 'submenu-placeholder') return t('menus.kindSubmenu')
  // entry / taxonomy
  return item.resolvedLabel ?? item.resolvedRoute ?? item.targetEntryId ?? item.targetTermId ?? ''
}

const HEALTH_TONE: Readonly<Record<string, string>> = {
  draft: 'bg-warning-surface text-warning',
  scheduled: 'bg-info-surface text-info',
  archived: 'bg-muted text-muted-foreground',
  trashed: 'bg-destructive-surface text-destructive',
}

function HealthBadge({ item }: { readonly item: MenuItem }): JSX.Element | null {
  const { t } = useTranslation()
  // No badge for a healthy, resolved target — the pastille exists to flag a
  // problem, not to confirm the absence of one on every row.
  if (item.kind !== 'entry') return null
  if (item.resolvedHealth === undefined || item.resolvedHealth === 'published') {
    if (item.targetEntryId !== null && item.resolvedLabel === undefined) {
      // Resolved to nothing at all — deleted outright, or unreadable even to
      // this actor. Flagged the same way, since the visitor-facing symptom
      // (a dead link) is identical either way.
      return (
        <span className="shrink-0 rounded-full bg-destructive-surface px-2 py-0.5 text-[0.65rem] font-semibold text-destructive uppercase">
          {t('menus.healthUnresolved')}
        </span>
      )
    }
    return null
  }
  return (
    <span
      className={cn(
        'shrink-0 rounded-full px-2 py-0.5 text-[0.65rem] font-semibold uppercase',
        HEALTH_TONE[item.resolvedHealth] ?? 'bg-muted text-muted-foreground',
      )}
    >
      {t(`menus.status.${item.resolvedHealth}`, { defaultValue: item.resolvedHealth })}
    </span>
  )
}

interface RowProps {
  readonly item: MenuItem
  readonly items: readonly MenuItem[]
  readonly disabled: boolean
  readonly dragging: string | null
  setDragging(id: string | null): void
  onReorder(next: readonly MenuItem[]): void
  onEdit(item: MenuItem): void
  onDelete(item: MenuItem): void
}

function ItemRow({
  item,
  items,
  disabled,
  dragging,
  setDragging,
  onReorder,
  onEdit,
  onDelete,
}: RowProps): JSX.Element {
  const { t } = useTranslation()
  const siblings = siblingsOf(items, item.parent)
  const index = siblings.findIndex((candidate) => candidate.id === item.id)
  const children = items.filter((candidate) => candidate.parent === item.id)

  function drop(event: DragEvent<HTMLLIElement>): void {
    event.preventDefault()
    const draggedId = event.dataTransfer.getData(MENU_ITEM_MIME)
    setDragging(null)
    if (draggedId === '' || draggedId === item.id) return
    const after =
      event.clientY >
      event.currentTarget.getBoundingClientRect().top +
        event.currentTarget.getBoundingClientRect().height / 2
    const next = dropBeforeOrAfter(items, draggedId, item.id, after)
    if (next !== items) onReorder(next)
  }

  return (
    <li
      draggable={!disabled}
      onDragStart={(event) => {
        event.dataTransfer.setData(MENU_ITEM_MIME, item.id)
        event.dataTransfer.effectAllowed = 'move'
        setDragging(item.id)
      }}
      onDragEnd={() => setDragging(null)}
      onDragOver={(event) => event.preventDefault()}
      onDrop={drop}
      className={cn(
        'flex flex-wrap items-center gap-2 rounded-md border px-2 py-1.5',
        'border-input bg-card',
        dragging === item.id && 'opacity-50',
      )}
      style={{ marginLeft: `${item.depth * 1.5}rem` }}
    >
      <span className="min-w-0 flex-1 truncate text-sm font-medium">{item.label}</span>
      <HealthBadge item={item} />
      <span className="min-w-0 max-w-[14rem] truncate text-xs text-muted-foreground">
        {targetOf(item, t)}
      </span>
      {!disabled && (
        <div className="flex shrink-0 gap-1">
          <Button
            size="icon"
            variant="ghost"
            disabled={index <= 0}
            aria-label={t('menus.moveUp')}
            onClick={() => {
              const next = moveUp(items, item.id)
              if (next !== items) onReorder(next)
            }}
          >
            ↑
          </Button>
          <Button
            size="icon"
            variant="ghost"
            disabled={index === -1 || index >= siblings.length - 1}
            aria-label={t('menus.moveDown')}
            onClick={() => {
              const next = moveDown(items, item.id)
              if (next !== items) onReorder(next)
            }}
          >
            ↓
          </Button>
          <Button
            size="icon"
            variant="ghost"
            disabled={index <= 0}
            aria-label={t('menus.indent')}
            onClick={() => {
              const next = indent(items, item.id)
              if (next !== items) onReorder(next)
            }}
          >
            →
          </Button>
          <Button
            size="icon"
            variant="ghost"
            disabled={item.parent === null}
            aria-label={t('menus.outdent')}
            onClick={() => {
              const next = outdent(items, item.id)
              if (next !== items) onReorder(next)
            }}
          >
            ←
          </Button>
          <Button size="sm" variant="secondary" onClick={() => onEdit(item)}>
            {t('menus.editItem')}
          </Button>
          <Button size="sm" variant="destructive" onClick={() => onDelete(item)}>
            {t('menus.delete')}
          </Button>
        </div>
      )}
      {children.length > 0 && (
        <ul className="m-0 mt-1 flex list-none flex-col gap-1 p-0">
          {children.map((child) => (
            <ItemRow
              key={child.id}
              item={child}
              items={items}
              disabled={disabled}
              dragging={dragging}
              setDragging={setDragging}
              onReorder={onReorder}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          ))}
        </ul>
      )}
    </li>
  )
}

/**
 * The menu as a real, nested `<ul>` (fiche 09, task 2) — a screen reader
 * hears the hierarchy directly from the markup, not just from indentation.
 *
 * Every move — up, down, indent, outdent, or a drag-and-drop — computes the
 * *entire* resulting tree with the pure functions in `menu-tree-ops.ts` and
 * hands it to `onReorder` in one piece. The caller (`routes/menus.tsx`)
 * turns that into exactly one `PATCH /api/menus/{id}/items` call — never a
 * sequence of single-item requests — so a network failure mid-drag can never
 * leave the stored tree half-rewritten (the property task 2's whole
 * acceptance criterion rests on).
 *
 * Drag-and-drop reorders a row before/after the one it is dropped on, based
 * on which half of the target row the pointer is over; it never nests a row
 * by dropping *onto* another (the indent/outdent buttons cover that,
 * unambiguously and — this is the part that matters — with a real keyboard
 * path). Nothing on this screen is reachable only by dragging.
 */
export function MenuTree({
  items,
  disabled = false,
  onReorder,
  onEdit,
  onDelete,
}: {
  readonly items: readonly MenuItem[]
  readonly disabled?: boolean
  onReorder(next: readonly MenuItem[]): void
  onEdit(item: MenuItem): void
  onDelete(item: MenuItem): void
}): JSX.Element {
  const { t } = useTranslation()
  const [dragging, setDragging] = useState<string | null>(null)
  const roots = items.filter((item) => item.parent === null)

  return (
    <ul className="m-0 flex list-none flex-col gap-1 p-0" aria-label={t('menus.treeLabel')}>
      {roots.map((root) => (
        <ItemRow
          key={root.id}
          item={root}
          items={items}
          disabled={disabled}
          dragging={dragging}
          setDragging={setDragging}
          onReorder={onReorder}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      ))}
    </ul>
  )
}
