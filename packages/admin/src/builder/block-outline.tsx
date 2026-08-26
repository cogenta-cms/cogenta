import type { JSX, MouseEvent } from 'react'
import { useTranslation } from 'react-i18next'
import type { ContentBlock } from '../api/content-client.js'
import { blockDefinition } from '../blocks/vocabulary.js'
import { cn } from '../ui/cn.js'
import { Button } from '../ui/index.js'
import { BLOCK_KEY_MIME, BLOCK_TYPE_MIME } from './preview-dom.js'

/**
 * The page's blocks as a list, beside the preview.
 *
 * This is what earns the drag-and-drop the right to replace the move-up /
 * move-down buttons `BlocksField` had. Those buttons were keyboard-operable
 * for free; dragging is not operable by keyboard, switch or screen reader at
 * all, so the same two moves live here, on every block, next to a name that
 * says which block is which. Nothing in this builder can only be done by
 * dragging.
 *
 * It doubles as the navigator for a long page, where the block an editor wants
 * is below the fold of the preview.
 *
 * Two additions from fiche 43 sub-chantier E (fiche 05 task 5), both scoped
 * to this list on purpose — a `Shift`+click in the *preview* would need
 * `preview-dom.ts` to grow a second selection model it does not need for
 * anything else, and the fiche's own wording already scopes multi-select to
 * "la liste latérale":
 *
 * - **Multi-select** — a plain click replaces the selection with one block
 *   (still what drives the detail panel); `Shift`+click toggles a block into
 *   or out of a *group* selection, which is what the toolbar above the list
 *   and "save selection as pattern" (`PatternPicker`) both read.
 * - **Lock** — an admin-only flag, per block, kept in `PageBuilder`'s own
 *   session state rather than contract B or a server round trip: it protects
 *   a composed header/footer from an accidental drag or delete for the rest
 *   of *this* editing session, not a persisted property of the block itself.
 *   A locked block's own move/remove buttons are disabled, and dragging it
 *   is refused the same way at `PageBuilder.handleMove`/`handleRemove` —
 *   whichever door (a click here, a drag in the preview) tried to move it.
 */
export function BlockOutline({
  blocks,
  selectedKeys,
  lockedKeys,
  onSelect,
  onMove,
  onInsert,
  onRemove,
  onToggleLock,
  onMoveSelectionUp,
  onMoveSelectionDown,
  onRemoveSelection,
  disabled = false,
}: {
  readonly blocks: readonly ContentBlock[]
  readonly selectedKeys: ReadonlySet<string>
  readonly lockedKeys: ReadonlySet<string>
  /** `additive` is `event.shiftKey` — toggles membership instead of replacing the selection. */
  onSelect(key: string, additive: boolean): void
  onMove(key: string, toIndex: number): void
  onInsert(type: string, atIndex: number): void
  onRemove(key: string): void
  onToggleLock(key: string): void
  onMoveSelectionUp(): void
  onMoveSelectionDown(): void
  onRemoveSelection(): void
  readonly disabled?: boolean
}): JSX.Element {
  const { t } = useTranslation()

  if (blocks.length === 0) {
    return <p className="text-sm text-muted-foreground">{t('builder.outlineEmpty')}</p>
  }

  return (
    <div className="flex flex-col gap-2">
      {selectedKeys.size > 1 && (
        <fieldset
          aria-label={t('builder.selectionLabel')}
          className="m-0 flex flex-wrap items-center gap-1.5 rounded-md border border-dashed border-input px-2 py-1.5"
        >
          <span className="text-xs text-muted-foreground">
            {t('builder.selectionCount', { count: selectedKeys.size })}
          </span>
          <Button size="sm" variant="ghost" disabled={disabled} onClick={onMoveSelectionUp}>
            {t('builder.selectionMoveUp')}
          </Button>
          <Button size="sm" variant="ghost" disabled={disabled} onClick={onMoveSelectionDown}>
            {t('builder.selectionMoveDown')}
          </Button>
          <Button size="sm" variant="destructive" disabled={disabled} onClick={onRemoveSelection}>
            {t('builder.selectionRemove')}
          </Button>
        </fieldset>
      )}

      <ol
        className="m-0 flex list-none flex-col gap-1 p-0"
        aria-label={t('builder.outlineHeading')}
      >
        {blocks.map((block, index) => {
          const definition = blockDefinition(block.type)
          const label = definition?.label ?? t('fields.blocksUnknownLabel', { type: block.type })
          const selected = selectedKeys.has(block.key)
          const locked = lockedKeys.has(block.key)
          return (
            <li
              key={block.key}
              draggable={!disabled && !locked}
              onDragStart={(event) => {
                event.dataTransfer.setData(BLOCK_KEY_MIME, block.key)
                event.dataTransfer.effectAllowed = 'move'
              }}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault()
                const moved = event.dataTransfer.getData(BLOCK_KEY_MIME)
                if (moved !== '') {
                  onMove(moved, index)
                  return
                }
                const added = event.dataTransfer.getData(BLOCK_TYPE_MIME)
                if (added !== '') onInsert(added, index)
              }}
              className={cn(
                'flex items-center gap-1 rounded-md border px-2 py-1.5 transition-colors',
                selected ? 'border-primary bg-accent' : 'border-input bg-card',
              )}
            >
              <button
                type="button"
                onClick={(event: MouseEvent<HTMLButtonElement>) =>
                  onSelect(block.key, event.shiftKey)
                }
                aria-current={selected ? 'true' : undefined}
                className={cn(
                  'flex-1 cursor-pointer border-0 bg-transparent p-0 text-left font-sans text-sm',
                  'text-card-foreground focus-visible:outline-2 focus-visible:outline-offset-2',
                  'focus-visible:outline-ring',
                )}
              >
                <span className="text-muted-foreground">{index + 1}.</span> {label}
                {locked && (
                  <span className="ml-1 text-xs text-muted-foreground">
                    {t('builder.lockedBadge')}
                  </span>
                )}
              </button>
              <Button
                size="icon"
                variant="ghost"
                disabled={disabled}
                aria-pressed={locked}
                aria-label={
                  locked
                    ? t('builder.unlockBlock', { position: index + 1 })
                    : t('builder.lockBlock', { position: index + 1 })
                }
                onClick={() => onToggleLock(block.key)}
              >
                {locked ? '🔒' : '🔓'}
              </Button>
              <Button
                size="icon"
                variant="ghost"
                disabled={disabled || locked || index === 0}
                aria-label={t('fields.blocksMoveUp', { position: index + 1 })}
                onClick={() => onMove(block.key, index - 1)}
              >
                ↑
              </Button>
              <Button
                size="icon"
                variant="ghost"
                disabled={disabled || locked || index === blocks.length - 1}
                aria-label={t('fields.blocksMoveDown', { position: index + 1 })}
                onClick={() => onMove(block.key, index + 1)}
              >
                ↓
              </Button>
              <Button
                size="icon"
                variant="ghost"
                disabled={disabled || locked}
                aria-label={t('fields.blocksRemove', { position: index + 1 })}
                onClick={() => onRemove(block.key)}
              >
                ✕
              </Button>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
