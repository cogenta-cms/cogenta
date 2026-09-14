import type { CollectionListBlock } from '@cogenta/blocks'
import {
  buildCollectionListQuery,
  type ContentEntry,
  type HtmlElement,
  h,
  nestedHeadingTag,
  type RenderContext,
} from '@cogenta/theme-kit'
import { section, sectionHead } from '../layout.js'
import { renderIndexRow, renderWorkCard, workFromEntry } from '../work.js'

export { buildCollectionListQuery as query }

/**
 * A listing of work, in one of three forms taken from the layout the editor
 * chose in contract B, never from a setting this theme invents:
 *
 * - `grid` is **the work grid**: an asymmetric sequence on twelve columns,
 *   six places long. A large image across seven columns with a smaller one
 *   across four, dropped lower, beside it; a full-width image; the pair again
 *   mirrored; a full-width image. Every cover keeps the same 3:2 shape, so
 *   the asymmetry comes from the columns and the drop, never from cropping
 *   one project differently from the next. The pattern lives in `work.css`,
 *   keyed on each item's `data-place`.
 * - `list` is **the index**: one ruled row per project, title, client,
 *   discipline and year in columns.
 * - `carousel` is **a strip**: cards side by side at one width, scrolling on
 *   any screen, a focusable and labelled region. No script.
 *
 * An empty list keeps its label and says so in one line.
 */

const PLACES = 6

function sizesFor(place: number): string {
  if (place === 3 || place === 0) return '(min-width: 64rem) 92rem, 100vw'
  if (place === 1 || place === 5) return '(min-width: 64rem) 54rem, 100vw'
  return '(min-width: 64rem) 30rem, 100vw'
}

function grid(entries: readonly ContentEntry[], ctx: RenderContext, titled: boolean): HtmlElement {
  const tag = nestedHeadingTag('collectionList', titled)
  return h(
    'ul',
    { class: 'cg-grid', 'data-count': String(entries.length) },
    entries.map((entry, index) => {
      const place = (index + 1) % PLACES
      return h(
        'li',
        { class: 'cg-grid__item', 'data-place': String(place === 0 ? PLACES : place) },
        renderWorkCard(workFromEntry(entry, ctx), {
          tag,
          sizes: sizesFor(place),
          loading: index < 2 ? 'eager' : 'lazy',
        }),
      )
    }),
  )
}

function index(entries: readonly ContentEntry[], ctx: RenderContext, titled: boolean): HtmlElement {
  const tag = nestedHeadingTag('collectionList', titled)
  return h(
    'ol',
    { class: 'cg-index', 'data-count': String(entries.length) },
    entries.map((entry) => renderIndexRow(workFromEntry(entry, ctx), tag)),
  )
}

function strip(
  entries: readonly ContentEntry[],
  ctx: RenderContext,
  block: CollectionListBlock,
): HtmlElement {
  const tag = nestedHeadingTag('collectionList', block.title !== undefined)
  return h(
    'div',
    {
      class: 'cg-strip',
      role: 'region',
      'aria-label': block.title ?? ctx.t('collection.carousel'),
      tabindex: '0',
    },
    h(
      'ul',
      { class: 'cg-strip__items', 'data-count': String(entries.length) },
      entries.map((entry) =>
        h(
          'li',
          { class: 'cg-strip__item' },
          renderWorkCard(workFromEntry(entry, ctx), {
            tag,
            sizes: '(min-width: 64rem) 34rem, 80vw',
          }),
        ),
      ),
    ),
  )
}

export function renderCollectionList(
  block: CollectionListBlock,
  ctx: RenderContext,
  entries: readonly ContentEntry[],
): HtmlElement {
  const titled = block.title !== undefined
  const form = block.layout === 'list' ? 'index' : block.layout === 'carousel' ? 'strip' : 'grid'
  const body =
    entries.length === 0
      ? h('p', { class: 'cg-empty' }, ctx.t('collection.empty'))
      : form === 'index'
        ? index(entries, ctx, titled)
        : form === 'strip'
          ? strip(entries, ctx, block)
          : grid(entries, ctx, titled)

  return section(
    'section',
    'collectionList',
    'cg-collection',
    { 'data-form': form, 'data-collection': block.collection },
    'div',
    sectionHead('collectionList', block.title),
    body,
  )
}
