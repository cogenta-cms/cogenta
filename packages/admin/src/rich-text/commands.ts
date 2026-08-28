import { Editor, Point, Range, Element as SlateElement, Transforms } from 'slate'
import type { RichTextDecorator } from './portable-text.js'
import type { CustomElement, LinkElement, MediaElement } from './slate-types.js'

export function isMarkActive(editor: Editor, mark: RichTextDecorator): boolean {
  const marks = Editor.marks(editor)
  return marks !== null && marks[mark] === true
}

export function toggleMark(editor: Editor, mark: RichTextDecorator): void {
  if (isMarkActive(editor, mark)) Editor.removeMark(editor, mark)
  else Editor.addMark(editor, mark, true)
}

export type BlockKind =
  | 'paragraph'
  | 'h2'
  | 'h3'
  | 'h4'
  | 'blockquote'
  | 'bullet'
  | 'number'
  | 'code-block'

function isBlockNode(node: unknown): node is CustomElement {
  return SlateElement.isElement(node)
}

function isTextBlockNode(
  node: unknown,
): node is Exclude<CustomElement, { type: 'link' } | { type: 'media' } | { type: 'hr' }> {
  return (
    isBlockNode(node) &&
    !Editor.isEditor(node) &&
    node.type !== 'link' &&
    node.type !== 'media' &&
    node.type !== 'hr'
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

/**
 * The internal-link counterpart of `insertLink` (fiche 04 task 2): stores
 * `{ collection, entryId }`, never a URL — the renderer resolves the URL at
 * render time, by the same `buildPath` every other route uses, which is what
 * lets renaming the target's slug leave this link untouched.
 */
export function insertInternalLink(editor: Editor, collection: string, entryId: string): void {
  const { selection } = editor
  if (selection === null || Editor.string(editor, selection) === '') return

  const link: CustomElement = { type: 'link', kind: 'internal', collection, entryId, children: [] }
  Transforms.wrapNodes(editor, link, { split: true, at: selection })
  Transforms.collapse(editor, { edge: 'end' })
}

function isLinkNode(node: unknown): node is LinkElement {
  return isBlockNode(node) && !Editor.isEditor(node) && node.type === 'link'
}

export function isLinkActive(editor: Editor): boolean {
  const { selection } = editor
  if (selection === null) return false
  const [match] = Editor.nodes(editor, {
    at: Editor.unhangRange(editor, selection),
    match: isLinkNode,
  })
  return match !== undefined
}

/** The link element under the current selection, so a reopened popover can show what is already there. */
export function activeLink(editor: Editor): LinkElement | null {
  const { selection } = editor
  if (selection === null) return null
  const [match] = Editor.nodes(editor, {
    at: Editor.unhangRange(editor, selection),
    match: isLinkNode,
  })
  return match === undefined ? null : (match[0] as LinkElement)
}

export function removeLink(editor: Editor): void {
  Transforms.unwrapNodes(editor, { match: isLinkNode })
}

/**
 * Inserts an image (fiche 04 task 3) as a void `media` element, followed by
 * an empty paragraph — Slate always needs a text block after a void one so
 * there is somewhere for the cursor to land and keep typing.
 */
export function insertMedia(editor: Editor, mediaId: string, caption?: string): void {
  const media: MediaElement = {
    type: 'media',
    mediaId,
    ...(caption === undefined || caption === '' ? {} : { caption }),
    children: [{ text: '' }],
  }
  Editor.withoutNormalizing(editor, () => {
    Transforms.insertNodes(editor, media)
    Transforms.insertNodes(editor, { type: 'paragraph', children: [{ text: '' }] })
  })
}

/**
 * Inserts a thematic break (fiche 42 task 2) — a void `hr` element, the same
 * shape as `insertMedia`: a trailing empty paragraph so there is somewhere
 * for the cursor to land and keep typing after it.
 */
export function insertThematicBreak(editor: Editor): void {
  Editor.withoutNormalizing(editor, () => {
    Transforms.insertNodes(editor, { type: 'hr', children: [{ text: '' }] })
    Transforms.insertNodes(editor, { type: 'paragraph', children: [{ text: '' }] })
  })
}

/**
 * The slash command trigger (fiche 04 task 5): "typing `/` at the start of
 * an empty line". Read literally — the whole current block's text must be
 * `/` plus the query, with the cursor at its end — rather than "a `/`
 * anywhere before the cursor", which would also fire while editing a URL or
 * a file path already typed into the paragraph.
 */
export function slashQueryAt(editor: Editor): string | null {
  const { selection } = editor
  if (selection === null || !Range.isCollapsed(selection)) return null

  const [match] = Editor.nodes(editor, {
    match: (node) =>
      SlateElement.isElement(node) && !editor.isInline(node) && !Editor.isEditor(node),
  })
  if (match === undefined) return null
  const [, path] = match

  const text = Editor.string(editor, path)
  if (!text.startsWith('/')) return null

  const end = Editor.end(editor, path)
  if (!Point.equals(selection.anchor, end)) return null

  return text.slice(1)
}

/** Deletes the `/query` text of the current block — the first step of executing a slash command. */
export function clearSlashQuery(editor: Editor): void {
  const [match] = Editor.nodes(editor, {
    match: (node) =>
      SlateElement.isElement(node) && !editor.isInline(node) && !Editor.isEditor(node),
  })
  if (match === undefined) return
  const [, path] = match
  Transforms.delete(editor, {
    at: { anchor: Editor.start(editor, path), focus: Editor.end(editor, path) },
  })
}
