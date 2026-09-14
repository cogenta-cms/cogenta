import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderAccordion } from '../../src/render/blocks/accordion.js'
import { renderCta } from '../../src/render/blocks/cta.js'
import { renderEmbed } from '../../src/render/blocks/embed.js'
import { renderFaq } from '../../src/render/blocks/faq.js'
import { renderGallery } from '../../src/render/blocks/gallery.js'
import { renderLogoStrip } from '../../src/render/blocks/logo-strip.js'
import { renderLogos } from '../../src/render/blocks/logos.js'
import { renderMediaFigure } from '../../src/render/blocks/media-figure.js'
import { renderPricingTable } from '../../src/render/blocks/pricing-table.js'
import { renderQuote } from '../../src/render/blocks/quote.js'
import { renderStatCounter } from '../../src/render/blocks/stat-counter.js'
import { renderStats } from '../../src/render/blocks/stats.js'
import { renderTestimonial } from '../../src/render/blocks/testimonial.js'
import { BLOCKS, makeContext } from '../fixtures.js'

const ctx = makeContext()

describe('accordion', () => {
  const html = serialize(renderAccordion(BLOCKS.accordion, ctx))

  it('opens each row without a script, through <details>', () => {
    expect(html).toContain('<details class="cd-accordion__item">')
    expect(html).toContain('<summary class="cd-accordion__summary">')
  })

  it('draws the plus as hairlines, hidden from assistive technology', () => {
    expect(html).toContain('<span class="cd-accordion__sign" aria-hidden="true"></span>')
  })

  it('renders the answer as rich text and the title as a heading', () => {
    expect(html).toContain('Every example on this site is run in CI')
    expect(html).toContain(
      '<h2 class="cd-head__title" data-field="title">How the examples are kept honest</h2>',
    )
  })

  it('is marked with data-block="accordion"', () => {
    expect(html).toContain('data-block="accordion"')
  })
})

describe('cta', () => {
  const html = serialize(renderCta(BLOCKS.cta, ctx))

  it('sets the title, the sentence and the actions in one ruled panel', () => {
    expect(html).toContain('<div class="cd-cta__panel">')
    expect(html).toContain('<h2 class="cd-cta__title" data-field="title">Contribute on GitHub</h2>')
    expect(html).toContain('data-emphasis="primary"')
  })

  it('names the list of actions after the block', () => {
    expect(html).toContain('aria-label="Contribute on GitHub"')
  })

  it('is marked with data-block="cta"', () => {
    expect(html).toContain('data-block="cta"')
  })
})

describe('embed', () => {
  it('contacts no third party before consent: no iframe, a notice and a link instead', () => {
    const html = serialize(renderEmbed(BLOCKS.embed, ctx))
    expect(html).not.toContain('<iframe')
    expect(html).not.toContain('<script')
    expect(html).toContain('embed.consentRequired')
    expect(html).toContain('rel="noopener noreferrer nofollow"')
  })

  it('embeds a privacy-enhanced player once consent is not required', () => {
    const html = serialize(renderEmbed({ ...BLOCKS.embed, consentRequired: false }, ctx))
    expect(html).toContain('src="https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ"')
    expect(html).toContain('loading="lazy"')
  })

  it('keeps the frame to the requested ratio', () => {
    expect(serialize(renderEmbed(BLOCKS.embed, ctx))).toContain('style="aspect-ratio:16 / 9"')
  })

  it('falls back to a link for a provider it cannot embed', () => {
    const html = serialize(
      renderEmbed(
        {
          ...BLOCKS.embed,
          provider: 'other',
          url: 'https://example.org/talk',
          consentRequired: false,
        },
        ctx,
      ),
    )
    expect(html).not.toContain('<iframe')
    expect(html).toContain('embed.unsupported')
  })
})

describe('faq', () => {
  const html = serialize(renderFaq(BLOCKS.faq, ctx))

  it('answers every question in the open, each question a real heading', () => {
    expect(html).toContain(
      '<h3 class="cd-faq__question">Which version do these docs describe?</h3>',
    )
    expect(html).not.toContain('<details')
  })

  it('renders the answer as rich text', () => {
    expect(html).toContain(
      '<div class="cd-faq__answer cd-rich"><p>Yes, from the current LTS onward.</p></div>',
    )
  })

  it('says whether it is titled, so the title column only exists when there is a title', () => {
    expect(html).toContain('data-titled="true"')
    const { title: _title, ...untitled } = BLOCKS.faq
    const bare = serialize(renderFaq(untitled, ctx))
    expect(bare).toContain('data-titled="false"')
    expect(bare).toContain('<h2 class="cd-faq__question">')
  })
})

