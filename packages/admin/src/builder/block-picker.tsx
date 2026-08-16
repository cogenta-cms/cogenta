import { type JSX, useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '../ui/cn.js'
import { Button, Input, Label } from '../ui/index.js'
import type { BlockCategory } from './block-library.js'
import { BLOCK_CATEGORIES, searchLibrary } from './block-library.js'
import { BLOCK_TYPE_MIME } from './preview-dom.js'

/**
 * The insertion panel (L16 task 4): search, categories, and one draggable
 * entry per block of contract B's vocabulary.
 *
 * Every entry is *both* draggable and a button. Dragging is the affordance the
 * lot asks for; the button is what makes the panel work with a keyboard, a
 * switch or a screen reader, none of which can drag. It appends to the end of
 * the page, which is where an editor adding a block usually wants it and is
 * always somewhere they can then move it from.
 */
export function BlockPicker({
  onAdd,
  disabled = false,
}: {
  onAdd(type: string): void
  readonly disabled?: boolean
}): JSX.Element {
  const { t } = useTranslation()
  const searchId = useId()
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<BlockCategory | null>(null)
  const results = searchLibrary(query, category)

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={searchId}>{t('builder.searchLabel')}</Label>
        <Input
          id={searchId}
          type="search"
          value={query}
          placeholder={t('builder.searchPlaceholder')}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>

      <fieldset
        className="m-0 flex flex-wrap gap-1 border-0 p-0"
        aria-label={t('builder.categoriesLabel')}
      >
        <Button
          size="sm"
          variant={category === null ? 'primary' : 'ghost'}
          aria-pressed={category === null}
          onClick={() => setCategory(null)}
        >
          {t('builder.categoryAll')}
        </Button>
        {BLOCK_CATEGORIES.map((name) => (
          <Button
            key={name}
            size="sm"
            variant={category === name ? 'primary' : 'ghost'}
            aria-pressed={category === name}
            onClick={() => setCategory(name)}
          >
            {t(`builder.category.${name}`)}
          </Button>
        ))}
      </fieldset>

      {results.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('builder.searchEmpty', { query })}</p>
      ) : (
        <ul
          className="m-0 flex list-none flex-col gap-1 p-0"
          aria-label={t('builder.pickerHeading')}
        >
          {results.map((entry) => (
            <li key={entry.definition.name}>
              <button
                type="button"
                disabled={disabled}
                draggable={!disabled}
                onDragStart={(event) => {
                  event.dataTransfer.setData(BLOCK_TYPE_MIME, entry.definition.name)
                  event.dataTransfer.effectAllowed = 'copy'
                }}
                onClick={() => onAdd(entry.definition.name)}
                className={cn(
                  'flex w-full cursor-grab items-center justify-between gap-2 rounded-md border',
                  'border-input bg-card px-3 py-2 text-left font-sans text-sm text-card-foreground',
                  'transition-colors hover:bg-accent hover:text-accent-foreground',
                  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
                  'disabled:cursor-default disabled:opacity-60',
                )}
              >
                <span>{entry.definition.label}</span>
                <span className="font-mono text-xs text-muted-foreground">
                  {entry.definition.name}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
