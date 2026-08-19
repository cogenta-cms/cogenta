import type { JSX } from 'react'
import { useTranslation } from 'react-i18next'
import { fold } from '../builder/block-library.js'
import { cn } from '../ui/cn.js'
import {
  BulletListIcon,
  Heading2Icon,
  Heading3Icon,
  Heading4Icon,
  ImageIcon,
  NumberListIcon,
  QuoteIcon,
} from '../ui/icons.js'
import type { BlockKind } from './commands.js'

/**
 * The slash command menu (fiche 04 task 5): typing `/` at the start of an
 * empty line opens a filterable list of the insertions this vocabulary
 * actually has — no code block, no table, no horizontal rule, because
 * contract A's `richText` has no node for any of them yet (task 0's ADR,
 * still awaiting the human decision `docs/03-decisions.md` needs).
 */
export type SlashItemKind = 'block' | 'image'

export interface SlashMenuItem {
  readonly id: string
  readonly labelKey: string
  readonly kind: SlashItemKind
  readonly blockKind?: BlockKind
  readonly Icon: (props: { readonly className?: string }) => JSX.Element
}

export const SLASH_ITEMS: readonly SlashMenuItem[] = [
  { id: 'h2', labelKey: 'richText.blockH2', kind: 'block', blockKind: 'h2', Icon: Heading2Icon },
  { id: 'h3', labelKey: 'richText.blockH3', kind: 'block', blockKind: 'h3', Icon: Heading3Icon },
  { id: 'h4', labelKey: 'richText.blockH4', kind: 'block', blockKind: 'h4', Icon: Heading4Icon },
  {
    id: 'quote',
    labelKey: 'richText.blockQuote',
    kind: 'block',
    blockKind: 'blockquote',
    Icon: QuoteIcon,
  },
  {
    id: 'bullet',
    labelKey: 'richText.blockBullet',
    kind: 'block',
    blockKind: 'bullet',
    Icon: BulletListIcon,
  },
  {
    id: 'number',
    labelKey: 'richText.blockNumber',
    kind: 'block',
    blockKind: 'number',
    Icon: NumberListIcon,
  },
  { id: 'image', labelKey: 'richText.insertImageButton', kind: 'image', Icon: ImageIcon },
]

/** Filters `SLASH_ITEMS` by the query typed after `/` — label or the translated string, accent- and case-insensitive. */
export function filterSlashItems(
  query: string,
  translate: (key: string) => string,
  items: readonly SlashMenuItem[] = SLASH_ITEMS,
): readonly SlashMenuItem[] {
  const needle = fold(query.trim())
  if (needle === '') return items
  return items.filter((item) => fold(translate(item.labelKey)).includes(needle))
}

export function SlashMenu({
  items,
  activeIndex,
  onSelect,
  onHover,
  imagesAvailable,
}: {
  readonly items: readonly SlashMenuItem[]
  readonly activeIndex: number
  onSelect(item: SlashMenuItem): void
  onHover(index: number): void
  readonly imagesAvailable: boolean
}): JSX.Element {
  const { t } = useTranslation()

  return (
    <div
      className="rich-text-slash-menu m-0 flex max-h-64 w-56 flex-col gap-0.5 overflow-y-auto rounded-md border border-border bg-card p-1 shadow-overlay"
      role="listbox"
      aria-label={t('richText.slashMenuLabel')}
    >
      {items.length === 0 && (
        <div className="px-2 py-1.5 text-sm text-muted-foreground">
          {t('richText.slashMenuEmpty')}
        </div>
      )}
      {items.map((item, index) => {
        const disabled = item.kind === 'image' && !imagesAvailable
        return (
          <div key={item.id}>
            <button
              type="button"
              role="option"
              aria-selected={index === activeIndex}
              disabled={disabled}
              className={cn(
                'flex w-full cursor-pointer items-center gap-2 rounded-md border-0 bg-transparent px-2 py-1.5',
                'text-left text-sm text-foreground',
                index === activeIndex && 'bg-accent text-accent-foreground',
                disabled && 'cursor-default opacity-50',
              )}
              onMouseEnter={() => onHover(index)}
              onMouseDown={(event) => {
                event.preventDefault()
                if (!disabled) onSelect(item)
              }}
            >
              <item.Icon className="size-4 shrink-0" />
              <span>{t(item.labelKey)}</span>
            </button>
          </div>
        )
      })}
    </div>
  )
}
