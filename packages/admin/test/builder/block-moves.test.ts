import { describe, expect, it } from 'vitest'
import type { ContentBlock } from '../../src/api/content-client.js'
import {
  blocksOfKeys,
  CLIPBOARD_FORMAT,
  indexOfKey,
  insertBlock,
  isInlineEditable,
  moveBlock,
  moveSelectionDown,
  moveSelectionUp,
  parseClipboardBlocks,
  pasteBlocks,
  removeBlock,
  removeBlocks,
  serialiseBlocksForClipboard,
  setInlineText,
} from '../../src/builder/block-moves.js'

const BLOCKS: readonly ContentBlock[] = [
  { key: 'a', type: 'hero', data: { title: 'First' } },
  { key: 'b', type: 'prose', data: { body: [] } },
  { key: 'c', type: 'cta', data: { title: 'Last' } },
]

function keys(blocks: readonly ContentBlock[]): readonly string[] {
  return blocks.map((block) => block.key)
}

describe('reordering a page by dragging (L16 task 2)', () => {
  it('puts the dragged block where it was dropped and keeps the others in order', () => {
    expect(keys(moveBlock(BLOCKS, 'c', 0))).toEqual(['c', 'a', 'b'])
    expect(keys(moveBlock(BLOCKS, 'a', 2))).toEqual(['b', 'c', 'a'])
  })

  it('returns the same array when the drop changes nothing', () => {
    // Not merely equal: identical. `history.push` uses reference identity to
    // decide whether an action is worth an undo step, so a drag that ends
    // where it started must not create one.
    expect(moveBlock(BLOCKS, 'b', 1)).toBe(BLOCKS)
    expect(moveBlock(BLOCKS, 'missing', 0)).toBe(BLOCKS)
  })

  it('clamps a drop past either end instead of losing the block', () => {
    expect(keys(moveBlock(BLOCKS, 'a', 99))).toEqual(['b', 'c', 'a'])
    expect(keys(moveBlock(BLOCKS, 'c', -5))).toEqual(['c', 'a', 'b'])
  })

  it('never invents, renames or drops a key while reordering', () => {
    const moved = moveBlock(BLOCKS, 'a', 2)
    expect([...keys(moved)].sort()).toEqual(['a', 'b', 'c'])
    expect(moved.map((block) => block.type).sort()).toEqual(['cta', 'hero', 'prose'])
  })
})

describe('inserting a block from the library', () => {
  it('inserts at the requested position with a fresh key nobody else holds', () => {
    const { blocks, key } = insertBlock(BLOCKS, 'quote', 1)
    expect(key).not.toBeNull()
    expect(keys(blocks)).toEqual(['a', key, 'b', 'c'])
    expect(blocks[1]).toEqual({ key, type: 'quote', data: {} })
  })

  it('appends when dropped past the end', () => {
    const { blocks, key } = insertBlock(BLOCKS, 'quote', 99)
    expect(keys(blocks).at(-1)).toBe(key)
  })

  it('refuses a type contract B does not declare, rather than storing it', () => {
    const { blocks, key } = insertBlock(BLOCKS, 'carousel-of-doom', 0)
    expect(key).toBeNull()
    expect(blocks).toBe(BLOCKS)
  })

  it('gives two blocks of the same type two different keys', () => {
    const first = insertBlock(BLOCKS, 'quote', 0)
    const second = insertBlock(first.blocks, 'quote', 0)
    expect(second.key).not.toBe(first.key)
  })
})

describe('removing a block', () => {
  it('removes exactly the one asked for', () => {
    expect(keys(removeBlock(BLOCKS, 'b'))).toEqual(['a', 'c'])
  })

  it('returns the same array for a key that is not there', () => {
    expect(removeBlock(BLOCKS, 'missing')).toBe(BLOCKS)
  })
})

describe('editing text in place in the preview (L16 task 3)', () => {
  it('writes a declared plain-text field of the block that was clicked', () => {
    const edited = setInlineText(BLOCKS, 'a', 'title', 'Edited in place')
    expect(edited[0]?.data['title']).toBe('Edited in place')
    // Its neighbours are untouched, and so is everything else in the block.
    expect(edited[1]).toBe(BLOCKS[1])
  })

  it('refuses to overwrite a structured field with a string', () => {
    // `prose.body` is a rich-text document and `hero.actions` is a list. An
    // inline edit that reached either would replace a structure with a text
    // node's contents — content destroyed, silently.
    expect(isInlineEditable('prose', 'body')).toBe(false)
    expect(isInlineEditable('hero', 'actions')).toBe(false)
    expect(setInlineText(BLOCKS, 'b', 'body', 'oops')).toBe(BLOCKS)
  })

  it('refuses a field the block type does not declare', () => {
    expect(isInlineEditable('hero', 'nonesuch')).toBe(false)
    expect(setInlineText(BLOCKS, 'a', 'nonesuch', 'oops')).toBe(BLOCKS)
  })

  it('refuses a block type outside the vocabulary', () => {
    expect(isInlineEditable('carousel-of-doom', 'title')).toBe(false)
  })

  it('accepts the plain-text fields the theme actually marks', () => {
    for (const [type, field] of [
      ['hero', 'title'],
      ['hero', 'subtitle'],
      ['hero', 'eyebrow'],
      ['cta', 'title'],
      ['cta', 'text'],
      ['quote', 'text'],
      ['quote', 'author'],
      ['quote', 'role'],
      ['faq', 'title'],
      ['stats', 'title'],
      ['logos', 'title'],
      ['featureGrid', 'title'],
      ['collectionList', 'title'],
      ['mediaFigure', 'credit'],
    ] as const) {
      expect(isInlineEditable(type, field), `${type}.${field}`).toBe(true)
    }
  })

  it('stores what was typed and nothing that looks like markup', () => {
    // Whatever a person pastes into a `contenteditable` arrives here as text,
    // because the caller reads `textContent`. It is stored as the string it
    // is — no tag is ever parsed, so none can ever be stored (R3).
    const edited = setInlineText(BLOCKS, 'a', 'title', '<script>alert(1)</script>')
    expect(edited[0]?.data['title']).toBe('<script>alert(1)</script>')
    expect(typeof edited[0]?.data['title']).toBe('string')
  })

  it('returns the same array when the text did not change', () => {
    expect(setInlineText(BLOCKS, 'a', 'title', 'First')).toBe(BLOCKS)
  })
})

