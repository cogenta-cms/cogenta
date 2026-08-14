import { Editor, Element as SlateElement, Transforms } from 'slate'
import type { RichTextDecorator } from './portable-text.js'
import type { CustomElement } from './slate-types.js'

export function isMarkActive(editor: Editor, mark: RichTextDecorator): boolean {
  const marks = Editor.marks(editor)
  return marks !== null && marks[mark] === true
}

export function toggleMark(editor: Editor, mark: RichTextDecorator): void {
  if (isMarkActive(editor, mark)) Editor.removeMark(editor, mark)
  else Editor.addMark(editor, mark, true)
}

export type BlockKind = 'paragraph' | 'h2' | 'h3' | 'h4' | 'blockquote' | 'bullet' | 'number'

function isBlockNode(node: unknown): node is CustomElement {
  return SlateElement.isElement(node)
}

function isTextBlockNode(
  node: unknown,
): node is Exclude<CustomElement, { type: 'link' } | { type: 'media' }> {
  return (
    isBlockNode(node) && !Editor.isEditor(node) && node.type !== 'link' && node.type !== 'media'
  )
}

export function activeBlockKind(editor: Editor): BlockKind | null {
  const { selection } = editor
  if (selection === null) return null

  const [match] = Editor.nodes(editor, {
    at: Editor.unhangRange(editor, selection),
    match: isTextBlockNode,
  })
  if (match === undefined) return null

  const [node] = match
  if (!isTextBlockNode(node)) return null
  if (node.type === 'list-item') return node.listType
  if (node.type === 'paragraph') return 'paragraph'
  return node.type
}

/**
 * A list item here is a flat block with a `listType`, not a `<ul>` wrapping
 * `<li>`s — the same flat shape contract A's `RichTextBlock` already has.
 * Toggling a list is therefore one `setNodes`, never a wrap/unwrap pair.
 */
export function toggleBlock(editor: Editor, kind: BlockKind): void {
  const isActive = activeBlockKind(editor) === kind

  Editor.withoutNormalizing(editor, () => {
    const match = { match: isTextBlockNode }

    if (isActive) {
      Transforms.setNodes<CustomElement>(editor, { type: 'paragraph' }, match)
      Transforms.unsetNodes(editor, ['listType', 'level'], match)
      return
    }

    if (kind === 'bullet' || kind === 'number') {
      Transforms.setNodes<CustomElement>(
        editor,
        { type: 'list-item', listType: kind, level: 1 },
        match,
      )
      return
    }

    Transforms.setNodes<CustomElement>(editor, { type: kind }, match)
    Transforms.unsetNodes(editor, ['listType', 'level'], match)
  })
}

export function insertLink(editor: Editor, href: string): void {
  const { selection } = editor
  if (selection === null || Editor.string(editor, selection) === '') return

  const link: CustomElement = { type: 'link', kind: 'external', href, children: [] }
  Transforms.wrapNodes(editor, link, { split: true, at: selection })
  Transforms.collapse(editor, { edge: 'end' })
}

export function isLinkActive(editor: Editor): boolean {
  const { selection } = editor
  if (selection === null) return false
  const [match] = Editor.nodes(editor, {
    at: Editor.unhangRange(editor, selection),
    match: (node) => isBlockNode(node) && !Editor.isEditor(node) && node.type === 'link',
  })
  return match !== undefined
}

export function removeLink(editor: Editor): void {
  Transforms.unwrapNodes(editor, {
    match: (node) => isBlockNode(node) && !Editor.isEditor(node) && node.type === 'link',
  })
}
