import type { JSX } from 'react'
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
 */
export function BlockOutline({
  blocks,
  selectedKey,
  onSelect,
  onMove,
  onInsert,
  onRemove,
  disabled = false,
}: {
  readonly blocks: readonly ContentBlock[]
  readonly selectedKey: string | null
  onSelect(key: string): void
  onMove(key: string, toIndex: number): void
  onInsert(type: string, atIndex: number): void
  onRemove(key: string): void
  readonly disabled?: boolean
}): JSX.Element {
  const { t } = useTranslation()

  if (blocks.length === 0) {
    return <p className="text-sm text-muted-foreground">{t('builder.outlineEmpty')}</p>
  }

  return (
    <ol className="m-0 flex list-none flex-col gap-1 p-0" aria-label={t('builder.outlineHeading')}>
      {blocks.map((block, index) => {
        const definition = blockDefinition(block.type)
        const label = definition?.label ?? t('fields.blocksUnknownLabel', { type: block.type })
        const selected = block.key === selectedKey
        return (
          <li
            key={block.key}
            draggable={!disabled}
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
              onClick={() => onSelect(block.key)}
              aria-current={selected ? 'true' : undefined}
              className={cn(
                'flex-1 cursor-pointer border-0 bg-transparent p-0 text-left font-sans text-sm',
                'text-card-foreground focus-visible:outline-2 focus-visible:outline-offset-2',
                'focus-visible:outline-ring',
              )}
            >
              <span className="text-muted-foreground">{index + 1}.</span> {label}
            </button>
            <Button
              size="icon"
              variant="ghost"
              disabled={disabled || index === 0}
              aria-label={t('fields.blocksMoveUp', { position: index + 1 })}
              onClick={() => onMove(block.key, index - 1)}
            >
              ↑
            </Button>
            <Button
              size="icon"
              variant="ghost"
              disabled={disabled || index === blocks.length - 1}
              aria-label={t('fields.blocksMoveDown', { position: index + 1 })}
              onClick={() => onMove(block.key, index + 1)}
            >
              ↓
            </Button>
            <Button
              size="icon"
              variant="ghost"
              disabled={disabled}
              aria-label={t('fields.blocksRemove', { position: index + 1 })}
              onClick={() => onRemove(block.key)}
            >
              ✕
            </Button>
          </li>
        )
      })}
    </ol>
  )
}
