import { describe, expect, it } from 'vitest'
import type { SiteSetting } from '../src/api/settings-client.js'
import type { NavGroupId, NavItem } from '../src/shell/nav-items.js'
import {
  applyNavLayout,
  EMPTY_NAV_LAYOUT_OVERRIDES,
  parseNavLayoutOverrides,
  serialiseNavLayoutOverrides,
} from '../src/shell/nav-layout.js'
import type { VisibleNavGroup } from '../src/shell/nav-visibility.js'

/**
 * Fiche 22 tâche 8, part 3 — the pure logic behind site-wide sidebar
 * reordering/hiding (`navigation.*`, `site-settings-registry.ts`), tested
 * independently of the settings screen and of `AppShell` (both covered
 * separately, against a real rendered sidebar).
 */

function setting(key: string, value: unknown): SiteSetting {
  return {
    key,
    group: 'navigation',
    order: 0,
    uiType: 'string',
    options: undefined,
    scope: 'site',
    locale: null,
    value,
    isDefault: false,
    updatedAt: null,
    updatedBy: null,
  }
}

function item(to: string, group: NavGroupId): NavItem {
  return { to, labelKey: `label:${to}`, group, visibleWhen: { kind: 'always' } }
}

function group(id: NavGroupId, items: readonly NavItem[]): VisibleNavGroup {
  return { id, labelKey: `group:${id}`, openByDefault: true, items }
}

describe('parseNavLayoutOverrides', () => {
  it('answers no overrides at all for a site that has never customised its nav', () => {
    expect(parseNavLayoutOverrides([])).toEqual(EMPTY_NAV_LAYOUT_OVERRIDES)
  })

  it('reads a real, known group id and item path', () => {
    const overrides = parseNavLayoutOverrides([
      setting('navigation.hiddenSections', 'commerce'),
      setting('navigation.sectionOrder', 'settings, content'),
      setting('navigation.hiddenItems', '/media'),
      setting('navigation.itemOrder', '/collections, /media'),
    ])
    expect(overrides.hiddenSections).toEqual(['commerce'])
    expect(overrides.sectionOrder).toEqual(['settings', 'content'])
    expect(overrides.hiddenItems).toEqual(['/media'])
    expect(overrides.itemOrder).toEqual(['/collections', '/media'])
  })

  it('drops a token this build no longer declares, rather than trusting it', () => {
    const overrides = parseNavLayoutOverrides([
      setting('navigation.hiddenSections', 'commerce,a-retired-group'),
      setting('navigation.hiddenItems', '/media,/a-retired-screen'),
    ])
    expect(overrides.hiddenSections).toEqual(['commerce'])
    expect(overrides.hiddenItems).toEqual(['/media'])
  })

  it('drops a duplicate token', () => {
    const overrides = parseNavLayoutOverrides([
      setting('navigation.hiddenSections', 'commerce,commerce'),
    ])
    expect(overrides.hiddenSections).toEqual(['commerce'])
  })

  it('treats an empty or unset value as no override', () => {
    const overrides = parseNavLayoutOverrides([setting('navigation.hiddenSections', '')])
    expect(overrides.hiddenSections).toEqual([])
  })
})

describe('serialiseNavLayoutOverrides', () => {
  it('round-trips through parseNavLayoutOverrides', () => {
    const overrides = {
      sectionOrder: ['settings', 'content'],
      hiddenSections: ['commerce'],
      itemOrder: ['/collections', '/media'],
      hiddenItems: ['/media'],
    }
    const serialised = serialiseNavLayoutOverrides(overrides)
    const parsed = parseNavLayoutOverrides([
      setting('navigation.sectionOrder', serialised.sectionOrder),
      setting('navigation.hiddenSections', serialised.hiddenSections),
      setting('navigation.itemOrder', serialised.itemOrder),
      setting('navigation.hiddenItems', serialised.hiddenItems),
    ])
    expect(parsed).toEqual(overrides)
  })
})

describe('applyNavLayout', () => {
  const contentItems = [item('/collections', 'content'), item('/media', 'content')]
  const commerceItems = [item('/commerce/products', 'commerce')]
  const groups: readonly VisibleNavGroup[] = [
    group('content', contentItems),
    group('commerce', commerceItems),
  ]

  it('changes nothing at all with no overrides', () => {
    expect(applyNavLayout(groups, EMPTY_NAV_LAYOUT_OVERRIDES)).toEqual(groups)
  })

  it('drops a hidden section entirely', () => {
    const result = applyNavLayout(groups, {
      ...EMPTY_NAV_LAYOUT_OVERRIDES,
      hiddenSections: ['commerce'],
    })
    expect(result.map((g) => g.id)).toEqual(['content'])
  })

  it('drops a hidden item while keeping the rest of its section', () => {
    const result = applyNavLayout(groups, {
      ...EMPTY_NAV_LAYOUT_OVERRIDES,
      hiddenItems: ['/media'],
    })
    const content = result.find((g) => g.id === 'content')
    expect(content?.items.map((i) => i.to)).toEqual(['/collections'])
  })

  it('drops a section that has zero items left once hiding is applied', () => {
    const result = applyNavLayout(groups, {
      ...EMPTY_NAV_LAYOUT_OVERRIDES,
      hiddenItems: ['/commerce/products'],
    })
    expect(result.map((g) => g.id)).toEqual(['content'])
  })

  it('reorders sections per the chosen order, appending anything unmentioned', () => {
    const result = applyNavLayout(groups, {
      ...EMPTY_NAV_LAYOUT_OVERRIDES,
      sectionOrder: ['commerce'],
    })
    expect(result.map((g) => g.id)).toEqual(['commerce', 'content'])
  })

  it('reorders items within their own section only', () => {
    const result = applyNavLayout(groups, {
      ...EMPTY_NAV_LAYOUT_OVERRIDES,
      itemOrder: ['/media', '/collections'],
    })
    const content = result.find((g) => g.id === 'content')
    expect(content?.items.map((i) => i.to)).toEqual(['/media', '/collections'])
  })

  it('never lets a permission-filtered group back in, no matter the reorder', () => {
    // `groups` never included a group this actor cannot see in the first
    // place (`visibleNavGroups` already dropped it) — reordering a group id
    // that simply is not in the input has no effect, proving this layer
    // adds no visibility of its own.
    const result = applyNavLayout(groups, {
      ...EMPTY_NAV_LAYOUT_OVERRIDES,
      sectionOrder: ['ai', 'content'],
    })
    expect(result.map((g) => g.id)).toEqual(['content', 'commerce'])
  })
})
