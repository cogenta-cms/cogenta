import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderCta } from '../../src/render/blocks/cta.js'
import { BLOCKS, makeContext } from '../fixtures.js'

const ctx = makeContext()

describe('cta', () => {
  it('renders to stable markup', () => {
    expect(serialize(renderCta(BLOCKS.cta, ctx))).toMatchSnapshot()
  })

  it('renders the title at h2', () => {
    const html = serialize(renderCta(BLOCKS.cta, ctx))
    expect(html).toContain('<h2 class="ce-cta__title" data-field="title">')
  })

  it('wraps the whole panel in one element the accent-panel overrides can target', () => {
    const html = serialize(renderCta(BLOCKS.cta, ctx))
    expect(html).toContain('class="ce-cta__panel"')
  })

  it('omits the supporting text paragraph when the field is absent', () => {
    const { text: _text, ...rest } = BLOCKS.cta
    const html = serialize(renderCta(rest, ctx))
    expect(html).not.toContain('ce-cta__text')
  })

  it('always renders the action list — actions are required and non-empty by contract B', () => {
    const html = serialize(renderCta(BLOCKS.cta, ctx))
    expect(html).toContain('class="cg-actions"')
  })

  it("labels the action list's group with the block's own title", () => {
    const html = serialize(renderCta(BLOCKS.cta, ctx))
    expect(html).toContain(`aria-label="${BLOCKS.cta.title}"`)
  })

  it('marks the action with its emphasis for the panel-override styles to key on', () => {
    const html = serialize(renderCta(BLOCKS.cta, ctx))
    expect(html).toContain('data-emphasis="primary"')
  })

  it('escapes text arriving in the supporting copy field', () => {
    const html = serialize(renderCta({ ...BLOCKS.cta, text: '50% off <today only>' }, ctx))
    expect(html).toContain('50% off &lt;today only&gt;')
    expect(html).not.toContain('<today only>')
  })

  it('is stamped as its own block for CSS targeting', () => {
    const html = serialize(renderCta(BLOCKS.cta, ctx))
    expect(html).toContain('data-block="cta"')
    expect(html).toContain('class="ce-block ce-cta"')
  })
})
