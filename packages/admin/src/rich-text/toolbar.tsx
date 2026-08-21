import { type JSX, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { HistoryEditor } from 'slate-history'
import { useSlate } from 'slate-react'
import { cn } from '../ui/cn.js'
import {
  BoldIcon,
  BulletListIcon,
  CodeBlockIcon,
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
import type { RichTextViewMode } from './source-view.js'

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
  { kind: 'code-block', labelKey: 'richText.blockCode', Icon: CodeBlockIcon },
]

const VIEW_MODES: readonly { readonly mode: RichTextViewMode; readonly labelKey: string }[] = [
  { mode: 'rich', labelKey: 'richText.viewRich' },
  { mode: 'markdown', labelKey: 'richText.viewMarkdown' },
  { mode: 'html', labelKey: 'richText.viewHtml' },
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
  /** Which of the three views (L21 task 5) is showing — `rich-text-editor.tsx` owns the value, since switching it converts the document. */
  readonly viewMode: RichTextViewMode
  onViewModeChange(mode: RichTextViewMode): void
}

/**
 * Reorganised into groups with separators and icon buttons rather than a
 * row of word-labelled buttons (fiche 04 task 1) — every button keeps its
 * translated string as `aria-label`, so the accessible name a screen reader
 * announces, and the name `getByRole('button', { name })` matches in tests,
 * are unchanged.
 */
export function RichTextToolbar({
  disabled,
  session,
  viewMode,
  onViewModeChange,
}: RichTextToolbarProps): JSX.Element {
  const { t } = useTranslation()
  const editor = useSlate()
  const [linkOpen, setLinkOpen] = useState(false)
  const [imageOpen, setImageOpen] = useState(false)
  const activeBlock = activeBlockKind(editor)

  const canUndo = editor.history.undos.length > 0
  const canRedo = editor.history.redos.length > 0
  // The formatting controls act on the Slate document through `editor` —
  // meaningless while a `<textarea>` of raw Markdown/HTML stands in for
  // `<Editable>` (`rich-text-editor.tsx`), so they turn off together with
  // it rather than staying clickable against a document nobody sees change.
  const formattingDisabled = disabled || viewMode !== 'rich'

  return (
    <div className="flex flex-col gap-2">
      {/*
       * A `<fieldset>` of `aria-pressed` toggle buttons — the same shape
       * `entry-edit.tsx`'s form/visual-builder switch already uses (L16),
       * rather than `role="radiogroup"`/`role="radio"`, which would claim a
       * native semantic (`<input type="radio">`) this is not.
       */}
      <fieldset
        aria-label={t('richText.viewModeLabel')}
        className="m-0 flex flex-wrap items-center gap-1 border-0 p-0"
      >
        {VIEW_MODES.map(({ mode, labelKey }) => (
          <button
            key={mode}
            type="button"
            aria-pressed={viewMode === mode}
            disabled={disabled}
            className={cn(
              'cursor-pointer appearance-none rounded-md border border-border bg-transparent',
              'px-2.5 py-1 font-sans text-xs font-medium text-foreground',
              'hover:bg-accent hover:text-accent-foreground',
              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
              'disabled:pointer-events-none disabled:opacity-60',
              viewMode === mode && 'bg-accent text-accent-foreground',
            )}
            onMouseDown={(event) => {
              event.preventDefault()
              onViewModeChange(mode)
            }}
          >
            {t(labelKey)}
          </button>
        ))}
      </fieldset>

      <div
        className="rich-text-toolbar flex flex-wrap items-center gap-0.5 rounded-md border border-border bg-card p-1"
        role="toolbar"
        aria-label={t('richText.toolbarLabel')}
      >
        {MARK_BUTTONS.map(({ mark, labelKey, Icon }) => (
          <ToolbarButton
            key={mark}
            label={t(labelKey)}
            disabled={formattingDisabled}
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
            disabled={formattingDisabled}
            pressed={activeBlock === kind}
            onClick={() => toggleBlock(editor, kind)}
            Icon={Icon}
          />
        ))}

        <ToolbarSeparator />

        <ToolbarButton
          label={t('richText.linkButton')}
          disabled={formattingDisabled}
          pressed={linkOpen}
          onClick={() => setLinkOpen((open) => !open)}
          Icon={LinkIcon}
        />
        <ToolbarButton
          label={t('richText.insertImageButton')}
          disabled={formattingDisabled || session === undefined}
          onClick={() => setImageOpen(true)}
          Icon={ImageIcon}
        />

        <ToolbarSeparator />

        <ToolbarButton
          label={t('richText.undoButton')}
          disabled={formattingDisabled || !canUndo}
          onClick={() => HistoryEditor.undo(editor)}
          Icon={UndoIcon}
        />
        <ToolbarButton
          label={t('richText.redoButton')}
          disabled={formattingDisabled || !canRedo}
          onClick={() => HistoryEditor.redo(editor)}
          Icon={RedoIcon}
        />
      </div>

      {linkOpen && (
        <LinkPopover
          session={session}
          disabled={formattingDisabled}
          onClose={() => setLinkOpen(false)}
        />
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
