import { type JSX, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSlate } from 'slate-react'
import {
  activeBlockKind,
  type BlockKind,
  insertLink,
  isLinkActive,
  isMarkActive,
  removeLink,
  toggleBlock,
  toggleMark,
} from './commands.js'
import type { RichTextDecorator } from './portable-text.js'

const MARK_BUTTONS: readonly { readonly mark: RichTextDecorator; readonly labelKey: string }[] = [
  { mark: 'strong', labelKey: 'richText.markStrong' },
  { mark: 'em', labelKey: 'richText.markEm' },
  { mark: 'code', labelKey: 'richText.markCode' },
]

const BLOCK_BUTTONS: readonly { readonly kind: BlockKind; readonly labelKey: string }[] = [
  { kind: 'paragraph', labelKey: 'richText.blockParagraph' },
  { kind: 'h2', labelKey: 'richText.blockH2' },
  { kind: 'h3', labelKey: 'richText.blockH3' },
  { kind: 'h4', labelKey: 'richText.blockH4' },
  { kind: 'blockquote', labelKey: 'richText.blockQuote' },
  { kind: 'bullet', labelKey: 'richText.blockBullet' },
  { kind: 'number', labelKey: 'richText.blockNumber' },
]

export function RichTextToolbar({ disabled }: { readonly disabled: boolean }): JSX.Element {
  const { t } = useTranslation()
  const editor = useSlate()
  const [linkInput, setLinkInput] = useState<string | null>(null)
  const activeBlock = activeBlockKind(editor)
  const linkActive = isLinkActive(editor)

  return (
    <div className="rich-text-toolbar" role="toolbar" aria-label={t('richText.toolbarLabel')}>
      {MARK_BUTTONS.map(({ mark, labelKey }) => (
        <button
          key={mark}
          type="button"
          disabled={disabled}
          aria-pressed={isMarkActive(editor, mark)}
          onMouseDown={(event) => {
            event.preventDefault()
            toggleMark(editor, mark)
          }}
        >
          {t(labelKey)}
        </button>
      ))}

      {BLOCK_BUTTONS.map(({ kind, labelKey }) => (
        <button
          key={kind}
          type="button"
          disabled={disabled}
          aria-pressed={activeBlock === kind}
          onMouseDown={(event) => {
            event.preventDefault()
            toggleBlock(editor, kind)
          }}
        >
          {t(labelKey)}
        </button>
      ))}

      {linkActive ? (
        <button
          type="button"
          disabled={disabled}
          onMouseDown={(event) => {
            event.preventDefault()
            removeLink(editor)
          }}
        >
          {t('richText.removeLink')}
        </button>
      ) : linkInput === null ? (
        <button
          type="button"
          disabled={disabled}
          onMouseDown={(event) => {
            event.preventDefault()
            setLinkInput('')
          }}
        >
          {t('richText.linkButton')}
        </button>
      ) : (
        <input
          type="url"
          aria-label={t('richText.linkUrlLabel')}
          placeholder={t('richText.linkPlaceholder')}
          value={linkInput}
          onChange={(event) => setLinkInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              if (linkInput.trim() !== '') insertLink(editor, linkInput.trim())
              setLinkInput(null)
            }
            if (event.key === 'Escape') setLinkInput(null)
          }}
        />
      )}
    </div>
  )
}
