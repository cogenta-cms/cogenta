import { isCogentaError } from '@cogenta/core'
import { describe, expect, it } from 'vitest'
import { planBuild } from '../../src/build/plan.js'
import { formatRuntimeRefusal } from '../../src/build/refusal.js'
import { collectRuntimeRequirements } from '../../src/build/requirements.js'
import { TARGET_CAPABILITIES } from '../../src/build/targets.js'
import {
  block,
  blocks,
  blocksWithPriceTable,
  routesWithServerBlock,
  staticRoutes,
  staticTheme,
} from './fixtures.js'

/** The refusal a build throws for the fixture site, as a single error. */
function refuse(): unknown {
  try {
    planBuild({
      target: 'static',
      routes: routesWithServerBlock,
      blocks,
      theme: staticTheme,
    })
    return null
  } catch (error) {
    return error
  }
}

describe('refusing a static build that needs a runtime', () => {
  it('refuses rather than dropping the block or freezing a snapshot of it', () => {
    const error = refuse()
    expect(isCogentaError(error)).toBe(true)
    if (!isCogentaError(error)) return
    expect(error.code).toBe('BUILD_RUNTIME_UNSATISFIED')
  })

  it('names the element, its declared runtime, and every page it sits on', () => {
    const error = refuse()
    if (!isCogentaError(error)) return expect.unreachable('the build must be refused')

    expect(error.message).toContain('block "collectionList"')
    expect(error.message).toContain('runtime: server')
    expect(error.message).toContain('/ (block c1)')
    expect(error.message).toContain('/blog (block c2)')
    // The page that carries nothing but static blocks is not implicated.
    expect(error.message).not.toContain('/about')
  })

  it('says why a static build cannot carry it, in the operator’s terms', () => {
    const error = refuse()
    if (!isCogentaError(error)) return expect.unreachable('the build must be refused')
    expect(error.message).toContain('renders every page once')
    expect(error.message).toContain('snapshot')
  })

  it('offers the three ways out, and no fourth', () => {
    const error = refuse()
    if (!isCogentaError(error)) return expect.unreachable('the build must be refused')

    expect(error.message).toContain('Three ways out, and there is no fourth')
    // 1 — a request-time target, named as a command, both of them.
    expect(error.message).toContain('--target node')
    expect(error.message).toContain('--target edge')
    // 2 — an external service.
    expect(error.message).toContain('external service')
    // 3 — removal, spelled out for this element.
    expect(error.message).toContain('remove the "collectionList" blocks listed above')
    expect(error.message).not.toContain('4.')
  })

  it('carries the machine-readable version of the same facts', () => {
    const error = refuse()
    if (!isCogentaError(error)) return expect.unreachable('the build must be refused')

    expect(error.details).toEqual({
      target: 'static',
      runtimes: ['server'],
      elements: [
        { origin: 'block', name: 'collectionList', runtime: 'server', routes: ['/', '/blog'] },
      ],
    })
  })

  it('reads as one message, whole', () => {
    const requirements = collectRuntimeRequirements({
      routes: [{ path: '/blog', blocks: [block('collectionList', 'c2')] }],
      blocks,
    })
    const message = formatRuntimeRefusal(TARGET_CAPABILITIES.static, requirements)

    expect(message).toBe(
      [
        'Build refused for the static (HTML files on a CDN) target: 1 element(s) need a runtime it cannot provide.',
        '',
        '  block "collectionList" — runtime: server',
        '    Why: This block declares runtime: server, meaning it needs a server at request time — it is rendered from data read when the page is asked for. A static build renders every page once and then serves files, so the only thing it could ship is a snapshot, wrong from the first content change after the build.',
        '    Where: Placed 1 time(s) on 1 route(s): /blog (block c2).',
        '',
        'Three ways out, and there is no fourth:',
        '',
        '  1. Build for a target that has a request: --target node or --target edge. Edge keeps the CDN in front and runs only these pages as functions; Node needs a process you keep alive.',
        '  2. Move the work to an external service the browser calls after load — a search endpoint, a comments service, a listing API. The page stays static and the element is replaced by that integration.',
        '  3. Remove the element from this site: remove the "collectionList" blocks listed above from their pages. The content itself is untouched either way.',
      ].join('\n'),
    )
  })

  it('lists more than one offending element at once, instead of one build per problem', () => {
    const error = (() => {
      try {
        planBuild({
          target: 'static',
          routes: [
            { path: '/', blocks: [block('collectionList', 'c1'), block('priceTable', 't1')] },
          ],
          blocks: blocksWithPriceTable,
          theme: { name: 'shop', runtime: 'server' },
          plugins: [{ name: '@acme/live-search', runtime: 'server' }],
        })
        return null
      } catch (caught) {
        return caught
      }
    })()

    if (!isCogentaError(error)) return expect.unreachable('the build must be refused')
    expect(error.message).toContain('4 element(s)')
    expect(error.message).toContain('theme "shop"')
    expect(error.message).toContain('plugin "@acme/live-search"')
    expect(error.message).toContain('block "priceTable"')
    expect(error.message).toContain('uninstall the plugin "@acme/live-search"')
    expect(error.message).toContain('use a theme declaring runtime: static')
    expect(error.message).toContain('Applies to the whole site.')
  })

  it('caps the list of placements instead of printing a wall of paths', () => {
    const routes = Array.from({ length: 9 }, (_, index) => ({
      path: `/page-${index}`,
      blocks: [block('collectionList', `c${index}`)],
    }))
    const requirements = collectRuntimeRequirements({ routes, blocks })
    const message = formatRuntimeRefusal(TARGET_CAPABILITIES.static, requirements)

    expect(message).toContain('Placed 9 time(s) on 9 route(s)')
    expect(message).toContain('/page-4 (block c4)')
    expect(message).not.toContain('/page-5 (block c5)')
    expect(message).toContain('and 4 more')
  })

  it('says nothing at all when every need is static', () => {
    expect(() =>
      planBuild({ target: 'static', routes: staticRoutes, blocks, theme: staticTheme }),
    ).not.toThrow()
  })

  it('refuses an unregistered block rather than guessing its runtime', () => {
    try {
      planBuild({
        target: 'static',
        routes: [{ path: '/', blocks: [block('liveTicker', 'x1')] }],
        blocks,
      })
      expect.unreachable('an unknown block must be refused')
    } catch (error) {
      expect(isCogentaError(error)).toBe(true)
      if (!isCogentaError(error)) return
      expect(error.code).toBe('BLOCK_UNKNOWN')
      expect(error.message).toContain('"liveTicker" on /')
    }
  })
})
