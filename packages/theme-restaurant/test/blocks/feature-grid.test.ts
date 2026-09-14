import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderFeatureGrid } from '../../src/render/blocks/feature-grid.js'
import { BLOCKS, makeContext } from '../fixtures.js'

const ctx = makeContext()
const table = serialize(renderFeatureGrid(BLOCKS.featureGrid, ctx))
const columns = serialize(
  renderFeatureGrid(
    {
      ...BLOCKS.featureGrid,
      items: [
        { _key: 'c1', icon: 'calendar', title: 'Lunch', text: 'Thursday and Friday.' },
        { _key: 'c2', title: 'The counter', text: 'Six seats.', link: { href: '/visit' } },
      ],
    },
    ctx,
  ),
)

describe('featureGrid, as the ruled table of a menu card', () => {
  it('reads items without icons as a table', () => {
    expect(table).toContain('class="cr-section cr-table"')
    expect(table).toContain('<ul class="cr-table__rows">')
    expect(table).not.toContain('<svg')
  })

  it('titles the table at h2 and each row at h3', () => {
    expect(table).toContain('<h2 class="cr-head__title" data-field="title">Hours and address</h2>')
    expect(table).toContain('<h3 class="cr-table__label">Dinner</h3>')
  })

  it('puts the link on the value a guest acts on, never on its label', () => {
    expect(table).toContain('<h3 class="cr-table__label">Telephone</h3>')
    expect(table).toContain(
      '<a class="cr-table__value-link" href="tel:+33478281642">+33 4 78 28 16 42</a>',
    )
  })

  it('links the label of a row that has no sentence, as an arrow link', () => {
    expect(table).toContain(
      '<a class="cr-arrow-link cr-table__link" href="/en/page/reservations">Reservations</a>',
    )
  })

  it('starts row headings at h2 when the table has no title', () => {
    const { title: _title, ...rest } = BLOCKS.featureGrid
    const html = serialize(renderFeatureGrid(rest, ctx))
    expect(html).toContain('<h2 class="cr-table__label">Dinner</h2>')
    expect(html).toContain('data-titled="false"')
  })
})

describe('featureGrid, as ruled columns', () => {
  it('reads a grid with an icon as columns, and draws the icon as a line glyph', () => {
    expect(columns).toContain('class="cr-section cr-columns"')
    expect(columns).toMatch(/<svg[^>]*class="cr-columns__icon"/)
  })

  it('never puts an icon on a tinted tile or a card', () => {
    expect(columns).not.toMatch(/tile|card|badge/)
  })

  it('names a linked column with an arrow link and an unlinked one in plain text', () => {
    expect(columns).toContain(
      '<a class="cr-arrow-link cr-columns__link" href="/en/visit">The counter</a>',
    )
    expect(columns).toContain('<h3 class="cr-columns__name">Lunch</h3>')
  })
})
