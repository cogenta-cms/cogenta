import { type AnyBlockDefinition, createBlockRegistry, defineBlock, f } from '@cogenta/blocks'
import type { BlockReference, BuildRoute } from '../../src/build/requirements.js'

/**
 * Shared build fixtures.
 *
 * The blocks are the real vocabulary, not stand-ins: `collectionList` really
 * does declare `runtime: 'server'`, and the whole point of these tests is the
 * first site that places it on a static build.
 */

export const blocks = createBlockRegistry()

/** A theme-owned block, to check that a plugin-shaped need is refused too. */
export const priceTableBlock: AnyBlockDefinition = defineBlock({
  name: 'priceTable',
  version: '1.0.0',
  runtime: 'server',
  fallback: 'prose',
  a11y: { headingLevel: 'h2' },
  schema: { currency: f.text({ required: true, max: 3 }) },
})

export const blocksWithPriceTable = createBlockRegistry([...blocks.all(), priceTableBlock])

export function block(type: string, key: string): BlockReference {
  return { _key: key, _type: type }
}

/** Three pages a static build can carry: nothing here needs a request. */
export const staticRoutes: readonly BuildRoute[] = [
  { path: '/', blocks: [block('hero', 'h1'), block('prose', 'p1')] },
  { path: '/about', blocks: [block('prose', 'p2'), block('quote', 'q1')] },
  { path: '/contact', blocks: [block('prose', 'p3')] },
]

/** The same site once an editor drops a listing on two of its pages. */
export const routesWithServerBlock: readonly BuildRoute[] = [
  { path: '/', blocks: [block('hero', 'h1'), block('collectionList', 'c1')] },
  { path: '/about', blocks: [block('prose', 'p2')] },
  { path: '/blog', blocks: [block('collectionList', 'c2')] },
]

export const staticTheme = { name: 'canonical', runtime: 'static' } as const

/**
 * A deterministic renderer, standing in for the theme.
 *
 * It sees the route and nothing else — no target — which is exactly the
 * guarantee the build makes, and what lets the equivalence test compare three
 * builds byte for byte.
 */
export function renderRoute(route: BuildRoute): string {
  const body = route.blocks
    .map((placed) => `<section data-block="${placed._type}" data-key="${placed._key}"></section>`)
    .join('')
  return `<main data-route="${route.path}">${body}</main>`
}
