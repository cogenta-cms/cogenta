import { describe, expect, it } from 'vitest'
import type { MenuItem } from '../../src/api/menu-client.js'
import {
  buildReorderPayload,
  dropBeforeOrAfter,
  dropInto,
  indent,
  moveDown,
  moveUp,
  outdent,
} from '../../src/menus/menu-tree-ops.js'

function item(partial: Partial<MenuItem> & { readonly id: string }): MenuItem {
  return {
    menuId: 'menu-1',
    parent: null,
    label: partial.id,
    kind: 'url',
    targetCollection: null,
    targetEntryId: null,
    targetTaxonomy: null,
    targetTermId: null,
    url: '/',
    title: null,
    position: 0,
    depth: 0,
    openInNewTab: false,
    ...partial,
  }
}

function ids(items: readonly MenuItem[]): readonly string[] {
  return items.map((entry) => entry.id)
}

/** A → [B, C] (B has a child D), all at the top level except D. */
function tree(): readonly MenuItem[] {
  return [
    item({ id: 'a', position: 0 }),
    item({ id: 'b', position: 1 }),
    item({ id: 'd', parent: 'b', position: 0, depth: 1 }),
    item({ id: 'c', position: 2 }),
  ]
}

describe('moveUp / moveDown (fiche 09, task 2)', () => {
  it('swaps a top-level item with the sibling above it', () => {
    const moved = moveUp(tree(), 'c')
    expect(ids(moved)).toEqual(['a', 'c', 'b', 'd'])
  })

  it('is a no-op at the top of the group', () => {
    const original = tree()
    expect(moveUp(original, 'a')).toBe(original)
  })

  it('swaps a top-level item with the sibling below it, carrying its children along', () => {
    const moved = moveDown(tree(), 'b')
    // "b" and its child "d" both move past "c" as one unit.
    expect(ids(moved)).toEqual(['a', 'c', 'b', 'd'])
    expect(moved.find((entry) => entry.id === 'd')?.parent).toBe('b')
  })

  it('is a no-op at the bottom of the group', () => {
    const original = tree()
    expect(moveDown(original, 'c')).toBe(original)
  })
})

describe('indent / outdent', () => {
  it('nests an item under its preceding sibling', () => {
    const moved = indent(tree(), 'c')
    const c = moved.find((entry) => entry.id === 'c')
    expect(c?.parent).toBe('b')
    expect(c?.depth).toBe(1)
  })

  it('refuses to indent the first item of a group — nothing precedes it', () => {
    const original = tree()
    expect(indent(original, 'a')).toBe(original)
  })

  it('un-nests an item to sit right after its former parent, and moves its own children along', () => {
    const nested = [
      item({ id: 'a', position: 0 }),
      item({ id: 'b', position: 1 }),
      item({ id: 'd', parent: 'b', position: 0, depth: 1 }),
      item({ id: 'e', parent: 'd', position: 0, depth: 2 }),
    ]
    const moved = outdent(nested, 'd')
    const d = moved.find((entry) => entry.id === 'd')
    const e = moved.find((entry) => entry.id === 'e')
    expect(d?.parent).toBeNull()
    expect(d?.depth).toBe(0)
    // "e" is d's own child, never named in the call, and still follows it.
    expect(e?.parent).toBe('d')
    expect(e?.depth).toBe(1)
    expect(ids(moved)).toEqual(['a', 'b', 'd', 'e'])
  })

  it('refuses to outdent a top-level item — it has no parent to become a sibling of', () => {
    const original = tree()
    expect(outdent(original, 'a')).toBe(original)
  })
})

describe('drag and drop', () => {
  it('drops before/after a target as its sibling', () => {
    const before = dropBeforeOrAfter(tree(), 'c', 'a', false)
    expect(ids(before)).toEqual(['c', 'a', 'b', 'd'])

    const after = dropBeforeOrAfter(tree(), 'a', 'c', true)
    expect(ids(after)).toEqual(['b', 'd', 'c', 'a'])
  })

  it('drops into a target as its last child', () => {
    const moved = dropInto(tree(), 'c', 'b')
    const c = moved.find((entry) => entry.id === 'c')
    expect(c?.parent).toBe('b')
    expect(ids(moved)).toEqual(['a', 'b', 'd', 'c'])
  })

  it('refuses to drop an item under its own descendant, before/after or into (the cycle the server also refuses)', () => {
    const original = tree()
    expect(dropBeforeOrAfter(original, 'b', 'd', true)).toBe(original)
    expect(dropInto(original, 'b', 'd')).toBe(original)
  })

  it('refuses a self-drop', () => {
    const original = tree()
    expect(dropBeforeOrAfter(original, 'a', 'a', true)).toBe(original)
    expect(dropInto(original, 'a', 'a')).toBe(original)
  })
})

describe('depth limit', () => {
  it('refuses to nest past the maximum depth', () => {
    // Eight items, each nested one under the previous — "n7" already sits at
    // the deepest depth a menu item is allowed to (depth 7, the eighth
    // level). "extra" is n7's own sibling, one level up.
    const deep: MenuItem[] = [item({ id: 'n0', position: 0, depth: 0 })]
    for (let level = 1; level < 8; level += 1) {
      deep.push(item({ id: `n${level}`, parent: `n${level - 1}`, position: 0, depth: level }))
    }
    const extra = item({ id: 'extra', parent: 'n6', position: 1, depth: 7 })
    const withExtra = [...deep, extra]

    // Indenting "extra" under "n7" (its preceding sibling) would push it to
    // depth 8 — one level further than the bound allows.
    const attempted = indent(withExtra, 'extra')
    expect(attempted).toBe(withExtra)
  })
})

describe('buildReorderPayload', () => {
  it('renumbers every group 0..n-1, for the whole tree in one shot', () => {
    const payload = buildReorderPayload(tree())
    expect(payload).toEqual(
      expect.arrayContaining([
        { id: 'a', parent: null, position: 0 },
        { id: 'b', parent: null, position: 1 },
        { id: 'c', parent: null, position: 2 },
        { id: 'd', parent: 'b', position: 0 },
      ]),
    )
    expect(payload).toHaveLength(4)
  })
})
