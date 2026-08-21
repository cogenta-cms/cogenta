import { createEditor, Editor, Element as SlateElement, Transforms } from 'slate'
import { describe, expect, it } from 'vitest'
import {
  activeBlockKind,
  activeLink,
  clearSlashQuery,
  insertInternalLink,
  insertMedia,
  isLinkActive,
  removeLink,
  slashQueryAt,
  toggleBlock,
} from '../../src/rich-text/commands.js'
import type { CustomElement } from '../../src/rich-text/slate-types.js'
import { withInlines } from '../../src/rich-text/with-inlines.js'

/** Slate surrounds a freshly wrapped inline with empty text-node boundaries; find the inline itself, not assume its index. */
function findLink(children: readonly CustomElement[]): CustomElement | undefined {
  return children.find((node) => SlateElement.isElement(node) && node.type === 'link')
}

/** Selects a point one character inside the link the editor currently holds. */
function selectInsideLink(editor: ReturnType<typeof withInlines>): void {
  const [match] = Editor.nodes(editor, {
    at: [],
    match: (node) => SlateElement.isElement(node) && node.type === 'link',
  })
  if (match === undefined) throw new Error('no link found')
  const [, path] = match
  Transforms.select(editor, { path: [...path, 0], offset: 1 })
}

function editorWithParagraph(text: string): ReturnType<typeof withInlines> {
  const editor = withInlines(createEditor())
  editor.children = [{ type: 'paragraph', children: [{ text }] }]
  Transforms.select(editor, {
    anchor: { path: [0, 0], offset: 0 },
    focus: { path: [0, 0], offset: text.length },
  })
  return editor
}

describe('insertInternalLink', () => {
  it('wraps the selection as an internal link, never storing a URL (ADR-0013)', () => {
    const editor = editorWithParagraph('the target page')
    insertInternalLink(editor, 'page', 'entry-42')

    const [node] = editor.children as [CustomElement & { type: 'paragraph' }]
    expect(node.type).toBe('paragraph')
    const link = findLink(node.children as CustomElement[])
    expect(link).toMatchObject({
      type: 'link',
      kind: 'internal',
      collection: 'page',
      entryId: 'entry-42',
    })
    // The rendered text is preserved; no `href` field exists anywhere on it.
    expect(JSON.stringify(link)).not.toContain('href')
  })

  it('does nothing on a collapsed (empty) selection — matches insertLink', () => {
    const editor = withInlines(createEditor())
    editor.children = [{ type: 'paragraph', children: [{ text: 'hello' }] }]
    Transforms.select(editor, { path: [0, 0], offset: 0 })

    insertInternalLink(editor, 'page', 'entry-1')
    expect(editor.children).toEqual([{ type: 'paragraph', children: [{ text: 'hello' }] }])
  })
})

describe('activeLink', () => {
  it('returns null when the cursor is not inside a link', () => {
    const editor = editorWithParagraph('plain text')
    Transforms.collapse(editor, { edge: 'start' })
    expect(activeLink(editor)).toBeNull()
  })

  it('returns the internal link element the cursor is inside', () => {
    const editor = editorWithParagraph('the target page')
    insertInternalLink(editor, 'page', 'entry-42')
    selectInsideLink(editor)

    const link = activeLink(editor)
    expect(link).toMatchObject({ kind: 'internal', collection: 'page', entryId: 'entry-42' })
  })

  it('is removed the same way as an external link', () => {
    const editor = editorWithParagraph('the target page')
    insertInternalLink(editor, 'page', 'entry-42')
    selectInsideLink(editor)

    expect(isLinkActive(editor)).toBe(true)
    removeLink(editor)
    expect(isLinkActive(editor)).toBe(false)
    expect(activeLink(editor)).toBeNull()
  })
})

describe('insertMedia', () => {
  it('inserts a void media node followed by an empty paragraph', () => {
    const editor = withInlines(createEditor())
    editor.children = [{ type: 'paragraph', children: [{ text: '' }] }]
    Transforms.select(editor, { path: [0, 0], offset: 0 })

    insertMedia(editor, 'asset-1', 'A caption')

    const types = (editor.children as CustomElement[]).map((node) => node.type)
    expect(types).toContain('media')
    const media = (editor.children as CustomElement[]).find((node) => node.type === 'media')
    expect(media).toMatchObject({ type: 'media', mediaId: 'asset-1', caption: 'A caption' })
  })

  it('omits the caption field entirely rather than storing an empty string', () => {
    const editor = withInlines(createEditor())
    editor.children = [{ type: 'paragraph', children: [{ text: '' }] }]
    Transforms.select(editor, { path: [0, 0], offset: 0 })

    insertMedia(editor, 'asset-1')

    const media = (editor.children as CustomElement[]).find((node) => node.type === 'media')
    expect(media && 'caption' in media ? media.caption : undefined).toBeUndefined()
  })
})

describe('slashQueryAt', () => {
  function editorWithBlockText(text: string): ReturnType<typeof withInlines> {
    const editor = withInlines(createEditor())
    editor.children = [{ type: 'paragraph', children: [{ text }] }]
    Transforms.select(editor, { path: [0, 0], offset: text.length })
    return editor
  }

  it('fires for a lone "/" at the end of an otherwise-empty block', () => {
    expect(slashQueryAt(editorWithBlockText('/'))).toBe('')
  })

  it('reports the text typed after the "/" as the query', () => {
    expect(slashQueryAt(editorWithBlockText('/quote'))).toBe('quote')
  })

  it('does not fire when the block has real text before the "/"', () => {
    expect(slashQueryAt(editorWithBlockText('see /quote'))).toBeNull()
  })

  it('does not fire when the cursor has moved away from the end of the query', () => {
    const editor = editorWithBlockText('/quote')
    Transforms.select(editor, { path: [0, 0], offset: 1 })
    expect(slashQueryAt(editor)).toBeNull()
  })

  it('does not fire on a non-collapsed (range) selection', () => {
    const editor = editorWithBlockText('/quote')
    Transforms.select(editor, {
      anchor: { path: [0, 0], offset: 0 },
      focus: { path: [0, 0], offset: 6 },
    })
    expect(slashQueryAt(editor)).toBeNull()
  })
})

/** L21 task 5: the code block is a plain block toggle, exactly like a heading or a blockquote. */
describe('toggleBlock — code-block', () => {
  it('turns the current block into a code block', () => {
    const editor = editorWithParagraph('const x = 1')
    Transforms.collapse(editor, { edge: 'start' })

    toggleBlock(editor, 'code-block')

    expect(editor.children).toEqual([{ type: 'code-block', children: [{ text: 'const x = 1' }] }])
    expect(activeBlockKind(editor)).toBe('code-block')
  })

  it('toggles back to a paragraph', () => {
    const editor = editorWithParagraph('const x = 1')
    Transforms.collapse(editor, { edge: 'start' })
    toggleBlock(editor, 'code-block')

    toggleBlock(editor, 'code-block')

    expect(editor.children).toEqual([{ type: 'paragraph', children: [{ text: 'const x = 1' }] }])
    expect(activeBlockKind(editor)).toBe('paragraph')
  })
})

describe('clearSlashQuery', () => {
  it('empties the current block, ready for toggleBlock to set its real kind', () => {
    const editor = withInlines(createEditor())
    editor.children = [{ type: 'paragraph', children: [{ text: '/quote' }] }]
    Transforms.select(editor, { path: [0, 0], offset: 6 })

    clearSlashQuery(editor)

    expect(editor.children).toEqual([{ type: 'paragraph', children: [{ text: '' }] }])
  })
})
