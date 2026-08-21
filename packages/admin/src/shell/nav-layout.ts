import type { SiteSetting } from '../api/settings-client.js'
import { NAV_GROUPS, NAV_ITEMS } from './nav-items.js'
import type { VisibleNavGroup } from './nav-visibility.js'

/**
 * Fiche 22 tâche 8, part 3 — site-wide sidebar reordering and hiding, on top
 * of `nav-visibility.ts`'s permission-driven filter. Deliberately a second,
 * later pass rather than a new `NavCondition` kind: permission visibility
 * answers "can this actor ever see this", or a `boolean`, this answers "did
 * an admin choose to hide it anyway, for everyone" — the two questions stay
 * independent, and an actor who genuinely cannot read a collection still
 * never sees its nav entry no matter what this layer says.
 *
 * Storage is four comma-separated lists (`navigation.sectionOrder` /
 * `hiddenSections` / `itemOrder` / `hiddenItems`, `site-settings-registry.ts`)
 * rather than one nested structure — the same reason `content.
 * newEntryDefaultBlocks` is a flat string: `@cogenta/schema` cannot import
 * `@cogenta/admin`'s own `nav-items.ts` to validate a real group or item id,
 * so the registry only shapes the string and this module is the one place
 * that actually knows the vocabulary and filters out a stale or invented
 * token.
 */

export interface NavLayoutOverrides {
  /** Group ids, in the order an admin chose. A group this does not mention keeps its shipped position, appended after every mentioned one. */
  readonly sectionOrder: readonly string[]
  /** Group ids hidden for everyone, regardless of what permissions would otherwise show. */
  readonly hiddenSections: readonly string[]
  /** Item `to` paths, in the order an admin chose, read as one flat list across every group. */
  readonly itemOrder: readonly string[]
  /** Item `to` paths hidden for everyone. */
  readonly hiddenItems: readonly string[]
}

/** No override at all — every group/item keeps the order and visibility `nav-items.ts` ships with. */
export const EMPTY_NAV_LAYOUT_OVERRIDES: NavLayoutOverrides = {
  sectionOrder: [],
  hiddenSections: [],
  itemOrder: [],
  hiddenItems: [],
}

const KNOWN_GROUP_IDS = new Set(NAV_GROUPS.map((group) => group.id))
const KNOWN_ITEM_PATHS = new Set(NAV_ITEMS.map((item) => item.to))

function parseTokenList(value: unknown, known: ReadonlySet<string>): readonly string[] {
  if (typeof value !== 'string' || value.trim() === '') return []
  const seen = new Set<string>()
  const tokens: string[] = []
  for (const raw of value.split(',')) {
    const token = raw.trim()
    // Drops a token this build no longer declares (a renamed/removed screen)
    // and a duplicate — the same "repair rather than trust" discipline
    // `dashboard-prefs.ts`'s `loadDashboardPrefs` already applies to its own
    // stored order.
    if (token === '' || !known.has(token) || seen.has(token)) continue
    seen.add(token)
    tokens.push(token)
  }
  return tokens
}

/** Reads the four settings out of a `GET /api/settings` response — `[]`/`EMPTY_NAV_LAYOUT_OVERRIDES` for a site that has never customised its nav. */
export function parseNavLayoutOverrides(settings: readonly SiteSetting[]): NavLayoutOverrides {
  const byKey = new Map(settings.map((setting) => [setting.key, setting.value]))
  return {
    sectionOrder: parseTokenList(byKey.get('navigation.sectionOrder'), KNOWN_GROUP_IDS),
    hiddenSections: parseTokenList(byKey.get('navigation.hiddenSections'), KNOWN_GROUP_IDS),
    itemOrder: parseTokenList(byKey.get('navigation.itemOrder'), KNOWN_ITEM_PATHS),
    hiddenItems: parseTokenList(byKey.get('navigation.hiddenItems'), KNOWN_ITEM_PATHS),
  }
}

/** The inverse of `parseNavLayoutOverrides` — what `writeSetting` sends back for each of the four keys. */
export function serialiseNavLayoutOverrides(
  overrides: NavLayoutOverrides,
): Readonly<Record<'sectionOrder' | 'hiddenSections' | 'itemOrder' | 'hiddenItems', string>> {
  return {
    sectionOrder: overrides.sectionOrder.join(','),
    hiddenSections: overrides.hiddenSections.join(','),
    itemOrder: overrides.itemOrder.join(','),
    hiddenItems: overrides.hiddenItems.join(','),
  }
}

/**
 * `known`, ordered by `preferred` first (only the ids `known` actually has,
 * each at most once), then whatever `known` had left, in its own original
 * order. Exported for the Réglages › Navigation screen (`settings.tsx`),
 * which reorders the *full*, unfiltered `NAV_GROUPS`/`NAV_ITEMS` for editing
 * — an admin configuring "hide Boutique" has to see Boutique in the list
 * regardless of whether the signed-in account previewing the screen would
 * currently be shown it by `visibleNavGroups`.
 */
export function reorderByKey<T>(
  known: readonly T[],
  key: (item: T) => string,
  preferred: readonly string[],
): readonly T[] {
  const byKey = new Map(known.map((item) => [key(item), item]))
  const usedKeys = new Set<string>()
  const front: T[] = []
  for (const id of preferred) {
    const item = byKey.get(id)
    if (item === undefined || usedKeys.has(id)) continue
    usedKeys.add(id)
    front.push(item)
  }
  const rest = known.filter((item) => !usedKeys.has(key(item)))
  return [...front, ...rest]
}

/**
 * Applies a site's chosen order and hidden set on top of `visibleNavGroups`'s
 * already permission-filtered result. Order: reorder the visible groups,
 * then within each, drop its hidden items and reorder what remains — a group
 * left with zero items after hiding is dropped entirely, the same rule
 * `visibleNavGroups` itself already applies for a permission-driven empty
 * group (a shop-less site's "Boutique" heading disappearing, not rendering
 * empty).
 */
export function applyNavLayout(
  groups: readonly VisibleNavGroup[],
  overrides: NavLayoutOverrides,
): readonly VisibleNavGroup[] {
  const hiddenSections = new Set(overrides.hiddenSections)
  const hiddenItems = new Set(overrides.hiddenItems)

  const filtered = groups
    .filter((group) => !hiddenSections.has(group.id))
    .map((group) => ({
      ...group,
      items: reorderByKey(
        group.items.filter((item) => !hiddenItems.has(item.to)),
        (item) => item.to,
        overrides.itemOrder,
      ),
    }))
    .filter((group) => group.items.length > 0)

  return reorderByKey(filtered, (group) => group.id, overrides.sectionOrder)
}
