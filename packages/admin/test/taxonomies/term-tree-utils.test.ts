import { describe, expect, it } from 'vitest'
import type { Term } from '../../src/api/taxonomy-client.js'
import {
  canDedent,
  canIndent,
  canMoveDown,
  canMoveUp,
  childrenOf,
  isSelfOrDescendant,
  MAX_TAXONOMY_DEPTH,
  planDedent,
  planDropOnto,
  planIndent,
  planMoveDown,
  planMoveUp,
  subtreeHeight,
  subtreeSize,
  wouldExceedDepth,
} from '../../src/taxonomies/term-tree-utils.js'

/**
 * Pure logic for the taxonomy tree screen (`08-taxonomies.md`, task 2) —
 * no DOM, no fetch, exactly the two refusals a materialised path has to
 * make: a cycle, and a subtree landing past the depth bound.
 */

function term(overrides: Partial<Term> & { readonly id: string }): Term {
  return {
    taxonomy: 'topic',
    parent: null,
    slug: overrides.id,
    labels: { en: overrides.id },
    position: 0,
    depth: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

// cuisine
//   desserts (0)
//     tartes (0)
//   entrees (1)
// voyage (root, position 1)
const cuisine = term({ id: 'cuisine', position: 0, depth: 0 })
const desserts = term({ id: 'desserts', parent: 'cuisine', position: 0, depth: 1 })
const tartes = term({ id: 'tartes', parent: 'desserts', position: 0, depth: 2 })
const entrees = term({ id: 'entrees', parent: 'cuisine', position: 1, depth: 1 })
const voyage = term({ id: 'voyage', position: 1, depth: 0 })

const TREE: readonly Term[] = [cuisine, desserts, tartes, entrees, voyage]

describe('childrenOf', () => {
  it('returns only the direct children, in server order', () => {
    expect(childrenOf(TREE, 'cuisine').map((t) => t.id)).toEqual(['desserts', 'entrees'])
    expect(childrenOf(TREE, null).map((t) => t.id)).toEqual(['cuisine', 'voyage'])
    expect(childrenOf(TREE, 'tartes')).toEqual([])
  })
})

describe('isSelfOrDescendant', () => {
  it('is true for the term itself', () => {
    expect(isSelfOrDescendant(TREE, 'cuisine', 'cuisine')).toBe(true)
  })

  it('is true for any depth of descendant', () => {
    expect(isSelfOrDescendant(TREE, 'cuisine', 'desserts')).toBe(true)
    expect(isSelfOrDescendant(TREE, 'cuisine', 'tartes')).toBe(true)
  })

  it('is false for an unrelated term, a sibling, or an ancestor', () => {
    expect(isSelfOrDescendant(TREE, 'cuisine', 'voyage')).toBe(false)
    expect(isSelfOrDescendant(TREE, 'desserts', 'entrees')).toBe(false)
    expect(isSelfOrDescendant(TREE, 'tartes', 'cuisine')).toBe(false)
  })
})

describe('subtreeHeight', () => {
  it('is 0 for a leaf and grows with the deepest descendant', () => {
    expect(subtreeHeight(TREE, 'tartes')).toBe(0)
    expect(subtreeHeight(TREE, 'entrees')).toBe(0)
    expect(subtreeHeight(TREE, 'desserts')).toBe(1)
    expect(subtreeHeight(TREE, 'cuisine')).toBe(2)
  })
})

describe('subtreeSize', () => {
  it('counts every descendant, not just direct children', () => {
    expect(subtreeSize(TREE, 'cuisine')).toBe(3)
    expect(subtreeSize(TREE, 'desserts')).toBe(1)
    expect(subtreeSize(TREE, 'tartes')).toBe(0)
    expect(subtreeSize(TREE, 'voyage')).toBe(0)
  })
})

describe('wouldExceedDepth', () => {
  it('is false comfortably under the bound', () => {
    expect(wouldExceedDepth(TREE, entrees, 'desserts')).toBe(false)
  })

  it('is true exactly at the bound, and accounts for the whole moved subtree', () => {
    // Building a chain of MAX_TAXONOMY_DEPTH roots (depths 0..11).
    const chain: Term[] = []
    let parent: string | null = null
    for (let level = 0; level < MAX_TAXONOMY_DEPTH; level += 1) {
      const node = term({ id: `level-${level}`, parent, position: 0, depth: level })
      chain.push(node)
      parent = node.id
    }
    const deepest = chain[chain.length - 1]
    if (deepest === undefined) throw new Error('unreachable')

    // A leaf term moved under the deepest node would sit at depth 12 — past
    // the bound (0..11 are the 12 allowed levels).
    const leaf = term({ id: 'leaf', position: 0, depth: 0 })
    expect(wouldExceedDepth(chain, leaf, deepest.id)).toBe(true)

    // The same leaf fits one level up.
    const secondDeepest = chain[chain.length - 2]
    expect(secondDeepest).toBeDefined()
    if (secondDeepest !== undefined) {
      expect(wouldExceedDepth(chain, leaf, secondDeepest.id)).toBe(false)
    }
  })

  it('refuses a move when the moved branch itself — not just its root — would land past the bound', () => {
    const chain: Term[] = []
    let parent: string | null = null
    for (let level = 0; level < 11; level += 1) {
      const node = term({ id: `level-${level}`, parent, position: 0, depth: level })
      chain.push(node)
      parent = node.id
    }
    const deepest = chain[chain.length - 1]
    if (deepest === undefined) throw new Error('unreachable')

    // A two-level branch elsewhere: its root alone would fit at depth 11,
    // but its child would land at depth 12.
    const branchRoot = term({ id: 'branch-root', position: 0, depth: 0 })
    const branchChild = term({ id: 'branch-child', parent: 'branch-root', position: 0, depth: 1 })
    const withBranch = [...chain, branchRoot, branchChild]

    expect(wouldExceedDepth(withBranch, branchRoot, deepest.id)).toBe(true)
  })
})

describe('canMoveUp / canMoveDown', () => {
  it('refuses moving the first sibling up, and the last sibling down', () => {
    expect(canMoveUp(TREE, desserts)).toBe(false)
    expect(canMoveDown(TREE, entrees)).toBe(false)
  })

  it('allows the opposite direction', () => {
    expect(canMoveDown(TREE, desserts)).toBe(true)
    expect(canMoveUp(TREE, entrees)).toBe(true)
  })
})

describe('planMoveUp / planMoveDown', () => {
  it('swaps the two siblings’ positions, nothing else', () => {
    const plan = planMoveDown(TREE, desserts)
    expect(plan?.move).toBeUndefined()
    expect(plan?.positions).toEqual(
      expect.arrayContaining([
        { id: 'desserts', position: entrees.position },
        { id: 'entrees', position: desserts.position },
      ]),
    )
  })

  it('returns null at the boundary rather than a no-op plan', () => {
    expect(planMoveUp(TREE, desserts)).toBeNull()
    expect(planMoveDown(TREE, entrees)).toBeNull()
  })
})

describe('planIndent / planDedent', () => {
  it('indents a term under its immediately preceding sibling', () => {
    const plan = planIndent(TREE, entrees)
    expect(plan?.move).toEqual({ id: 'entrees', parent: 'desserts' })
    expect(plan?.positions).toEqual([{ id: 'entrees', position: 1 }])
  })

  it('refuses to indent the first sibling — there is nothing to nest under', () => {
    expect(canIndent(TREE, desserts)).toBe(false)
    expect(planIndent(TREE, desserts)).toBeNull()
  })

  it('dedents a term to become the last child of its grandparent', () => {
    const plan = planDedent(TREE, tartes)
    expect(plan?.move).toEqual({ id: 'tartes', parent: 'cuisine' })
    // "cuisine" already has desserts and entrees as children.
    expect(plan?.positions).toEqual([{ id: 'tartes', position: 2 }])
  })

  it('dedents to the root when the parent was already a root term', () => {
    const plan = planDedent(TREE, desserts)
    expect(plan?.move).toEqual({ id: 'desserts', parent: null })
  })

  it('refuses to dedent a root term — it has nowhere higher to go', () => {
    expect(canDedent(TREE, cuisine)).toBe(false)
    expect(planDedent(TREE, cuisine)).toBeNull()
  })
})

describe('planDropOnto', () => {
  it('reorders within the same parent when dropped on a sibling', () => {
    const plan = planDropOnto(TREE, 'entrees', 'desserts')
    expect(plan?.move).toBeUndefined()
    expect(plan?.positions).toEqual([
      { id: 'entrees', position: 0 },
      { id: 'desserts', position: 1 },
    ])
  })

  it('nests as the last child when dropped on a term with a different parent', () => {
    const plan = planDropOnto(TREE, 'voyage', 'desserts')
    expect(plan?.move).toEqual({ id: 'voyage', parent: 'desserts' })
    expect(plan?.positions).toEqual([{ id: 'voyage', position: 1 }])
  })

  it('refuses dropping a term onto itself', () => {
    expect(planDropOnto(TREE, 'cuisine', 'cuisine')).toBeNull()
  })

  it('refuses dropping a term onto its own descendant — the cycle a materialised path cannot store', () => {
    expect(planDropOnto(TREE, 'cuisine', 'tartes')).toBeNull()
    expect(planDropOnto(TREE, 'desserts', 'tartes')).toBeNull()
  })

  it('refuses a drop that would push the moved branch past the depth bound', () => {
    const chain: Term[] = []
    let parent: string | null = null
    for (let level = 0; level < 12; level += 1) {
      const node = term({ id: `level-${level}`, parent, position: 0, depth: level })
      chain.push(node)
      parent = node.id
    }
    const deepest = chain[chain.length - 1]
    const other = term({ id: 'other', position: 1, depth: 0 })
    const withOther = [...chain, other]
    if (deepest === undefined) throw new Error('unreachable')

    expect(planDropOnto(withOther, 'other', deepest.id)).toBeNull()
  })
})
