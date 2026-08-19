import { type JSX, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Term } from '../api/taxonomy-client.js'
import { ChevronDownIcon, ChevronRightIcon, DeleteIcon, EditIcon } from '../ui/icons.js'
import { Button } from '../ui/index.js'
import {
  canDedent,
  canIndent,
  canMoveDown,
  canMoveUp,
  childrenOf,
  MAX_TAXONOMY_DEPTH,
  planDedent,
  planDropOnto,
  planIndent,
  planMoveDown,
  planMoveUp,
  type ReorderPlan,
} from './term-tree-utils.js'

/**
 * A real nested tree for a taxonomy's terms (`08-taxonomies.md`, task 2).
 *
 * `<ul>`s inside `<ul>`s, not a flat, indented table: the API already
 * returns terms in tree order, so building the nesting is a matter of
 * filtering by `parent`, recursively, once per level.
 *
 * Native drag-and-drop moves and reorders a term — **always doubled by
 * named buttons** (monter, descendre, indenter, désindenter), the same rule
 * the L16 page builder held itself to: dragging is not something a keyboard,
 * a switch, or a screen reader can do, so nothing here is reachable only by
 * dragging.
 */

const DRAG_MIME = 'text/cogenta-term-id'
const COLLAPSE_STORAGE_PREFIX = 'cogenta-admin:taxonomy-tree-collapsed:'

function loadCollapsed(taxonomyName: string): ReadonlySet<string> {
  try {
    const raw = window.localStorage.getItem(`${COLLAPSE_STORAGE_PREFIX}${taxonomyName}`)
    if (raw === null) return new Set()
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed)
      ? new Set(parsed.filter((id): id is string => typeof id === 'string'))
      : new Set()
  } catch {
    return new Set()
  }
}

function saveCollapsed(taxonomyName: string, collapsed: ReadonlySet<string>): void {
  try {
    window.localStorage.setItem(
      `${COLLAPSE_STORAGE_PREFIX}${taxonomyName}`,
      JSON.stringify([...collapsed]),
    )
  } catch {
    // A private-browsing tab that refuses localStorage loses only the
    // memory of what was collapsed, never the tree itself.
  }
}

export interface TermTreeProps {
  readonly taxonomyName: string
  readonly terms: readonly Term[]
  readonly locale: string
  readonly mayUpdate: boolean
  readonly mayDelete: boolean
  onEdit(term: Term): void
  onDelete(term: Term): void
  onReorder(plan: ReorderPlan): void
  readonly disabled?: boolean
}

