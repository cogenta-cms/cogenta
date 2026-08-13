import { describe, expect, it } from 'vitest'
import { cssVariableName, renderSkinCss, TOKEN_SPECS, validateSkin } from '../../src/skin/index.js'
import { skin, VALID_SKIN } from './fixtures.js'

const css = renderSkinCss(VALID_SKIN)

describe('rendering tokens to CSS', () => {
  it('emits one custom property per token, under :root', () => {
    expect(css).toContain(':root {')
    for (const spec of TOKEN_SPECS) {
      expect(css).toContain(`${cssVariableName(spec.group, spec.name)}:`)
    }
  })

  it('names variables --cogenta-<group>-<name>, kebab-cased', () => {
    expect(css).toContain('--cogenta-color-accent-fg: #ffffff;')
    expect(css).toContain('--cogenta-font-base-size: 1rem;')
    expect(css).toContain('--cogenta-space-density: comfortable;')
  })

  it('exposes the typographic ladder the scale ratio implies', () => {
    expect(css).toContain('--cogenta-font-size-md: 1rem;')
    expect(css).toContain('--cogenta-font-size-lg: 1.25rem;')
    expect(css).toContain('--cogenta-font-size-sm: 0.8rem;')
  })

  it('turns density into a multiplier a theme can compute with', () => {
    expect(css).toContain('--cogenta-space-scale: 1;')
    expect(
      renderSkinCss({ ...VALID_SKIN, space: { unit: '0.25rem', density: 'compact' } }),
    ).toContain('--cogenta-space-scale: 0.75;')
  })

  it('honours prefers-reduced-motion in the sheet itself, not just in the token', () => {
    expect(css).toContain('@media (prefers-reduced-motion: reduce)')
    const reduced = css.slice(css.indexOf('@media'))
    expect(reduced).toContain('--cogenta-motion-duration: 0ms;')
    expect(reduced).toContain('--cogenta-motion-easing: linear;')
  })

  it('scopes to a custom selector when a preview asks for one', () => {
    const scoped = renderSkinCss(VALID_SKIN, { selector: '[data-skin="preview"]' })
    expect(scoped).toContain('[data-skin="preview"] {')
    expect(scoped).not.toContain(':root {')
  })

  it('is byte-stable for the same tokens, so the ETag is stable', () => {
    expect(renderSkinCss(VALID_SKIN)).toBe(css)
  })

  it('contains no declaration a token value could have injected', () => {
    // Values are validated before rendering, so the sheet can only ever hold
    // the declarations this module wrote.
    const declarations = css.split('\n').filter((line) => line.trim().startsWith('--cogenta-'))
    expect(declarations.every((line) => /^\s*--cogenta-[a-z0-9-]+: [^;]+;$/.test(line))).toBe(true)
  })

  it('renders a skin that was just validated from raw JSON', () => {
    const tokens = validateSkin(skin())
    expect(renderSkinCss(tokens)).toBe(css)
  })
})
