import { describe, expect, it } from 'vitest'
import {
  ADMIN_THEME_FONTS,
  ADMIN_THEME_TEMPLATES,
  adminThemeFontById,
  adminThemeOverridesSchema,
  adminThemeTemplateById,
  DEFAULT_ADMIN_THEME_TEMPLATE_ID,
} from '../../src/store/admin-theme-templates.js'

describe('admin theme templates', () => {
  it('ships exactly the two built-ins the task names, each with a light and dark scheme', () => {
    expect(ADMIN_THEME_TEMPLATES.map((template) => template.id).sort()).toEqual([
      'atelier',
      'nightops',
    ])
    for (const template of ADMIN_THEME_TEMPLATES) {
      expect(Object.keys(template.light).length).toBe(Object.keys(template.dark).length)
      expect(adminThemeFontById(template.fontDisplay)).toBeDefined()
      expect(adminThemeFontById(template.fontBody)).toBeDefined()
    }
  })

  it('the default template id resolves to a real built-in', () => {
    expect(adminThemeTemplateById(DEFAULT_ADMIN_THEME_TEMPLATE_ID)).toBeDefined()
  })

  it('adminThemeTemplateById answers undefined for an unknown id, never throws', () => {
    expect(adminThemeTemplateById('unknown')).toBeUndefined()
  })

  it('every font option is self-hosted (no external host in its family stack)', () => {
    for (const font of ADMIN_THEME_FONTS) {
      expect(font.family).not.toMatch(/fonts\.googleapis|fonts\.gstatic|https?:\/\//u)
    }
  })

  it('the overrides schema accepts an empty object — a template with no personalisation at all', () => {
    expect(adminThemeOverridesSchema.parse({})).toEqual({})
  })

  it('the overrides schema rejects an unknown key rather than silently dropping it', () => {
    expect(adminThemeOverridesSchema.safeParse({ headerHeightPx: 64 }).success).toBe(false)
  })
})
