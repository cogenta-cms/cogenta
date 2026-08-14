import type { TFunction } from 'i18next'
import { type JSX, useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { createEditor, type Descendant as SlateDescendant } from 'slate'
import { withHistory } from 'slate-history'
import {
  Editable,
  type RenderElementProps,
  type RenderLeafProps,
  Slate,
  withReact,
} from 'slate-react'
import { portableTextToSlate, slateToPortableText } from './convert.js'
import type { RichTextDocument } from './portable-text.js'
import { RichTextToolbar } from './toolbar.js'
import { withInlines } from './with-inlines.js'

function renderElement(
  { attributes, children, element }: RenderElementProps,
  t: TFunction,
): JSX.Element {
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
        <div {...attributes} contentEditable={false} className="rich-text-media">
          <span>{t('richText.mediaLabel', { id: element.mediaId })}</span>
          {children}
        </div>
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
}

/**
 * Paste handling is deliberately Slate's default: with no HTML deserializer
 * registered, `insertData` falls back to `text/plain`, so pasted rich text
 * from another app arrives as plain text rather than smuggling in foreign
 * HTML/CSS — exactly what R3 (a block never stores HTML or CSS) requires,
 * for free, without writing a sanitizer.
 */
export function RichTextEditor({
  id,
  value,
  disabled = false,
  onChange,
}: RichTextEditorProps): JSX.Element {
  const { t } = useTranslation()
  const editor = useMemo(() => withInlines(withHistory(withReact(createEditor()))), [])
  const [internalValue, setInternalValue] = useState<SlateDescendant[]>(() =>
    portableTextToSlate(value),
  )

  const handleChange = useCallback(
    (nodes: SlateDescendant[]) => {
      setInternalValue(nodes)
      const isTextChange = editor.operations.some((op) => op.type !== 'set_selection')
      if (isTextChange) onChange(slateToPortableText(nodes as never))
    },
    [editor, onChange],
  )

  return (
    <div className="rich-text-editor">
      <Slate editor={editor} initialValue={internalValue} onChange={handleChange}>
        <RichTextToolbar disabled={disabled} />
        <Editable
          id={id}
          readOnly={disabled}
          renderElement={(props) => renderElement(props, t)}
          renderLeaf={renderLeaf}
          placeholder={t('richText.placeholder')}
        />
      </Slate>
    </div>
  )
}
