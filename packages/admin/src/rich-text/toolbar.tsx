import { type JSX, useState } from 'react'
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

const MARK_BUTTONS: readonly { readonly mark: RichTextDecorator; readonly label: string }[] = [
  { mark: 'strong', label: 'Gras' },
  { mark: 'em', label: 'Italique' },
  { mark: 'code', label: 'Code' },
]

const BLOCK_BUTTONS: readonly { readonly kind: BlockKind; readonly label: string }[] = [
  { kind: 'paragraph', label: 'Paragraphe' },
  { kind: 'h2', label: 'Titre 2' },
  { kind: 'h3', label: 'Titre 3' },
  { kind: 'h4', label: 'Titre 4' },
  { kind: 'blockquote', label: 'Citation' },
  { kind: 'bullet', label: 'Liste à puces' },
  { kind: 'number', label: 'Liste numérotée' },
]

export function RichTextToolbar({ disabled }: { readonly disabled: boolean }): JSX.Element {
  const editor = useSlate()
  const [linkInput, setLinkInput] = useState<string | null>(null)
  const activeBlock = activeBlockKind(editor)
  const linkActive = isLinkActive(editor)

  return (
    <div className="rich-text-toolbar" role="toolbar" aria-label="Mise en forme">
      {MARK_BUTTONS.map(({ mark, label }) => (
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
          {label}
        </button>
      ))}

      {BLOCK_BUTTONS.map(({ kind, label }) => (
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
          {label}
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
          Retirer le lien
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
          Lien
        </button>
      ) : (
        <input
          type="url"
          aria-label="URL du lien"
          placeholder="https://…"
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
