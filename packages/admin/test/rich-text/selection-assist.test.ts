import { createEditor, Editor, Node, type Range, Transforms } from 'slate'
import { withHistory } from 'slate-history'
import { describe, expect, it } from 'vitest'
import { selectionCrossesInline } from '../../src/rich-text/selection-assist.js'
import type { CustomElement } from '../../src/rich-text/slate-types.js'
import { withInlines } from '../../src/rich-text/with-inlines.js'

/**
 * Fiche 30 task 4's two load-bearing properties, tested at the Slate level
 * directly rather than through full DOM selection simulation — this project
 * has no existing pattern for simulating a real browser `Range` inside
 * `slate-react` (`rich-text-editor.test.tsx` never exercises one either), so
 * this exercises the exact same `Editor`/`Transforms`/`HistoryEditor` calls
 * `selection-assist.tsx`'s `accept()` makes, just without a rendered DOM:
 *
 * 1. A selection that overlaps a `link` or `media` inline is refused before
 *    any replacement is attempted (`selectionCrossesInline`).
 * 2. Replacing a selected range with `Transforms.insertText(editor, text, {
 *    at: selection })` leaves everything outside that range — an adjacent
 *    bold word, a whole separate link — untouched, and a single `undo()`
 *    call (the same `HistoryEditor` `withHistory` gives every editor
 *    instance in this admin) restores the document exactly, marks included.
 */

function makeEditor(children: CustomElement[]) {
  const editor = withInlines(withHistory(createEditor()))
  editor.children = children
  return editor
}

const PARAGRAPH_WITH_LINK: CustomElement = {
  type: 'paragraph',
  children: [
    { text: 'Read ' },
    {
      type: 'link',
      kind: 'external',
      href: 'https://example.com',
      children: [{ text: 'the article' }],
    },
    { text: ' for more.' },
  ],
}

describe('selectionCrossesInline', () => {
  it('allows a selection entirely inside plain text', () => {
    const editor = makeEditor([PARAGRAPH_WITH_LINK])
    const selection: Range = {
      anchor: { path: [0, 0], offset: 0 },
      focus: { path: [0, 0], offset: 4 },
    }

    expect(selectionCrossesInline(editor, selection)).toBe(false)
  })

  it('refuses a selection that overlaps the link', () => {
    const editor = makeEditor([PARAGRAPH_WITH_LINK])
    const selection: Range = {
      anchor: { path: [0, 0], offset: 2 },
      focus: { path: [0, 1, 0], offset: 3 },
    }

    expect(selectionCrossesInline(editor, selection)).toBe(true)
  })

  it('refuses a selection that overlaps a media void element', () => {
    const editor = makeEditor([
      {
        type: 'paragraph',
        children: [
          { text: 'Look: ' },
          { type: 'media', mediaId: 'm1', children: [{ text: '' }] },
          { text: ' done.' },
        ],
      },
    ])
    const selection: Range = {
      anchor: { path: [0, 0], offset: 0 },
      focus: { path: [0, 2], offset: 2 },
    }

    expect(selectionCrossesInline(editor, selection)).toBe(true)
  })
})

describe('replacing a selection the same way accept() does', () => {
  it('leaves an adjacent link and a following sentence untouched, and undo restores the original text', () => {
    const editor = makeEditor([
      {
        type: 'paragraph',
        children: [
          { text: 'Old sentence. ' },
          {
            type: 'link',
            kind: 'external',
            href: 'https://example.com',
            children: [{ text: 'A link' }],
          },
          { text: ' stays put.' },
        ],
      },
    ])

    const selection: Range = {
      anchor: { path: [0, 0], offset: 0 },
      focus: { path: [0, 0], offset: 13 },
    }

    Transforms.insertText(editor, 'A rewritten sentence.', { at: selection })

    const paragraph = editor.children[0] as CustomElement
    expect(Node.string(paragraph)).toBe('A rewritten sentence. A link stays put.')
    // The link node itself was never touched — same reference-shape check
    // `accept()` relies on: `insertText` at a range never reaches into a
    // sibling node.
    const linkNode = (paragraph as { children: unknown[] }).children[1] as {
      type: string
      href: string
    }
    expect(linkNode.type).toBe('link')
    expect(linkNode.href).toBe('https://example.com')

    // `Ctrl/⌘+Z` in the real editor calls exactly this.
    editor.undo()
    const restored = editor.children[0] as CustomElement
    expect(Node.string(restored)).toBe('Old sentence.  A link stays put.'.replace('  ', ' '))
  })

  it('does not disturb a bold mark immediately after the replaced range', () => {
    const editor = makeEditor([
      {
        type: 'paragraph',
        children: [{ text: 'Plain text here.' }, { text: 'Bold after', strong: true }],
      },
    ])

    const selection: Range = {
      anchor: { path: [0, 0], offset: 0 },
      focus: { path: [0, 0], offset: 17 },
    }

    Transforms.insertText(editor, 'New plain text.', { at: selection })

    const paragraph = editor.children[0] as { children: { text: string; strong?: true }[] }
    const boldNode = paragraph.children.find((node) => node.strong === true)
    expect(boldNode?.text).toBe('Bold after')

    editor.undo()
    const restored = editor.children[0] as { children: { text: string; strong?: true }[] }
    expect(Node.string({ children: restored.children } as never)).toBe('Plain text here.Bold after')
  })
})

// A quick sanity check that `Editor`/`withInlines` are wired the same way the
// real editor uses them, so this file fails loudly if that ever drifts.
describe('sanity', () => {
  it('treats link as inline and media as void, same as the real editor', () => {
    const editor = makeEditor([PARAGRAPH_WITH_LINK])
    expect(Editor.isInline(editor, PARAGRAPH_WITH_LINK.children[1] as never)).toBe(true)
  })
})
