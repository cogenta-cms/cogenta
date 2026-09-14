import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderAccordion } from '../../src/render/blocks/accordion.js'
import { BLOCKS, makeContext } from '../fixtures.js'

const ctx = makeContext()
const html = serialize(renderAccordion(BLOCKS.accordion, ctx))

describe('accordion', () => {
  it('is drawn with the same details rows as the FAQ', () => {
    expect(html).toContain('<details class="cr-answers__details">')
    expect(html).toContain('<h3 class="cr-answers__question">Nuts</h3>')
  })

  it('marks itself as notes, so the stylesheet sets it in one narrower column', () => {
    expect(html).toContain('data-variant="notes"')
    expect(html).toContain('data-block="accordion"')
  })

  it('renders every answer, not only the first', () => {
    const two = serialize(
      renderAccordion(
        {
          ...BLOCKS.accordion,
          items: [
            ...BLOCKS.accordion.items,
            {
              _key: 'acc2',
              question: 'Gluten',
              answer: [
                {
                  _key: 'g',
                  _type: 'block',
                  style: 'normal',
                  children: [{ _key: 'gs', _type: 'span', text: 'Ask us.', marks: [] }],
                  markDefs: [],
                },
              ],
            },
          ],
        },
        ctx,
      ),
    )
    expect(two.match(/<details/g)).toHaveLength(2)
  })

  it('renders untitled notes without an empty heading', () => {
    const { title: _title, ...rest } = BLOCKS.accordion
    expect(serialize(renderAccordion(rest, ctx))).not.toContain('cr-head')
  })
})