export function TermTree({
  taxonomyName,
  terms,
  locale,
  mayUpdate,
  mayDelete,
  onEdit,
  onDelete,
  onReorder,
  disabled = false,
}: TermTreeProps): JSX.Element {
  const { t } = useTranslation()
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => loadCollapsed(taxonomyName))
  const [draggedId, setDraggedId] = useState<string | null>(null)
  const [dragOverId, setDragOverId] = useState<string | null>(null)

  function toggle(id: string): void {
    const next = new Set(collapsed)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setCollapsed(next)
    saveCollapsed(taxonomyName, next)
  }

  const labelOf = (term: Term): string =>
    term.labels[locale] ?? Object.values(term.labels)[0] ?? term.slug

  function attempt(plan: ReorderPlan | null): void {
    if (plan === null) return
    onReorder(plan)
  }

  function renderLevel(parentId: string | null): JSX.Element | null {
    const level = childrenOf(terms, parentId)
    if (level.length === 0) return null

    return (
      <ul className="m-0 flex list-none flex-col gap-1 p-0">
        {level.map((term) => {
          const hasChildren = childrenOf(terms, term.id).length > 0
          const isCollapsed = collapsed.has(term.id)
          const isDragTarget = dragOverId === term.id
          const dropRefused =
            isDragTarget && draggedId !== null && planDropOnto(terms, draggedId, term.id) === null

          return (
            <li key={term.id} className="flex flex-col gap-1">
              {/* biome-ignore lint/a11y/useSemanticElements: a <fieldset> is for
                  form controls, not a draggable tree row — `role="group"` is
                  what actually groups this term's label and its action buttons. */}
              <div
                role="group"
                aria-label={labelOf(term)}
                draggable={mayUpdate && !disabled}
                onDragStart={(event) => {
                  setDraggedId(term.id)
                  event.dataTransfer.setData(DRAG_MIME, term.id)
                  event.dataTransfer.effectAllowed = 'move'
                }}
                onDragEnd={() => {
                  setDraggedId(null)
                  setDragOverId(null)
                }}
                onDragOver={(event) => {
                  if (!mayUpdate || disabled || draggedId === null) return
                  event.preventDefault()
                  event.dataTransfer.dropEffect =
                    planDropOnto(terms, draggedId, term.id) === null ? 'none' : 'move'
                  setDragOverId(term.id)
                }}
                onDragLeave={() =>
                  setDragOverId((current) => (current === term.id ? null : current))
                }
                onDrop={(event) => {
                  event.preventDefault()
                  setDragOverId(null)
                  setDraggedId(null)
                  if (!mayUpdate || disabled || draggedId === null || draggedId === term.id) return
                  attempt(planDropOnto(terms, draggedId, term.id))
                }}
                className={
                  'flex flex-wrap items-center gap-1.5 rounded-md border px-2 py-1.5 ' +
                  (isDragTarget
                    ? dropRefused
                      ? 'border-destructive bg-destructive/10'
                      : 'border-primary bg-accent'
                    : 'border-transparent hover:border-input')
                }
                style={{ marginLeft: `${term.depth * 1.5}rem` }}
              >
                <Button
                  size="icon"
                  variant="ghost"
                  disabled={!hasChildren}
                  aria-label={
                    hasChildren
                      ? isCollapsed
                        ? t('taxonomies.expand', { term: labelOf(term) })
                        : t('taxonomies.collapse', { term: labelOf(term) })
                      : t('taxonomies.noChildren')
                  }
                  onClick={() => toggle(term.id)}
                  className={hasChildren ? undefined : 'invisible'}
                >
                  {isCollapsed ? <ChevronRightIcon /> : <ChevronDownIcon />}
                </Button>

                <span className="flex-1 text-sm">
                  <span className="font-medium" title={term.slug}>
                    {labelOf(term)}
                  </span>
                  {term.entryCount !== undefined && (
                    <span className="text-muted-foreground">
                      {' — '}
                      {t('taxonomies.entryCount', {
                        own: term.entryCount.own,
                        withDescendants: term.entryCount.withDescendants,
                      })}
                    </span>
                  )}
                </span>

                {mayUpdate && (
                  <>
                    <Button
                      size="icon"
                      variant="ghost"
                      disabled={disabled || !canMoveUp(terms, term)}
                      aria-label={t('taxonomies.moveUp', { term: labelOf(term) })}
                      onClick={() => attempt(planMoveUp(terms, term))}
                    >
                      ↑
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      disabled={disabled || !canMoveDown(terms, term)}
                      aria-label={t('taxonomies.moveDown', { term: labelOf(term) })}
                      onClick={() => attempt(planMoveDown(terms, term))}
                    >
                      ↓
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      disabled={disabled || !canIndent(terms, term)}
                      aria-label={t('taxonomies.indent', { term: labelOf(term) })}
                      onClick={() => attempt(planIndent(terms, term))}
                    >
                      →
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      disabled={disabled || !canDedent(terms, term)}
                      aria-label={t('taxonomies.dedent', { term: labelOf(term) })}
                      onClick={() => attempt(planDedent(terms, term))}
                    >
                      ←
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      disabled={disabled}
                      aria-label={t('taxonomies.edit', { term: labelOf(term) })}
                      onClick={() => onEdit(term)}
                    >
                      <EditIcon />
                    </Button>
                  </>
                )}
                {mayDelete && (
                  <Button
                    size="icon"
                    variant="ghost"
                    disabled={disabled}
                    aria-label={t('taxonomies.delete', { term: labelOf(term) })}
                    onClick={() => onDelete(term)}
                  >
                    <DeleteIcon />
                  </Button>
                )}
              </div>

              {hasChildren && !isCollapsed && renderLevel(term.id)}
            </li>
          )
        })}
      </ul>
    )
  }

  return (
    <div>
      <p className="mb-2 text-xs text-muted-foreground">
        {t('taxonomies.depthLimit', { max: MAX_TAXONOMY_DEPTH })}
      </p>
      {renderLevel(null)}
    </div>
  )
}
