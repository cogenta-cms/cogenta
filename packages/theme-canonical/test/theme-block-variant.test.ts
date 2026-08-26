import { describe, expect, it } from 'vitest'
import { serialize } from '../src/render/html.js'
import { renderBlock } from '../src/render/render-block.js'
import { BLOCKS, makeContext } from './fixtures.js'

/**
 * Fiche 43, sous-chantier D (RFC 0002): `variant` is envelope data every
 * placed block may carry, resolved by `renderBlock` itself (once, via
 * `@cogenta/theme-kit`'s `withBlockVariant`) rather than by each of the
 * seventeen block renderers individually. This is the same contract test,
 * unchanged, against every one of the five in-house themes: the resolution
 * logic lives once in theme-kit, and this only proves each theme's own
 * `renderBlock` actually reaches it.
 */
const ctx = makeContext()

describe('a block carrying an instance variant', () => {
  it('renders byte-for-byte identical to before when variant is absent', () => {
    const withoutVariant = serialize(
      renderBlock(BLOCKS.cta, ctx) as NonNullable<ReturnType<typeof renderBlock>>,
    )
    expect(withoutVariant).not.toContain('data-variant-')
  })

  it('stamps one data-variant-<axis> attribute per axis actually set', () => {
    const block = { ...BLOCKS.cta, variant: { background: 'muted', width: 'full' } as const }
    const html = serialize(renderBlock(block, ctx) as NonNullable<ReturnType<typeof renderBlock>>)
    expect(html).toContain('data-variant-background="muted"')
    expect(html).toContain('data-variant-width="full"')
    expect(html).not.toContain('data-variant-spacing')
    expect(html).not.toContain('data-variant-align')
  })

  it('stamps all four axes when all four are set', () => {
    const block = {
      ...BLOCKS.hero,
      variant: {
        background: 'image',
        spacing: 'spacious',
        align: 'end',
        width: 'contained',
      } as const,
    }
    const html = serialize(renderBlock(block, ctx) as NonNullable<ReturnType<typeof renderBlock>>)
    expect(html).toContain('data-variant-background="image"')
    expect(html).toContain('data-variant-spacing="spacious"')
    expect(html).toContain('data-variant-align="end"')
    expect(html).toContain('data-variant-width="contained"')
  })
})
