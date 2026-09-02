/**
 * Fiche 22 tâche 3 — widget order and visibility on the dashboard.
 *
 * A display preference, per person and per browser, never a site setting: it
 * lives in `localStorage` and nowhere near the server, the same boundary
 * `table-prefs`-style screens in this admin already draw for "which columns
 * do I see". `storedEditorMode` in `entry-edit.tsx` is the pattern this
 * copies — a `try`/`catch` around every access, because a browser with
 * storage denied (private mode, a locked-down profile) must still get a
 * working dashboard, just not a memory of how it was arranged.
 */

const STORAGE_KEY = 'cogenta.dashboard.widgets.v1'

/** Every widget the dashboard can show, in the order a fresh install shows them. */
export const DASHBOARD_WIDGET_IDS = [
  'summary',
  'health',
  'activity',
  'analytics',
  'scheduled',
  'todo',
  'shortcuts',
  'backups',
] as const

export type DashboardWidgetId = (typeof DASHBOARD_WIDGET_IDS)[number]

export interface DashboardPrefs {
  /** Every known widget id, in display order. */
  readonly order: readonly DashboardWidgetId[]
  /** The subset of `order` that is hidden. */
  readonly hidden: ReadonlySet<DashboardWidgetId>
  /**
   * The subset of `order` whose card stays on the dashboard, in place, but
   * with its body content collapsed — distinct from `hidden`, which removes
   * a widget from the dashboard entirely.
   */
  readonly collapsed: ReadonlySet<DashboardWidgetId>
}

function defaults(): DashboardPrefs {
  return { order: DASHBOARD_WIDGET_IDS, hidden: new Set(), collapsed: new Set() }
}

function isWidgetId(value: unknown): value is DashboardWidgetId {
  return typeof value === 'string' && (DASHBOARD_WIDGET_IDS as readonly string[]).includes(value)
}

/**
 * Reads and repairs stored prefs, rather than trusting them.
 *
 * A widget id this version no longer knows (a stale entry from a build that
 * had one more, or hand-edited storage) is dropped; a widget id this version
 * added since the preference was saved is appended at the end, visible by
 * default — a newly shipped widget must not silently start out hidden for
 * everyone who already customised their dashboard.
 */
export function loadDashboardPrefs(): DashboardPrefs {
  let raw: string | null
  try {
    raw = localStorage.getItem(STORAGE_KEY)
  } catch {
    return defaults()
  }
  if (raw === null) return defaults()

  try {
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return defaults()
    const record = parsed as { order?: unknown; hidden?: unknown; collapsed?: unknown }

    const storedOrder = Array.isArray(record.order) ? record.order.filter(isWidgetId) : []
    const missing = DASHBOARD_WIDGET_IDS.filter((id) => !storedOrder.includes(id))
    const order = [...storedOrder, ...missing]

    const storedHidden = Array.isArray(record.hidden) ? record.hidden.filter(isWidgetId) : []
    const storedCollapsed = Array.isArray(record.collapsed)
      ? record.collapsed.filter(isWidgetId)
      : []
    return { order, hidden: new Set(storedHidden), collapsed: new Set(storedCollapsed) }
  } catch {
    return defaults()
  }
}

export function saveDashboardPrefs(prefs: DashboardPrefs): void {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        order: prefs.order,
        hidden: [...prefs.hidden],
        collapsed: [...prefs.collapsed],
      }),
    )
  } catch {
    // Storage denied: the reordering still applies to this render, it just
    // will not survive a reload — the same trade-off `storedEditorMode` makes.
  }
}

export function resetDashboardPrefs(): DashboardPrefs {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Nothing to undo if storage was never reachable.
  }
  return defaults()
}

/** Moves `id` one place towards the start (`'up'`) or the end (`'down'`) of `order`. */
export function moveWidget(
  order: readonly DashboardWidgetId[],
  id: DashboardWidgetId,
  direction: 'up' | 'down',
): readonly DashboardWidgetId[] {
  const index = order.indexOf(id)
  const target = direction === 'up' ? index - 1 : index + 1
  if (index === -1 || target < 0 || target >= order.length) return order

  const next = [...order]
  const swap = next[target] as DashboardWidgetId
  next[target] = next[index] as DashboardWidgetId
  next[index] = swap
  return next
}

/** Moves `id` to just before whatever sits at `beforeId` — the drop side of drag-and-drop. */
export function reorderWidget(
  order: readonly DashboardWidgetId[],
  id: DashboardWidgetId,
  beforeId: DashboardWidgetId,
): readonly DashboardWidgetId[] {
  if (id === beforeId) return order
  const withoutId = order.filter((candidate) => candidate !== id)
  const targetIndex = withoutId.indexOf(beforeId)
  if (targetIndex === -1) return order

  const next = [...withoutId]
  next.splice(targetIndex, 0, id)
  return next
}
