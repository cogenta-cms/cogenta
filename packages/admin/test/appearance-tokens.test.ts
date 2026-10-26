import {
  CONTRAST_PAIRS,
  compositeOver,
  contrastRatio,
  meetsContrastAa,
  parseColor,
} from '@cogenta/render/browser'
import { describe, expect, it } from 'vitest'
import { PALETTE_PRESETS } from '../src/lib/appearance-palettes.js'
import {
  bundledFonts,
  CUSTOM_VALUE,
  EASING_PRESETS,
  fontChoice,
  fontStack,
  formatDuration,
  formatLength,
  parseDurationMs,
  parseLength,
  presetChoice,
  SHADOW_PRESETS,
  SYSTEM_FONT,
  systemFontStack,
  toHexColor,
} from '../src/lib/appearance-tokens.js'

describe('site appearance token helpers', () => {
  it('offers only the fonts the site serves itself, so a choice always renders', () => {
    const families = bundledFonts().map((font) => font.family)
    expect(families).toContain('Fraunces')
    expect(families).toContain('Geist')
    // Playfair Display is in the catalogue but needs the remote-fonts setting.
    expect(families).not.toContain('Playfair Display')
  })

  it('round-trips a font choice through its stored stack', () => {
    expect(fontChoice(fontStack('Fraunces', 'serif'), 'serif')).toBe('Fraunces')
    expect(fontChoice(systemFontStack('sans'), 'sans')).toBe(SYSTEM_FONT)
    expect(fontChoice("'Comic Neue', cursive", 'sans')).toBe(CUSTOM_VALUE)
    expect(fontChoice(undefined, 'mono')).toBe(SYSTEM_FONT)
  })

  it('reads and writes a length without losing its unit', () => {
    expect(parseLength('0.0625rem')).toEqual({ amount: 0.0625, unit: 'rem' })
    expect(parseLength('12px')).toEqual({ amount: 12, unit: 'px' })
    expect(parseLength('calc(1rem + 2px)')).toBeNull()
    expect(formatLength(0.25, 'rem')).toBe('0.25rem')
  })

  it('reads a duration in milliseconds from either unit', () => {
    expect(parseDurationMs('140ms')).toBe(140)
    expect(parseDurationMs('0.2s')).toBe(200)
    expect(parseDurationMs('fast')).toBeNull()
    expect(formatDuration(140.4)).toBe('140ms')
  })

  it('recognises the stored easing and shadow values as presets, ignoring spacing', () => {
    expect(presetChoice('cubic-bezier(0.2,0,0,1)', EASING_PRESETS)).toBe('standard')
    expect(presetChoice('0 1px 0 rgba(12, 15, 20, 0.06)', SHADOW_PRESETS.sm)).toBe('line')
    expect(presetChoice('0 0 0 3px red', SHADOW_PRESETS.sm)).toBe(CUSTOM_VALUE)
  })

  it('gives a native colour input a plain hex, or nothing for a colour it cannot express', () => {
    expect(toHexColor('#0C0F14')).toBe('#0c0f14')
    expect(toHexColor('rgb(255, 0, 0)')).toBe('#ff0000')
    expect(toHexColor('not a colour')).toBeNull()
  })
})

describe('ready-made palettes', () => {
  it.each(PALETTE_PRESETS.map((preset) => [preset.id, preset] as const))(
    'the %s palette passes WCAG AA on every pair the server checks',
    (_id, preset) => {
      for (const pair of CONTRAST_PAIRS) {
        const fg = parseColor(preset.colors[pair.foreground])
        const bg = parseColor(preset.colors[pair.background])
        expect(fg).not.toBeNull()
        expect(bg).not.toBeNull()
        if (fg === null || bg === null) continue
        const resolved = fg.a >= 1 ? fg : compositeOver(fg, bg)
        expect(
          meetsContrastAa(contrastRatio(resolved, bg), pair.size),
          `${preset.id}: ${pair.foreground} on ${pair.background}`,
        ).toBe(true)
      }
    },
  )
})