describe('finding a block by its key', () => {
  it('answers -1 rather than 0 for a key that is absent', () => {
    expect(indexOfKey(BLOCKS, 'missing')).toBe(-1)
    expect(indexOfKey(BLOCKS, 'a')).toBe(0)
  })
})

describe('copy / paste (fiche 05 task 2, fiche 43 sub-chantier B)', () => {
  it('round-trips a selection through the clipboard payload', () => {
    const text = serialiseBlocksForClipboard([BLOCKS[0] as ContentBlock, BLOCKS[2] as ContentBlock])
    const parsed = parseClipboardBlocks(text)
    expect(parsed.kind).toBe('blocks')
    if (parsed.kind === 'blocks') {
      expect(parsed.blocks).toEqual([BLOCKS[0], BLOCKS[2]])
    }
  })

  it('ignores plain text that never came from this builder, rather than erroring', () => {
    expect(parseClipboardBlocks('just some copied text').kind).toBe('not-ours')
    expect(parseClipboardBlocks('{"unrelated":true}').kind).toBe('not-ours')
  })

  it('refuses a pasted block whose type this site does not declare, naming it', () => {
    const text = JSON.stringify({
      format: CLIPBOARD_FORMAT,
      blocks: [{ key: 'x', type: 'carousel-of-doom', data: {} }],
    })
    const parsed = parseClipboardBlocks(text)
    expect(parsed).toEqual({ kind: 'unknown-type', type: 'carousel-of-doom' })
  })

  it('pastes with a fresh key per block, never the copied ones', () => {
    const copied = [BLOCKS[0] as ContentBlock]
    const pasted = pasteBlocks(BLOCKS, copied, 1)
    expect(pasted).toHaveLength(4)
    expect(pasted[1]?.type).toBe('hero')
    expect(pasted[1]?.key).not.toBe('a')
    // Every key in the result is still unique.
    expect(new Set(keys(pasted)).size).toBe(4)
  })

  it('pasting the same clipboard twice never collides on a key', () => {
    const copied = [BLOCKS[0] as ContentBlock]
    const once = pasteBlocks(BLOCKS, copied, 0)
    const twice = pasteBlocks(once, copied, 0)
    expect(new Set(keys(twice)).size).toBe(keys(twice).length)
  })

  it('is a no-op for an empty paste', () => {
    expect(pasteBlocks(BLOCKS, [], 0)).toBe(BLOCKS)
  })
})

describe('multi-select group actions (fiche 05 task 5, fiche 43 sub-chantier E)', () => {
  it('captures exactly the selected blocks, in page order', () => {
    expect(blocksOfKeys(BLOCKS, new Set(['c', 'a']))).toEqual([BLOCKS[0], BLOCKS[2]])
  })

  it('removes a whole selection as one edit', () => {
    expect(keys(removeBlocks(BLOCKS, new Set(['a', 'c'])))).toEqual(['b'])
  })

  it('returns the same array for an empty selection', () => {
    expect(removeBlocks(BLOCKS, new Set())).toBe(BLOCKS)
  })

  it('moves a contiguous selection up as a unit', () => {
    // [a, b*, c*] -> b and c bubble past a together.
    expect(keys(moveSelectionUp(BLOCKS, new Set(['b', 'c'])))).toEqual(['b', 'c', 'a'])
  })

  it('moves a scattered selection up, each member by one slot', () => {
    // [a*, b, c*] -> a cannot move further (already at the top); c swaps with b.
    expect(keys(moveSelectionUp(BLOCKS, new Set(['a', 'c'])))).toEqual(['a', 'c', 'b'])
  })

  it('moves a selection down as a unit', () => {
    expect(keys(moveSelectionDown(BLOCKS, new Set(['a', 'b'])))).toEqual(['c', 'a', 'b'])
  })

  it('does not move a selection already at the boundary it is heading toward', () => {
    expect(moveSelectionUp(BLOCKS, new Set(['a']))).toBe(BLOCKS)
    expect(moveSelectionDown(BLOCKS, new Set(['c']))).toBe(BLOCKS)
  })
})
