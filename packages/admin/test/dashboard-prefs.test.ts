import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DASHBOARD_WIDGET_IDS,
  loadDashboardPrefs,
  moveWidget,
  reorderWidget,
  resetDashboardPrefs,
  saveDashboardPrefs,
} from '../src/lib/dashboard-prefs.js'

describe('dashboard widget preferences (fiche 22 tâche 3)', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('starts with every widget visible, in the shipped order', () => {
    const prefs = loadDashboardPrefs()
    expect(prefs.order).toEqual(DASHBOARD_WIDGET_IDS)
    expect(prefs.hidden.size).toBe(0)
  })

  it('remembers a saved order and hidden set', () => {
    saveDashboardPrefs({ order: [...DASHBOARD_WIDGET_IDS].reverse(), hidden: new Set(['health']) })
    const prefs = loadDashboardPrefs()
    expect(prefs.order).toEqual([...DASHBOARD_WIDGET_IDS].reverse())
    expect(prefs.hidden.has('health')).toBe(true)
  })

  it('drops a widget id this version no longer knows about', () => {
    localStorage.setItem(
      'cogenta.dashboard.widgets.v1',
      JSON.stringify({ order: [...DASHBOARD_WIDGET_IDS, 'retired-widget'], hidden: [] }),
    )
    const prefs = loadDashboardPrefs()
    expect(prefs.order).not.toContain('retired-widget')
    expect(prefs.order).toHaveLength(DASHBOARD_WIDGET_IDS.length)
  })

  it('appends a widget id this version added since the preference was saved, visible by default', () => {
    const partial = DASHBOARD_WIDGET_IDS.slice(0, 3)
    localStorage.setItem(
      'cogenta.dashboard.widgets.v1',
      JSON.stringify({ order: partial, hidden: [] }),
    )
    const prefs = loadDashboardPrefs()
    expect(prefs.order).toHaveLength(DASHBOARD_WIDGET_IDS.length)
    for (const id of DASHBOARD_WIDGET_IDS) expect(prefs.order).toContain(id)
    expect(prefs.hidden.size).toBe(0)
  })

  it('resets to the shipped defaults, clearing storage', () => {
    saveDashboardPrefs({ order: [...DASHBOARD_WIDGET_IDS].reverse(), hidden: new Set(['health']) })
    const reset = resetDashboardPrefs()
    expect(reset.order).toEqual(DASHBOARD_WIDGET_IDS)
    expect(reset.hidden.size).toBe(0)
    expect(loadDashboardPrefs().order).toEqual(DASHBOARD_WIDGET_IDS)
  })

  it('works with no memory at all when storage is denied', () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('denied')
    })
    try {
      expect(loadDashboardPrefs().order).toEqual(DASHBOARD_WIDGET_IDS)
    } finally {
      spy.mockRestore()
    }
  })

  it('does not throw when storage refuses a write', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('denied')
    })
    try {
      expect(() =>
        saveDashboardPrefs({ order: DASHBOARD_WIDGET_IDS, hidden: new Set() }),
      ).not.toThrow()
    } finally {
      spy.mockRestore()
    }
  })

  it('moveWidget swaps a widget with its neighbour, and refuses to walk off either end', () => {
    const order = ['summary', 'health', 'activity'] as const
    expect(moveWidget(order, 'health', 'up')).toEqual(['health', 'summary', 'activity'])
    expect(moveWidget(order, 'health', 'down')).toEqual(['summary', 'activity', 'health'])
    expect(moveWidget(order, 'summary', 'up')).toEqual(order)
    expect(moveWidget(order, 'activity', 'down')).toEqual(order)
  })

  it('reorderWidget moves a dragged widget to just before its drop target', () => {
    const order = ['summary', 'health', 'activity', 'analytics'] as const
    expect(reorderWidget(order, 'analytics', 'health')).toEqual([
      'summary',
      'analytics',
      'health',
      'activity',
    ])
  })
})
