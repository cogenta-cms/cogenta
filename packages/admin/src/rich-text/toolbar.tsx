import { type JSX, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { HistoryEditor } from 'slate-history'
import { useSlate } from 'slate-react'
import { cn } from '../ui/cn.js'
import {
  BoldIcon,
  BulletListIcon,
  Heading2Icon,
  Heading3Icon,
  Heading4Icon,
  ImageIcon,
  InlineCodeIcon,
  ItalicIcon,
  LinkIcon,
  NumberListIcon,
  ParagraphIcon,
  QuoteIcon,
  RedoIcon,
  UndoIcon,
} from '../ui/icons.js'
import {
  activeBlockKind,
  type BlockKind,
  insertMedia,
  isMarkActive,
  toggleBlock,
  toggleMark,
} from './commands.js'
import { ImageInsertModal } from './image-picker.js'
import { LinkPopover } from './link-popover.js'
import type { RichTextDecorator } from './portable-text.js'
import type { RichTextSession } from './session.js'

const MARK_BUTTONS: readonly {
  readonly mark: RichTextDecorator
  readonly labelKey: string
  readonly Icon: (props: { readonly className?: string }) => JSX.Element
}[] = [
  { mark: 'strong', labelKey: 'richText.markStrong', Icon: BoldIcon },
  { mark: 'em', labelKey: 'richText.markEm', Icon: ItalicIcon },
  { mark: 'code', labelKey: 'richText.markCode', Icon: InlineCodeIcon },
]

const BLOCK_BUTTONS: readonly {
  readonly kind: BlockKind
  readonly labelKey: string
  readonly Icon: (props: { readonly className?: string }) => JSX.Element
}[] = [
  { kind: 'paragraph', labelKey: 'richText.blockParagraph', Icon: ParagraphIcon },
  { kind: 'h2', labelKey: 'richText.blockH2', Icon: Heading2Icon },
  { kind: 'h3', labelKey: 'richText.blockH3', Icon: Heading3Icon },
  { kind: 'h4', labelKey: 'richText.blockH4', Icon: Heading4Icon },
  { kind: 'blockquote', labelKey: 'richText.blockQuote', Icon: QuoteIcon },
  { kind: 'bullet', labelKey: 'richText.blockBullet', Icon: BulletListIcon },
  { kind: 'number', labelKey: 'richText.blockNumber', Icon: NumberListIcon },
]

function ToolbarButton({
  label,
  pressed,
  disabled,
  onClick,
  Icon,
}: {
  readonly label: string
  readonly pressed?: boolean
  readonly disabled: boolean
  onClick(): void
  readonly Icon: (props: { readonly className?: string }) => JSX.Element
}): JSX.Element {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      aria-pressed={pressed}
      className={cn(
        'inline-flex size-8 shrink-0 cursor-pointer appearance-none items-center justify-center',
        'rounded-md border border-transparent bg-transparent text-foreground',
        'hover:bg-accent hover:text-accent-foreground',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
        'disabled:pointer-events-none disabled:opacity-60',
        pressed === true && 'bg-accent text-accent-foreground',
      )}
      onMouseDown={(event) => {
        event.preventDefault()
        onClick()
      }}
    >
      <Icon className="size-4" />
    </button>
  )
}

function ToolbarSeparator(): JSX.Element {
  return <hr aria-orientation="vertical" className="mx-1 h-6 w-px border-0 bg-border" />
}

export interface RichTextToolbarProps {
  readonly disabled: boolean
  /** Enables the internal-link tab and the image picker — absent means formatting only. */
  readonly session?: RichTextSession | undefined
}

/**
 * Reorganised into groups with separators and icon buttons rather than a
 * row of word-labelled buttons (fiche 04 task 1) — every button keeps its
 * translated string as `aria-label`, so the accessible name a screen reader
 * announces, and the name `getByRole('button', { name })` matches in tests,
 * are unchanged.
 */
export function RichTextToolbar({ disabled, session }: RichTextToolbarProps): JSX.Element {
  const { t } = useTranslation()
  const editor = useSlate()
  const [linkOpen, setLinkOpen] = useState(false)
  const [imageOpen, setImageOpen] = useState(false)
  const activeBlock = activeBlockKind(editor)

  const canUndo = editor.history.undos.length > 0
  const canRedo = editor.history.redos.length > 0

  return (
    <div className="flex flex-col gap-2">
      <div
        className="rich-text-toolbar flex flex-wrap items-center gap-0.5 rounded-md border border-border bg-card p-1"
        role="toolbar"
        aria-label={t('richText.toolbarLabel')}
      >
        {MARK_BUTTONS.map(({ mark, labelKey, Icon }) => (
          <ToolbarButton
            key={mark}
            label={t(labelKey)}
            disabled={disabled}
            pressed={isMarkActive(editor, mark)}
            onClick={() => toggleMark(editor, mark)}
            Icon={Icon}
          />
        ))}

        <ToolbarSeparator />

        {BLOCK_BUTTONS.map(({ kind, labelKey, Icon }) => (
          <ToolbarButton
            key={kind}
            label={t(labelKey)}
            disabled={disabled}
            pressed={activeBlock === kind}
            onClick={() => toggleBlock(editor, kind)}
            Icon={Icon}
          />
        ))}

        <ToolbarSeparator />

        <ToolbarButton
          label={t('richText.linkButton')}
          disabled={disabled}
          pressed={linkOpen}
          onClick={() => setLinkOpen((open) => !open)}
          Icon={LinkIcon}
        />
        <ToolbarButton
          label={t('richText.insertImageButton')}
          disabled={disabled || session === undefined}
          onClick={() => setImageOpen(true)}
          Icon={ImageIcon}
        />

        <ToolbarSeparator />

        <ToolbarButton
          label={t('richText.undoButton')}
          disabled={disabled || !canUndo}
          onClick={() => HistoryEditor.undo(editor)}
          Icon={UndoIcon}
        />
        <ToolbarButton
          label={t('richText.redoButton')}
          disabled={disabled || !canRedo}
          onClick={() => HistoryEditor.redo(editor)}
          Icon={RedoIcon}
        />
      </div>

      {linkOpen && (
        <LinkPopover session={session} disabled={disabled} onClose={() => setLinkOpen(false)} />
      )}

      {session !== undefined && (
        <ImageInsertModal
          open={imageOpen}
          onOpenChange={setImageOpen}
          token={session.token}
          onInsert={(assetId, caption) => insertMedia(editor, assetId, caption)}
        />
      )}
    </div>
  )
}
