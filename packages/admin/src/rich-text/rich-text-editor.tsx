import type { TFunction } from 'i18next'
import { type JSX, type KeyboardEvent, useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { createEditor, type Descendant as SlateDescendant, Transforms } from 'slate'
import { withHistory } from 'slate-history'
import {
  Editable,
  ReactEditor,
  type RenderElementProps,
  type RenderLeafProps,
  Slate,
  useSlateStatic,
  withReact,
} from 'slate-react'
import { MediaThumbnail } from '../media/media-thumbnail.js'
import '../styles/rich-text.css'
import { cn } from '../ui/cn.js'
import { FullscreenExitIcon, FullscreenIcon } from '../ui/icons.js'
import { clearSlashQuery, slashQueryAt, toggleBlock } from './commands.js'
import { portableTextToSlate, slateToPortableText } from './convert.js'
import { ImageInsertModal } from './image-picker.js'
import type { RichTextDocument } from './portable-text.js'
import { RichTextSelectionAssist } from './selection-assist.js'
import type { RichTextSession } from './session.js'
import { filterSlashItems, SlashMenu, type SlashMenuItem } from './slash-menu.js'
import { RichTextToolbar } from './toolbar.js'
import { withInlines } from './with-inlines.js'
import { countText } from './word-count.js'

function MediaElementView(props: {
  readonly attributes: RenderElementProps['attributes']
  readonly children: RenderElementProps['children']
  readonly element: Extract<RenderElementProps['element'], { type: 'media' }>
  readonly token: string | undefined
  readonly t: TFunction
}): JSX.Element {
  const { attributes, children, element, token, t } = props
  const editor = useSlateStatic()

  function setCaption(caption: string): void {
    const path = ReactEditor.findPath(editor, element)
    if (caption === '') Transforms.unsetNodes(editor, 'caption', { at: path })
    else Transforms.setNodes(editor, { caption }, { at: path })
  }

  return (
    <div
      {...attributes}
      contentEditable={false}
      className="rich-text-media flex flex-col gap-1 rounded-md border border-border p-2"
    >
      {token === undefined ? (
        <span className="text-sm text-muted-foreground">
          {t('richText.mediaLabel', { id: element.mediaId })}
        </span>
      ) : (
        <MediaThumbnail token={token} id={element.mediaId} alt="" previewable />
      )}
      <input
        type="text"
        className="w-full rounded-md border border-input bg-card px-2 py-1 text-sm"
        placeholder={t('richText.mediaCaptionPlaceholder')}
        value={element.caption ?? ''}
        onChange={(event) => setCaption(event.target.value)}
      />
      {children}
    </div>
  )
}

function renderElement(
  props: RenderElementProps,
  t: TFunction,
  token: string | undefined,
): JSX.Element {
  const { attributes, children, element } = props
  switch (element.type) {
    case 'h2':
      return <h2 {...attributes}>{children}</h2>
    case 'h3':
      return <h3 {...attributes}>{children}</h3>
    case 'h4':
      return <h4 {...attributes}>{children}</h4>
    case 'blockquote':
      return <blockquote {...attributes}>{children}</blockquote>
    case 'list-item':
      return (
        <div {...attributes} data-list-type={element.listType} data-list-level={element.level}>
          {children}
        </div>
      )
    case 'link':
      return (
        <a
          {...attributes}
          href={
            element.kind === 'external' ? element.href : `#${element.collection}/${element.entryId}`
          }
          title={
            element.kind === 'internal'
              ? t('richText.internalLinkTitle', {
                  path: `${element.collection}/${element.entryId}`,
                })
              : undefined
          }
        >
          {children}
        </a>
      )
    case 'media':
      return (
        <MediaElementView
          attributes={attributes}
          children={children}
          element={element}
          token={token}
          t={t}
        />
      )
    default:
      return <p {...attributes}>{children}</p>
  }
}

function renderLeaf({ attributes, children, leaf }: RenderLeafProps): JSX.Element {
  let content = children
  if (leaf.strong) content = <strong>{content}</strong>
  if (leaf.em) content = <em>{content}</em>
  if (leaf.code) content = <code>{content}</code>
  return <span {...attributes}>{content}</span>
}

export interface RichTextEditorProps {
  readonly id: string
  readonly value: RichTextDocument
  readonly disabled?: boolean | undefined
  onChange(value: RichTextDocument): void
  /** Enables the internal-link tab, the image picker and drag-and-drop upload. Absent means formatting only. */
  readonly session?: RichTextSession | undefined
}

interface SlashState {
  readonly query: string
  readonly activeIndex: number
}

/**
 * Clean-paste is handled in `with-inlines.ts` (`editor.insertData`): with
 * HTML on the clipboard, it is normalised into this vocabulary; with none,
 * Slate's own `text/plain` fallback runs, which was always what kept R3 (a
 * block never stores HTML or CSS) true here for free.
 */
export function RichTextEditor({
  id,
  value,
  disabled = false,
  onChange,
  session,
}: RichTextEditorProps): JSX.Element {
  const { t } = useTranslation()
  const editor = useMemo(() => withInlines(withHistory(withReact(createEditor()))), [])
  const [internalValue, setInternalValue] = useState<SlateDescendant[]>(() =>
    portableTextToSlate(value),
  )
  const [fullscreen, setFullscreen] = useState(false)
  const [slash, setSlash] = useState<SlashState | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [droppedFile, setDroppedFile] = useState<File | null>(null)
  const [imageModalOpen, setImageModalOpen] = useState(false)

  const stats = countText(slateToPortableText(internalValue as never))

  const handleChange = useCallback(
    (nodes: SlateDescendant[]) => {
      setInternalValue(nodes)
      const isTextChange = editor.operations.some((op) => op.type !== 'set_selection')
      if (isTextChange) onChange(slateToPortableText(nodes as never))
      const query = slashQueryAt(editor)
      setSlash(query === null ? null : { query, activeIndex: 0 })
    },
    [editor, onChange],
  )

  const slashItems = slash === null ? [] : filterSlashItems(slash.query, t)

  function runSlashItem(item: SlashMenuItem): void {
    clearSlashQuery(editor)
    setSlash(null)
    if (item.kind === 'block' && item.blockKind !== undefined) {
      toggleBlock(editor, item.blockKind)
    } else if (item.kind === 'image' && session !== undefined) {
      setDroppedFile(null)
      setImageModalOpen(true)
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    if (slash !== null && slashItems.length > 0) {
      if (event.key === 'ArrowDown') {
        event.preventDefault()
        setSlash({ ...slash, activeIndex: (slash.activeIndex + 1) % slashItems.length })
        return
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault()
        setSlash({
          ...slash,
          activeIndex: (slash.activeIndex - 1 + slashItems.length) % slashItems.length,
        })
        return
      }
      if (event.key === 'Enter') {
        event.preventDefault()
        const item = slashItems[slash.activeIndex]
        if (item !== undefined) runSlashItem(item)
        return
      }
    }
    if (slash !== null && event.key === 'Escape') {
      event.preventDefault()
      setSlash(null)
    }
  }

  return (
    <div
      className={cn(
        'rich-text-editor flex flex-col gap-2',
        fullscreen && 'rich-text-editor--fullscreen',
      )}
    >
      <Slate editor={editor} initialValue={internalValue} onChange={handleChange}>
        <div className="flex items-start gap-2">
          <div className="flex-1">
            <RichTextToolbar disabled={disabled} session={session} />
            <RichTextSelectionAssist disabled={disabled} />
          </div>
          <button
            type="button"
            disabled={disabled}
            aria-label={fullscreen ? t('richText.exitFullscreen') : t('richText.enterFullscreen')}
            title={fullscreen ? t('richText.exitFullscreen') : t('richText.enterFullscreen')}
            className="inline-flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-md border border-border bg-card text-foreground hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
            onClick={() => setFullscreen((current) => !current)}
          >
            {fullscreen ? (
              <FullscreenExitIcon className="size-4" />
            ) : (
              <FullscreenIcon className="size-4" />
            )}
          </button>
        </div>

        {/*
         * A `<fieldset>` rather than a plain `<div>`: a static element with
         * drag handlers needs container semantics, the same choice fiche
         * 03's `MediaPicker` makes for its own drop zone. Dropping is a
         * convenience, never the only way in — the toolbar's own "insert
         * image" button reaches the same modal.
         */}
        <fieldset
          aria-label={t('richText.imageDropHint')}
          className={cn(
            'rich-text-editor__surface relative m-0 rounded-md border border-input bg-card p-0 px-3 py-2',
            dragOver && 'rich-text-editor__surface--drag-over',
          )}
          onDragOver={(event) => {
            if (disabled || session === undefined) return
            event.preventDefault()
            setDragOver(true)
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(event) => {
            event.preventDefault()
            setDragOver(false)
            if (disabled || session === undefined) return
            const file = event.dataTransfer.files[0]
            if (file === undefined || !file.type.startsWith('image/')) return
            setDroppedFile(file)
            setImageModalOpen(true)
          }}
        >
          <Editable
            id={id}
            readOnly={disabled}
            renderElement={(props) => renderElement(props, t, session?.token)}
            renderLeaf={renderLeaf}
            placeholder={t('richText.placeholder')}
            onKeyDown={handleKeyDown}
          />

          {slash !== null && (
            <div className="absolute top-full left-0 z-10 mt-1">
              <SlashMenu
                items={slashItems}
                activeIndex={Math.min(slash.activeIndex, Math.max(slashItems.length - 1, 0))}
                onSelect={runSlashItem}
                onHover={(index) => setSlash({ ...slash, activeIndex: index })}
                imagesAvailable={session !== undefined}
              />
            </div>
          )}
        </fieldset>

        <p className="rich-text-editor__stats text-xs text-muted-foreground">
          {t('richText.wordCount', { count: stats.words })} ·{' '}
          {t('richText.characterCount', { count: stats.characters })}
        </p>
      </Slate>

      {session !== undefined && (
        <ImageInsertModal
          open={imageModalOpen}
          onOpenChange={(open) => {
            setImageModalOpen(open)
            if (!open) setDroppedFile(null)
          }}
          token={session.token}
          {...(droppedFile === null ? {} : { initialFile: droppedFile })}
          onInsert={(assetId, caption) => {
            Transforms.insertNodes(editor, {
              type: 'media',
              mediaId: assetId,
              ...(caption === '' ? {} : { caption }),
              children: [{ text: '' }],
            })
            Transforms.insertNodes(editor, { type: 'paragraph', children: [{ text: '' }] })
          }}
        />
      )}
    </div>
  )
}