describe('gallery', () => {
  it('frames every picture and names a carousel as a scroll region', () => {
    const html = serialize(renderGallery(BLOCKS.gallery, ctx))
    expect(html.match(/cd-gallery__item cd-frame/g)).toHaveLength(2)
    expect(html).toContain('role="region"')
    expect(html).toContain('aria-label="gallery.carousel"')
  })

  it('lays a grid out without a scroll region', () => {
    const html = serialize(renderGallery({ ...BLOCKS.gallery, layout: 'grid' }, ctx))
    expect(html).not.toContain('role="region"')
    expect(html).toContain('data-layout="grid"')
  })
})

describe('logos and logoStrip', () => {
  it('names a logo after its organisation when the media has no alt text, and links it', () => {
    const html = serialize(renderLogos(BLOCKS.logos, ctx))
    expect(html).toContain('alt="Acme"')
    expect(html).toContain('href="https://acme.example"')
    expect(html).toContain('cd-mark')
  })

  it('leaves an organisation without an address unlinked', () => {
    const html = serialize(renderLogos(BLOCKS.logos, ctx))
    expect(html.match(/cd-logos__link/g)).toHaveLength(1)
  })

  it('sets the strip caption above the marks', () => {
    const html = serialize(renderLogoStrip(BLOCKS.logoStrip, ctx))
    expect(html.indexOf('cd-strip__caption')).toBeLessThan(html.indexOf('cd-strip__items'))
    expect(html.match(/cd-mark/g)).toHaveLength(2)
  })
})

describe('mediaFigure', () => {
  const html = serialize(renderMediaFigure(BLOCKS.mediaFigure, ctx))

  it('frames the picture and crops it to the requested ratio', () => {
    expect(html).toContain(
      'class="cd-figure__media cd-frame" style="aspect-ratio:16 / 9" data-ratio="fixed"',
    )
  })

  it('sets the caption and the credit under the picture', () => {
    expect(html).toContain('The request pipeline, end to end')
    expect(html).toContain('<span class="cd-figure__credit" data-field="credit">Relay 2.4</span>')
  })

  it('drops the frame when the figure runs to the edges', () => {
    const full = serialize(renderMediaFigure({ ...BLOCKS.mediaFigure, align: 'full' }, ctx))
    expect(full).toContain('class="cd-figure__media" ')
    expect(full).toContain('data-align="full"')
  })
})

describe('pricingTable', () => {
  const html = serialize(renderPricingTable(BLOCKS.pricingTable, ctx))

  it('lists plans side by side, the recommended one flagged in words', () => {
    expect(html).toContain('data-highlighted="true"')
    expect(html).toContain('<p class="cd-plans__flag">Recommended</p>')
  })

  it('prints each price and its interval', () => {
    expect(html).toContain(
      '<span class="cd-plans__amount">$999</span><span class="cd-plans__interval">/month</span>',
    )
  })

  it('lists what each plan includes and ends on its action', () => {
    expect(html).toContain('<li class="cd-plans__feature">Priority triage</li>')
    expect(html).toContain('Talk to us')
  })
})

describe('quote and testimonial', () => {
  it('attributes a quote with its author and role', () => {
    const html = serialize(renderQuote(BLOCKS.quote, ctx))
    expect(html).toContain('<blockquote class="cd-quote__body">')
    expect(html).toContain('<span class="cd-person__name" data-field="author">A. Reader</span>')
    expect(html).toContain('cd-person__avatar')
  })

  it('renders a quote without attribution as the quotation alone', () => {
    const html = serialize(
      renderQuote({ _key: 'q', _type: 'quote', _version: '1.0.0', text: 'Ship it.' }, ctx),
    )
    expect(html).not.toContain('figcaption')
  })

  it('renders a testimonial’s rich text and its attribution', () => {
    const html = serialize(renderTestimonial(BLOCKS.testimonial, ctx))
    expect(html).toContain('<strong>every question</strong>')
    expect(html).toContain('Platform engineer, Globex')
  })
})

describe('stats and statCounter', () => {
  it('prints each figure with its unit, the label first in the markup', () => {
    const html = serialize(renderStats(BLOCKS.stats, ctx))
    expect(html).toContain(
      '<dt class="cd-figures__label">Guides with a runnable example</dt><dd class="cd-figures__value"><span class="cd-figures__number">96</span><span class="cd-figures__unit">%</span></dd>',
    )
  })

  it('omits an absent unit', () => {
    const html = serialize(renderStats(BLOCKS.stats, ctx))
    expect(html.match(/cd-figures__unit/g)).toHaveLength(1)
  })

  it('prints counters in the same ruled register, without units', () => {
    const html = serialize(renderStatCounter(BLOCKS.statCounter, ctx))
    expect(html).toContain('<span class="cd-figures__number">140+</span>')
    expect(html).toContain('data-block="statCounter"')
    expect(html).not.toContain('cd-figures__unit')
  })
})
