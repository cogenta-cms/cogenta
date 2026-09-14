import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderCollectionList } from '../../src/render/blocks/collection-list.js'
import { BLOCKS, ENTRIES, FRONT_ENTRIES, makeContext } from '../fixtures.js'

const ctx = makeContext()
const { title: _title, ...untitled } = BLOCKS.collectionList

const front = serialize(renderCollectionList({ ...untitled, layout: 'grid' }, ctx, FRONT_ENTRIES))
const rail = serialize(
  renderCollectionList(
    { ...BLOCKS.collectionList, layout: 'grid' },
    ctx,
    FRONT_ENTRIES.slice(0, 3),
  ),
)
const strip = serialize(
  renderCollectionList(
    { ...BLOCKS.collectionList, layout: 'carousel' },
    ctx,
    FRONT_ENTRIES.slice(0, 4),
  ),
)
const ranked = serialize(
  renderCollectionList(BLOCKS.collectionList, ctx, FRONT_ENTRIES.slice(0, 5)),
)

describe('renderCollectionList, the four forms a listing takes', () => {
  it('names its form from the layout and the title the editor chose', () => {
    expect(front).toContain('data-form="front"')
    expect(rail).toContain('data-form="rail"')
    expect(strip).toContain('data-form="strip"')
    expect(ranked).toContain('data-form="ranked"')
  })

  it('sets an untitled grid as the front: a lead, three briefs and the rest in a row', () => {
    expect(front).toContain('<div class="cg-front" data-briefs="3" data-more="4">')
    expect(front.match(/cg-story--lead/g)).toHaveLength(1)
    expect(front.match(/<li class="cg-front__brief">/g)).toHaveLength(3)
    expect(front.match(/<li class="cg-front__item">/g)).toHaveLength(4)
  })

  it('gives the lead its photograph eagerly, and the briefs no photograph at all', () => {
    const lead = front.slice(front.indexOf('cg-front__lead'), front.indexOf('cg-front__briefs'))
    expect(lead).toMatch(/<img class="cg-story__image"[^>]*loading="eager"/)
    const briefs = front.slice(front.indexOf('cg-front__briefs'), front.indexOf('cg-front__more'))
    expect(briefs).not.toContain('<img')
  })

  it('sets the front with no head, so the first story sits right under the masthead', () => {
    expect(front).not.toContain('cg-head')
  })

  it('sets a titled grid as a rail: the head, a lead with its date, and a column', () => {
    expect(rail).toContain('<h2 class="cg-head__title" data-field="title">Latest dispatches</h2>')
    expect(rail).toContain('<div class="cg-rail" data-count="3">')
    expect(rail).toMatch(/<div class="cg-rail__lead"><article class="cg-story cg-story--rail"/)
    expect(rail.match(/<li class="cg-rail__item">/g)).toHaveLength(2)
    expect(rail).toContain('<time datetime="2026-03-20T08:00:00.000Z">Mar 20, 2026</time>')
  })

  it('sets a carousel as a strip: a focusable, labelled region of columns', () => {
    expect(strip).toContain(
      '<div class="cg-strip" role="region" aria-label="Latest dispatches" tabindex="0" data-count="4">',
    )
    expect(strip.match(/cg-story--strip/g)).toHaveLength(4)
  })

  it('sets a list as a ranked list: an ordered list with the numerals hidden from assistive technology', () => {
    expect(ranked).toContain('<ol class="cg-ranked" data-count="5">')
    expect(ranked).toContain('<span class="cg-story__numeral" aria-hidden="true">1</span>')
    expect(ranked).toContain('<span class="cg-story__numeral" aria-hidden="true">5</span>')
  })

  it('makes the headline the one link, and keeps the photograph link out of the tab order', () => {
    expect(front).toContain(
      '<h2 class="cg-story__title"><a class="cg-story__link" href="/en/article/0192f0c2-0000-7000-8000-000000000100">Front page story number 1</a></h2>',
    )
    expect(front).toMatch(
      /<a class="cg-story__media" href="[^"]+" tabindex="-1" aria-hidden="true">/,
    )
  })

  it('sets the kicker above the headline, from the plain-text field an entry carries', () => {
    expect(front).toContain('<p class="cg-story__kicker">Kicker 1</p>')
    expect(front).toContain('<p class="cg-story__kicker">Business</p>')
  })

  it('never shows a taxonomy term id as a kicker', () => {
    const html = serialize(renderCollectionList(BLOCKS.collectionList, ctx, ENTRIES))
    expect(html).toContain('<p class="cg-story__kicker">Print trades</p>')
    expect(html).not.toContain('0192f0c2-0000-7000-8000-00000000aaaa')
  })

  it('titles its entries one level below its own head, and at h2 without one', () => {
    expect(rail).toContain('<h3 class="cg-story__title">')
    expect(front).toContain('<h2 class="cg-story__title">')
    expect(front).not.toContain('<h3')
  })

  it('falls back to a readable title for an entry that has none', () => {
    const html = serialize(renderCollectionList(BLOCKS.collectionList, ctx, ENTRIES))
    expect(html).toContain('entry.untitled')
    expect(html).not.toContain('undefined')
  })

  it('keeps its head and says so in one line when there is nothing to list', () => {
    const html = serialize(renderCollectionList(BLOCKS.collectionList, ctx, []))
    expect(html).toContain('<p class="cg-empty">collection.empty</p>')
    expect(html).toContain('cg-head__title')
    expect(html).not.toMatch(/<ul|<ol/)
  })

  it('lets a lead without briefs take the whole row', () => {
    const html = serialize(
      renderCollectionList({ ...untitled, layout: 'grid' }, ctx, FRONT_ENTRIES.slice(0, 1)),
    )
    expect(html).toContain('data-briefs="0" data-more="0"')
    expect(html).not.toContain('cg-front__briefs')
  })

  it('marks whether each story carries a photograph, for the stylesheet', () => {
    expect(front).toContain('<article class="cg-story cg-story--secondary" data-media="image">')
    expect(front).toContain('<article class="cg-story cg-story--secondary" data-media="none">')
  })
})
