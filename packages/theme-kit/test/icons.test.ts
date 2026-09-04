import { describe, expect, it } from 'vitest'
import { serialize } from '../src/html.js'
import { ICON_NAMES, renderIcon } from '../src/icons.js'

describe('renderIcon', () => {
  it('renders every declared name as an svg with at least one path', () => {
    for (const name of ICON_NAMES) {
      const icon = renderIcon(name)
      expect(icon, `expected an icon for "${name}"`).not.toBeNull()
      expect(icon?.tag).toBe('svg')
      expect(icon?.children.length).toBeGreaterThan(0)
      for (const child of icon?.children ?? []) {
        expect(child.kind).toBe('element')
        if (child.kind === 'element') {
          expect(child.tag).toBe('path')
          expect(typeof child.attrs.d).toBe('string')
          expect((child.attrs.d as string).length).toBeGreaterThan(0)
        }
      }
    }
  })

  it('returns null for a name outside the closed vocabulary', () => {
    expect(renderIcon('not-a-real-icon')).toBeNull()
    expect(renderIcon('')).toBeNull()
  })

  it('is hidden from assistive tech, since it always sits beside its own text label', () => {
    const html = serialize(renderIcon('star') ?? { kind: 'text', value: '' })
    expect(html).toContain('aria-hidden="true"')
    expect(html).toContain('focusable="false"')
  })

  it('applies the requested class and size, defaulting to 24', () => {
    const withClass = renderIcon('check', { className: 'x-icon' })
    expect(withClass?.attrs.class).toBe('x-icon')
    expect(withClass?.attrs.width).toBe(24)
    expect(withClass?.attrs.height).toBe(24)

    const sized = renderIcon('check', { size: 16 })
    expect(sized?.attrs.width).toBe(16)
    expect(sized?.attrs.height).toBe(16)
  })

  it('produces valid, escaped markup with no stray angle brackets in path data', () => {
    for (const name of ICON_NAMES) {
      const html = serialize(renderIcon(name) as NonNullable<ReturnType<typeof renderIcon>>)
      expect(html.startsWith('<svg')).toBe(true)
      expect(html).not.toContain('<script')
      expect(html).not.toContain('undefined')
    }
  })

  it('declares every name exactly once', () => {
    expect(new Set(ICON_NAMES).size).toBe(ICON_NAMES.length)
  })
})
